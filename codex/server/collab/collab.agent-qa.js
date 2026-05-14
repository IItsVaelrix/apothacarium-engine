/**
 * collab.agent-qa.js — ByteCode QA: Duplicate Agent Detection & Session Hygiene
 *
 * Responsibility: Self-sustaining scan that detects duplicate agent registrations
 * (same name+role, different IDs), auto-resolves by evicting stale duplicates,
 * and emits PB-ERR bytecodes for each violation found.
 *
 * Category codes:
 *   AGENT_DUPE   — Multiple live agents with the same name+role identity
 *   AGENT_GHOST  — Agent record is stale/offline but holds locks or active tasks
 *
 * Self-sustain: called on agent register, heartbeat, and every SWEEP_INTERVAL_MS.
 */

import { collabPersistence } from './collab.persistence.js';

const SWEEP_INTERVAL_MS = 60 * 1000;       // background sweep every 60s
const STALE_THRESHOLD_MS = 5 * 60 * 1000;  // 5 min without heartbeat = stale

// ─── Bytecode ────────────────────────────────────────────────────────────────

function makeBytecode(category, severity, module, code, context) {
    const contextB64 = Buffer.from(JSON.stringify(context)).toString('base64');
    const stem = `PB-ERR-v1-${category}-${severity}-${module}-${code}-${contextB64}`;
    let checksum = 0;
    for (let i = 0; i < stem.length; i++) {
        checksum = (checksum + stem.charCodeAt(i)) % 0xffff;
    }
    return `${stem}-${checksum.toString(16).toUpperCase().padStart(4, '0')}`;
}

// ─── Duplicate detection ─────────────────────────────────────────────────────

/**
 * Group agents by normalised name+role key.
 * Returns Map<key, agent[]> — only groups with >1 member.
 */
function findDuplicateGroups(agents) {
    const groups = new Map();
    for (const agent of agents) {
        const key = `${agent.name.trim().toLowerCase()}::${agent.role}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(agent);
    }
    const dupes = new Map();
    for (const [key, members] of groups) {
        if (members.length > 1) dupes.set(key, members);
    }
    return dupes;
}

/**
 * Determine if an agent is stale based on last_seen.
 */
function isStale(agent) {
    if (!agent.last_seen) return true;
    const raw = String(agent.last_seen).trim();
    const normalised = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
    const ms = Date.parse(normalised);
    if (!Number.isFinite(ms)) return true;
    return (Date.now() - ms) > STALE_THRESHOLD_MS;
}

/**
 * Within a duplicate group, pick the agent to keep:
 *   1. Prefer non-stale agents
 *   2. Among equals, prefer most-recently-seen
 */
function pickSurvivor(agents) {
    const sorted = [...agents].sort((a, b) => {
        const aStale = isStale(a) ? 1 : 0;
        const bStale = isStale(b) ? 1 : 0;
        if (aStale !== bStale) return aStale - bStale;
        const aMs = Date.parse(String(a.last_seen || '').replace(' ', 'T') + 'Z') || 0;
        const bMs = Date.parse(String(b.last_seen || '').replace(' ', 'T') + 'Z') || 0;
        return bMs - aMs;
    });
    return sorted[0];
}

// ─── Ghost agent detection ────────────────────────────────────────────────────

/**
 * Find agents that are stale/offline but still hold locks or own active tasks.
 */
function findGhostAgents(agents, locks, tasks) {
    const ghosts = [];
    const agentIds = new Set(agents.map(a => a.id));

    for (const agent of agents) {
        if (!isStale(agent) && agent.status !== 'offline') continue;

        const heldLocks = locks.filter(l => l.locked_by === agent.id);
        const activeTasks = tasks.filter(
            t => t.assigned_agent === agent.id && !['done', 'cancelled', 'backlog'].includes(t.status)
        );

        if (heldLocks.length > 0 || activeTasks.length > 0) {
            ghosts.push({ agent, heldLocks, activeTasks });
        }
    }

    // Also check for locks/tasks referencing deleted agent IDs
    const orphanLockAgents = new Set(
        locks.filter(l => !agentIds.has(l.locked_by)).map(l => l.locked_by)
    );
    const orphanTaskAgents = new Set(
        tasks
            .filter(t => t.assigned_agent && !agentIds.has(t.assigned_agent) && !['done', 'cancelled'].includes(t.status))
            .map(t => t.assigned_agent)
    );

    return { ghosts, orphanLockAgents, orphanTaskAgents };
}

// ─── Clean session ────────────────────────────────────────────────────────────

/**
 * Evict an agent: set offline, release locks, unassign tasks.
 * Does NOT delete — the record is kept for audit history.
 */
async function evictAgent(agentId) {
    await collabPersistence.agents.offline(agentId);
    const locksReleased = await collabPersistence.locks.releaseForAgent(agentId);
    const tasksUnassigned = await collabPersistence.agents.unassignTasks(agentId);
    return { locksReleased, tasksUnassigned };
}

/**
 * Full session cleanup for a known agent ID (used on disconnect/delete).
 * Releases locks + unassigns tasks atomically.
 */
export async function cleanAgentSession(agentId) {
    const locksReleased = await collabPersistence.locks.releaseForAgent(agentId);
    const tasksUnassigned = await collabPersistence.agents.unassignTasks(agentId);
    return { locksReleased, tasksUnassigned };
}

// ─── Main QA scan ─────────────────────────────────────────────────────────────

export async function runAgentQaScan({ autoResolve = true } = {}) {
    const agents = await collabPersistence.agents.getAllRaw();
    const locks = await collabPersistence.locks.getAll();
    const tasks = await collabPersistence.tasks.getAll({}, { limit: 500 });

    const violations = [];
    const resolutions = [];

    // ── 1. Duplicate agent groups ──────────────────────────────────────────────
    const dupeGroups = findDuplicateGroups(agents);

    for (const [key, members] of dupeGroups) {
        const survivor = pickSurvivor(members);
        const evictees = members.filter(a => a.id !== survivor.id);

        const bytecode = makeBytecode(
            'AGENT_DUPE', 'CRIT', 'PRESENCE', '0D01',
            {
                key,
                survivor: survivor.id,
                duplicates: evictees.map(a => a.id),
                count: members.length,
                reason: 'Multiple agents registered with the same name+role identity.',
            }
        );

        violations.push({
            type: 'AGENT_DUPE',
            bytecode,
            key,
            survivor: survivor.id,
            evictees: evictees.map(a => a.id),
        });

        if (autoResolve) {
            for (const evictee of evictees) {
                const cleanup = await evictAgent(evictee.id);
                resolutions.push({
                    action: 'evicted_duplicate',
                    agent_id: evictee.id,
                    survivor_id: survivor.id,
                    ...cleanup,
                });
            }
        }
    }

    // ── 2. Ghost agents (stale but holding resources) ─────────────────────────
    const { ghosts, orphanLockAgents, orphanTaskAgents } = findGhostAgents(agents, locks, tasks);

    for (const { agent, heldLocks, activeTasks } of ghosts) {
        const bytecode = makeBytecode(
            'AGENT_GHOST', 'WARN', 'PRESENCE', '0D02',
            {
                agentId: agent.id,
                heldLockCount: heldLocks.length,
                activeTaskCount: activeTasks.length,
                reason: 'Stale/offline agent retaining locks or active task assignments.',
            }
        );

        violations.push({
            type: 'AGENT_GHOST',
            bytecode,
            agent_id: agent.id,
            held_locks: heldLocks.length,
            active_tasks: activeTasks.length,
        });

        if (autoResolve) {
            const cleanup = await evictAgent(agent.id);
            resolutions.push({
                action: 'cleaned_ghost',
                agent_id: agent.id,
                ...cleanup,
            });
        }
    }

    // ── 3. Orphan locks (locked_by a deleted agent) ───────────────────────────
    for (const orphanId of orphanLockAgents) {
        const bytecode = makeBytecode(
            'AGENT_GHOST', 'WARN', 'LOCKS', '0D03',
            { agentId: orphanId, reason: 'Lock held by non-existent agent ID.' }
        );
        violations.push({ type: 'ORPHAN_LOCK', bytecode, agent_id: orphanId });
        if (autoResolve) {
            const locksReleased = await collabPersistence.locks.releaseForAgent(orphanId);
            resolutions.push({ action: 'released_orphan_locks', agent_id: orphanId, locksReleased });
        }
    }

    // ── 4. Orphan task assignments ────────────────────────────────────────────
    for (const orphanId of orphanTaskAgents) {
        const bytecode = makeBytecode(
            'AGENT_GHOST', 'WARN', 'TASKS', '0D04',
            { agentId: orphanId, reason: 'Task assigned to non-existent agent ID.' }
        );
        violations.push({ type: 'ORPHAN_TASK', bytecode, agent_id: orphanId });
        if (autoResolve) {
            const tasksUnassigned = await collabPersistence.agents.unassignTasks(orphanId);
            resolutions.push({ action: 'unassigned_orphan_tasks', agent_id: orphanId, tasksUnassigned });
        }
    }

    return {
        scanned_at: new Date().toISOString(),
        agent_count: agents.length,
        violation_count: violations.length,
        resolution_count: resolutions.length,
        clean: violations.length === 0,
        violations,
        resolutions,
    };
}

// ─── Background self-sustain sweep ───────────────────────────────────────────

let _sweepTimer = null;

export function startAgentQaSweep() {
    if (_sweepTimer) return;
    _sweepTimer = setInterval(async () => {
        try {
            const result = await runAgentQaScan({ autoResolve: true });
            if (!result.clean) {
                console.error(
                    `[AGENT-QA] Sweep found ${result.violation_count} violation(s), ` +
                    `resolved ${result.resolution_count}. ` +
                    result.violations.map(v => `[${v.type}:${v.agent_id || v.key}]`).join(' ')
                );
            }
        } catch (err) {
            console.error('[AGENT-QA] Sweep error:', err.message);
        }
    }, SWEEP_INTERVAL_MS);

    if (_sweepTimer?.unref) _sweepTimer.unref(); // don't block process exit
    console.error(`[AGENT-QA] Self-sustain sweep started (interval=${SWEEP_INTERVAL_MS}ms).`);
}

export function stopAgentQaSweep() {
    if (_sweepTimer) {
        clearInterval(_sweepTimer);
        _sweepTimer = null;
    }
}

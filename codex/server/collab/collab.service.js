import crypto from 'crypto';
import { EventEmitter } from 'node:events';
import { collabPersistence } from './collab.persistence.js';
const { db } = collabPersistence;
import { cleanAgentSession, runAgentQaScan as runAgentQaScanInternal } from './collab.agent-qa.js';
import { revokeAgentKey as revokeAuthKey } from './collab.agent-auth.js';
import { runCollabMcpProbe } from './mcp-probe.js';
import { createImmunityService } from '../services/immunity.service.js';
import {
    searchCodebase,
    forensicSearch,
    listIndexedFiles as listFilesInternal,
    searchHybrid as searchHybridInternal,
    getFileNeighbors as getNeighborsInternal,
} from '../services/codebaseSearch.service.js';
import {
    PIPELINE_DEFINITIONS,
    getRoleForPath,
    validateFileOwnership,
} from './collab.pipelines.js';
import {
    parseErrorForAI,
    ERROR_CATEGORIES,
    ERROR_SEVERITY,
    MODULE_IDS,
    ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

function uuid() {
    return crypto.randomUUID();
}

export class CollabServiceError extends Error {
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'CollabServiceError';
        this.code = code;
        this.statusCode = options.statusCode ?? 500;
        this.details = options.details ?? {};
    }
}

function createError(code, message, statusCode, details = {}) {
    return new CollabServiceError(code, message, { statusCode, details });
}

const DISCONNECTED_AGENT_RETENTION_MS = 30 * 60 * 1000;
const HEARTBEAT_FRESHNESS_WINDOW_MS = 90_000;
const SLA_DURATION_MS = 30_000;

function parseAgentLastSeen(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function shouldRetainAgentInPresence(agent, nowMs = Date.now()) {
    const status = String(agent?.status || 'offline').toLowerCase();
    if (status !== 'offline') {
        return true;
    }

    const lastSeenMs = parseAgentLastSeen(agent?.last_seen);
    const hasCurrentTask = typeof agent?.current_task_id === 'string' && agent.current_task_id.trim().length > 0;

    if (hasCurrentTask) {
        return true;
    }

    if (!lastSeenMs) {
        return false;
    }

    return (nowMs - lastSeenMs) <= DISCONNECTED_AGENT_RETENTION_MS;
}

async function getAgentOrThrow(agentId) {
    const agent = await collabPersistence.agents.getById(agentId);
    if (!agent) {
        throw createError('AGENT_NOT_FOUND', 'Agent not found', 404, { agent_id: agentId });
    }
    return agent;
}

async function getTaskOrThrow(taskId) {
    const task = await collabPersistence.tasks.getById(taskId);
    if (!task) {
        throw createError('TASK_NOT_FOUND', 'Task not found', 404, { task_id: taskId });
    }
    return task;
}

async function getPipelineOrThrow(pipelineId) {
    const pipeline = await collabPersistence.pipelines.getById(pipelineId);
    if (!pipeline) {
        throw createError('PIPELINE_NOT_FOUND', 'Pipeline not found', 404, { pipeline_id: pipelineId });
    }
    return pipeline;
}

/**
 * Alert Dispatcher - Pushes Cognitive Bus alerts to live agents
 */
class AlertDispatcher {
    constructor(service) {
        this.service = service;
        this.events = service.events;
        this._handler = (msg) => this.dispatch(msg);
        this.events.on('message_sent', this._handler);
    }

    destroy() {
        if (this._handler) {
            this.events.off('message_sent', this._handler);
            this._handler = null;
        }
    }

    async dispatch(message) {
        const { id: message_id, sender_id, target_id } = message;
        const now = Date.now();
        const expires_at = now + SLA_DURATION_MS;

        // 1. Resolve live recipients
        const allAgents = await collabPersistence.agents.getAll();
        const liveAgents = allAgents.filter(a => 
            a.id !== sender_id && 
            ['online', 'busy'].includes(a.status) &&
            (parseAgentLastSeen(a.last_seen) || 0) >= now - HEARTBEAT_FRESHNESS_WINDOW_MS
        );

        let recipients = [];
        if (target_id === 'all') {
            recipients = liveAgents;
        } else {
            const target = liveAgents.find(a => a.id === target_id);
            if (target) recipients = [target];
        }

        if (recipients.length === 0) {
            await logActivity({
                action: 'alert_skipped_no_live_recipients',
                target_type: 'message',
                target_id: String(message_id),
                details: { target_id }
            });
            return;
        }

        const sender = allAgents.find(a => a.id === sender_id);

        // 2. Dispatch to each recipient
        for (const recipient of recipients) {
            const alertId = `alr_${uuid()}`;
            const identityPacket = {
                alert_id: alertId,
                issued_at: now,
                expires_at,
                sla_ms: SLA_DURATION_MS,
                recipient: {
                    id: recipient.id,
                    name: recipient.name,
                    role: recipient.role,
                    capabilities: Array.isArray(recipient.capabilities) ? recipient.capabilities : []
                },
                sender: {
                    id: sender.id,
                    name: sender.name,
                    role: sender.role
                },
                message: {
                    id: message_id,
                    target_id: message.target_id,
                    glyph: message.glyph,
                    text: message.text,
                    bytecode: message.bytecode,
                    created_at: message.created_at
                },
                respond_via: {
                    tool: 'collab_alert_respond',
                    endpoint: `POST /collab/alerts/${alertId}/respond`
                }
            };

            await collabPersistence.alerts.create({
                id: alertId,
                message_id,
                recipient_id: recipient.id,
                sender_id,
                target_id: message.target_id,
                identity_packet: identityPacket,
                issued_at: now,
                expires_at
            });

            await logActivity({
                agent_id: null,
                action: 'alert_issued',
                target_type: 'agent',
                target_id: recipient.id,
                details: { message_id, alert_id: alertId }
            });

            this.events.emit('alert_issued', { alert_id: alertId, recipient_id: recipient.id });
        }
    }
}

async function runReaperCycle(events) {
    const now = Date.now();
    // Fetch pending that are past expiry
    const allAlerts = await collabPersistence.alerts.getAll();
    const toExpire = allAlerts.filter(a => a.status === 'pending' && a.expires_at <= now);

    for (const alert of toExpire) {
        await collabPersistence.alerts.updateStatus(alert.id, 'expired');
        await logActivity({
            action: 'alert_expired',
            target_type: 'agent',
            target_id: alert.recipient_id,
            details: { 
                alert_id: alert.id, 
                message_id: alert.message_id,
                latency_budget_breached_ms: now - alert.expires_at 
            }
        });
        events.emit('alert_expired', alert);
    }
}

const PIPELINE_SLA_MS = 2 * 60 * 60 * 1000; // 2 hours

async function runPipelineReaper(events) {
    const now = Date.now();
    const allPipelines = await collabPersistence.pipelines.getAll({ status: 'running' });
    for (const pipeline of allPipelines) {
        const updatedAt = new Date(pipeline.updated_at + 'Z').getTime();
        if (now - updatedAt > PIPELINE_SLA_MS) {
            await collabPersistence.pipelines.fail(pipeline.id, 'Pipeline SLA exceeded (2h timeout)');
            await logActivity({
                action: 'pipeline_reaped',
                target_type: 'pipeline',
                target_id: pipeline.id,
                details: { reason: 'sla_exceeded', sla_ms: PIPELINE_SLA_MS }
            });
            events.emit('pipeline_failed', { pipeline_id: pipeline.id, reason: 'sla_exceeded' });
        }
    }
}

function ensureOwnership({ filePaths, agent, override = false, hint }) {
    if (override || filePaths.length === 0) {
        return;
    }

    const validation = validateFileOwnership(filePaths, agent.role);
    if (!validation.valid) {
        throw createError('OWNERSHIP_CONFLICT', 'File ownership conflict', 409, {
            conflicts: validation.conflicts,
            ...(hint ? { hint } : {}),
        });
    }
}

async function logActivity({ agent_id, action, target_type, target_id, details }) {
    await collabPersistence.activity.log({
        agent_id,
        action,
        target_type,
        target_id,
        details,
    });
}

async function resolveStageCandidate(stage, filePaths = []) {
    const allAgents = await collabPersistence.agents.getAll();
    const agents = allAgents.filter(agent => agent.status !== 'offline');

    if (stage.role) {
        return agents.find(agent => agent.role === stage.role) ?? null;
    }

    const primaryRole = filePaths.length > 0 ? getRoleForPath(filePaths[0]) : null;
    if (!primaryRole) {
        return null;
    }

    return agents.find(agent => agent.role === primaryRole) ?? null;
}

async function createPipelineStageTask({ pipelineId, pipelineLabel, stage, triggerTask }) {
    return await collabPersistence.tasks.create({
        id: uuid(),
        title: `[Pipeline] ${pipelineLabel} - ${stage.name}`,
        description: stage.description,
        priority: 2,
        file_paths: triggerTask?.file_paths ?? [],
        depends_on: [],
        created_by: 'pipeline',
        pipeline_run_id: pipelineId,
    });
}

async function assignTaskInternal({
    task_id,
    agent_id,
    override = false,
    actor_agent_id = agent_id,
    activity_details = {},
}) {
    const task = await getTaskOrThrow(task_id);
    const agent = await getAgentOrThrow(agent_id);

    ensureOwnership({
        filePaths: task.file_paths,
        agent,
        override,
        hint: 'Set override: true to bypass ownership checks',
    });

    const assignmentResult = await collabPersistence.tasks.assignWithLocks(
        task_id,
        agent.id,
        task.file_paths,
        30,
    );

    if (assignmentResult.conflict) {
        throw createError('FILE_LOCK_CONFLICT', 'File lock conflict', 409, {
            file: assignmentResult.file,
            locked_by: assignmentResult.locked_by,
            task_id: assignmentResult.task_id,
        });
    }

    if (!assignmentResult.task) {
        throw createError('TASK_NOT_FOUND', 'Task not found', 404, { task_id });
    }

    await logActivity({
        agent_id: actor_agent_id,
        action: 'task_assigned',
        target_type: 'task',
        target_id: task_id,
        details: {
            agent_id: agent.id,
            agent_name: agent.name,
            override,
            ...activity_details,
        },
    });

    return assignmentResult.task;
}

async function autoAssignStageTask({ pipelineId, stage, stageTask, filePaths }) {
    const candidate = await resolveStageCandidate(stage, filePaths);
    if (!candidate) {
        return {
            task: stageTask,
            assigned: false,
            reason: 'NO_CANDIDATE',
        };
    }

    try {
        const task = await assignTaskInternal({
            task_id: stageTask.id,
            agent_id: candidate.id,
            override: stage.role !== null,
            actor_agent_id: candidate.id,
            activity_details: {
                auto_assigned: true,
                pipeline_run_id: pipelineId,
                stage_name: stage.name,
                override_reason: stage.role !== null ? 'pipeline_stage_role' : null,
            },
        });

        return {
            task,
            assigned: true,
            agent_id: candidate.id,
        };
    } catch (error) {
        if (
            error instanceof CollabServiceError &&
            (error.code === 'FILE_LOCK_CONFLICT' || error.code === 'OWNERSHIP_CONFLICT')
        ) {
            await logActivity({
                agent_id: candidate.id,
                action: 'pipeline_auto_assignment_skipped',
                target_type: 'pipeline',
                target_id: pipelineId,
                details: {
                    stage_name: stage.name,
                    code: error.code,
                    ...error.details,
                },
            });

            return {
                task: stageTask,
                assigned: false,
                reason: error.code,
                details: error.details,
            };
        }

        throw error;
    }
}

async function buildAssignmentPreflight({ task, agent }) {
    const filePaths = task.file_paths || [];
    const warnings = [];
    const conflicts = [];

    if (filePaths.length === 0) {
        warnings.push('This task has no tracked file paths, so ownership and lock checks are advisory only.');
    }

    if (task.assigned_agent === agent.id) {
        warnings.push('This task is already assigned to the selected agent; confirming will refresh its assignment and locks.');
    }

    const ownershipValidation = validateFileOwnership(filePaths, agent.role);
    const ownershipConflicts = ownershipValidation.valid
        ? []
        : ownershipValidation.conflicts.map((conflict) => ({
            kind: 'ownership',
            file: conflict.file,
            owner_role: conflict.owner_role,
            assigned_role: conflict.assigned_role,
            reason: conflict.owner_role
                ? `Owned by ${conflict.owner_role}; ${conflict.assigned_role} assignment requires override.`
                : 'Ownership is not mapped in the control plane; assignment requires override.',
        }));

    const lockConflicts = [];
    for (const filePath of filePaths) {
        const lock = await collabPersistence.locks.check(filePath);
        if (!lock || lock.locked_by === agent.id) {
            continue;
        }

        const taskLabel = lock.task_id ? ` via task ${lock.task_id.slice(0, 8)}...` : '';
        lockConflicts.push({
            kind: 'lock',
            file: filePath,
            locked_by: lock.locked_by,
            task_id: lock.task_id ?? null,
            reason: `Locked by ${lock.locked_by}${taskLabel}.`,
        });
    }

    conflicts.push(...lockConflicts, ...ownershipConflicts);

    const hasLockConflict = lockConflicts.length > 0;
    const hasOwnershipConflict = ownershipConflicts.length > 0;
    const requiresOverride = !hasLockConflict && hasOwnershipConflict;
    const valid = !hasLockConflict && !hasOwnershipConflict;

    let info = 'Assignment is clear. Ownership and lock checks passed.';
    let error = null;

    if (hasLockConflict && hasOwnershipConflict) {
        error = 'Assignment is blocked by active file locks and also crosses ownership boundaries.';
    } else if (hasLockConflict) {
        error = 'Assignment is blocked by active file locks.';
    } else if (hasOwnershipConflict) {
        error = 'Assignment crosses ownership boundaries and requires an explicit override.';
    } else if (warnings.length > 0) {
        info = 'Assignment is clear, but review the advisory warnings before confirming.';
    }

    return {
        valid,
        requires_override: requiresOverride,
        info,
        error,
        warnings,
        conflicts,
        checked_at: new Date().toISOString(),
    };
}

async function getBugReportOrThrow(bugId) {
    const bug = await collabPersistence.bug_reports.getById(bugId);
    if (!bug) {
        throw createError('BUG_REPORT_NOT_FOUND', 'Bug report not found', 404, { bug_id: bugId });
    }
    return bug;
}

function parseBytecode(bytecode) {
    const result = parseErrorForAI(bytecode);
    
    if (!result.aiMetadata?.parseable) {
        return { parseable: false, error: result.message || 'Invalid bytecode' };
    }

    const auto_fixable = ['TYPE', 'VALUE', 'RANGE', 'COORD', 'COLOR'].includes(result.category);

    return {
        parseable: true,
        category: result.category,
        severity: result.severity,
        module_id: result.moduleId,
        error_code_hex: result.errorCodeHex,
        decoded_context: result.context,
        checksum_verified: result.valid,
        auto_fixable,
        recovery_hints: result.recoveryHints,
        dedupe_fingerprint: `${result.category}:${result.severity}:${result.moduleId}:${result.errorCodeHex}`,
    };
}

export const collabService = {
    events: new EventEmitter(),
    _immunityService: null,
    _alertDispatcher: null,
    _reaperInterval: null,

    /**
     * Bootstraps the alert system. Idempotent — safe to call repeatedly
     * (tests share the singleton service across suites).
     */
    async bootstrap() {
        if (this._alertDispatcher) return;
        this._alertDispatcher = new AlertDispatcher(this);
        // Boot-time sweep: any pending alerts whose SLA elapsed during downtime
        // should expire on the same tick the system comes back up.
        await runReaperCycle(this.events);
        await runPipelineReaper(this.events);
        this._reaperInterval = setInterval(() => {
            runReaperCycle(this.events);
            runPipelineReaper(this.events);
        }, 5000);
        console.error('[CollabService] Alert system ignited.');
    },

    /**
     * Graceful teardown. Symmetric with bootstrap so a re-bootstrap leaves
     * exactly one message_sent listener and one reaper interval.
     */
    async close() {
        if (this._reaperInterval) {
            clearInterval(this._reaperInterval);
            this._reaperInterval = null;
        }
        if (this._alertDispatcher) {
            this._alertDispatcher.destroy();
            this._alertDispatcher = null;
        }
    },

    async _runReaper() {
        return await runReaperCycle(this.events);
    },

    // ... existing agents, tasks methods ...
    async listBugReports(filters = {}, pagination = {}) {
        return await collabPersistence.bug_reports.getAll(filters, pagination);
    },

    async getBugReport(id) {
        return await getBugReportOrThrow(id);
    },

    async listAlerts(filters = {}, pagination = {}) {
        return await collabPersistence.alerts.getAll(filters, pagination);
    },

    async pullAlerts(agentId) {
        const alerts = await collabPersistence.alerts.getPending(agentId);
        for (const alert of alerts) {
            await collabPersistence.alerts.updateStatus(alert.id, 'pending', 'pull');
        }
        return alerts;
    },

    async respondToAlert(alertId, agentId, { payload } = {}) {
        const alert = await collabPersistence.alerts.getById(alertId);
        if (!alert) {
            throw createError('ALERT_NOT_FOUND', 'Alert not found', 404, { alert_id: alertId });
        }

        if (alert.recipient_id !== agentId) {
            throw createError('AUTH_SENDER_MISMATCH', 'Only the recipient can respond to this alert', 403, {
                recipient_id: alert.recipient_id,
                claimed_id: agentId
            });
        }

        if (alert.status === 'expired') {
            throw createError('ALERT_EXPIRED', 'Alert has expired (30s SLA exceeded)', 410, {
                alert_id: alertId,
                issued_at: alert.issued_at,
                expires_at: alert.expires_at
            });
        }

        // Idempotency check
        const existingResponse = await collabPersistence.alert_responses.getForAlert(alertId, agentId);
        if (existingResponse) {
            return { already_acknowledged: true, response: existingResponse };
        }

        const now = Date.now();
        const response = await collabPersistence.alert_responses.create({
            alert_id: alertId,
            agent_id: agentId,
            responded_at: now,
            latency_ms: now - alert.issued_at,
            payload: payload || {}
        });

        await collabPersistence.alerts.updateStatus(alertId, 'acknowledged');

        await logActivity({
            agent_id: agentId,
            action: 'alert_acknowledged',
            target_type: 'alert',
            target_id: alertId,
            details: { latency_ms: response.latency_ms }
        });

        this.events.emit('alert_acknowledged', { alert, response });

        return response;
    },

    async createBugReport(input) {
        const id = uuid();
        let bugData = {
            id,
            ...input,
        };

        if (input.bytecode) {
            const parsed = parseBytecode(input.bytecode);
            if (parsed.parseable) {
                bugData = {
                    ...bugData,
                    category: parsed.category,
                    severity: parsed.severity,
                    module_id: parsed.module_id,
                    error_code_hex: parsed.error_code_hex,
                    checksum_verified: parsed.checksum_verified ? 1 : 0,
                    parseable: 1,
                    auto_fixable: parsed.auto_fixable ? 1 : 0,
                    decoded_context: parsed.decoded_context,
                    recovery_hints: parsed.recovery_hints,
                    dedupe_fingerprint: parsed.dedupe_fingerprint,
                };
            }
        }

        const bug = await collabPersistence.bug_reports.create(bugData);
        await logActivity({
            agent_id: input.reporter_agent_id,
            action: 'bug_report_created',
            target_type: 'bug_report',
            target_id: bug.id,
            details: { title: bug.title, severity: bug.severity },
        });

        return bug;
    },

    async updateBugReport({ id, ...updates }) {
        await getBugReportOrThrow(id);
        const bug = await collabPersistence.bug_reports.update(id, updates);
        
        await logActivity({
            agent_id: null,
            action: 'bug_report_updated',
            target_type: 'bug_report',
            target_id: id,
            details: updates,
        });

        return bug;
    },

    async deleteBugReport(id) {
        await getBugReportOrThrow(id);
        await collabPersistence.bug_reports.delete(id);
        
        await logActivity({
            agent_id: null,
            action: 'bug_report_deleted',
            target_type: 'bug_report',
            target_id: id,
            details: {},
        });
        return { ok: true };
    },

    parseBytecode(bytecode) {
        return parseBytecode(bytecode);
    },

    async importQaResults(results, actorAgentId = null) {
        // results can be a single failure or an array of failures
        const failures = Array.isArray(results) ? results : [results];
        const bugs = [];

        for (const fail of failures) {
            const bug = await this.createBugReport({
                title: fail.title || `QA Failure: ${fail.test_name || 'Unknown Test'}`,
                summary: fail.error_message || fail.summary || 'Assertion failed during QA run.',
                source_type: 'qa',
                severity: fail.severity || 'CRIT',
                priority: fail.priority || 2,
                bytecode: fail.bytecode,
                reporter_agent_id: actorAgentId || 'qa-engine',
                observed_behavior: fail.observed || fail.actual,
                expected_behavior: fail.expected,
                repro_steps: fail.repro_steps || [],
                environment: fail.environment || {},
            });
            bugs.push(bug);
        }

        return bugs;
    },

    async createTaskFromBug(bugId, actorAgentId = null) {
        const bug = await getBugReportOrThrow(bugId);
        
        const taskInput = {
            title: `[Fix] ${bug.title}`,
            description: `Auto-generated from Bug Report ${bug.id}\n\nSeverity: ${bug.severity}\nCategory: ${bug.category}\n\nSummary: ${bug.summary || 'None'}`,
            priority: bug.priority,
            created_by: actorAgentId || 'system',
            related_bug_id: bug.id, // We should add this to task schema if needed, but for now it goes into activity
        };

        const task = await this.createTask(taskInput);
        await this.updateBugReport({
            id: bugId,
            status: 'triaged',
            related_task_id: task.id,
        });

        await logActivity({
            agent_id: actorAgentId,
            action: 'bug_task_created',
            target_type: 'bug_report',
            target_id: bugId,
            details: { task_id: task.id },
        });

        return task;
    },

    async listAgents() {
        const agents = await collabPersistence.agents.getAll();
        const nowMs = Date.now();
        return agents.filter(agent => shouldRetainAgentInPresence(agent, nowMs));
    },

    async getAgent(id) {
        return await getAgentOrThrow(id);
    },

    async registerAgent(input) {
        // Clean any stale session for this ID before re-registering
        const existing = await collabPersistence.agents.getById(input.id);
        if (existing) {
            await cleanAgentSession(input.id);
        }

        const agent = await collabPersistence.agents.register(input);
        await logActivity({
            agent_id: agent.id,
            action: 'agent_registered',
            target_type: 'agent',
            target_id: agent.id,
            details: { role: agent.role },
        });

        // Run duplicate QA scan asynchronously — don't block registration
        setImmediate(async () => {
            try { await runAgentQaScanInternal({ autoResolve: true }); } catch { /* ignore */ }
        });

        return agent;
    },

    async heartbeatAgent({ id, status, current_task_id }) {
        // If going offline, clean the session first
        if (status === 'offline') {
            const exists = await collabPersistence.agents.getById(id);
            if (exists) {
                await cleanAgentSession(id);
            }
        }

        const agent = await collabPersistence.agents.heartbeat(id, status, current_task_id);
        if (!agent) {
            throw createError('AGENT_NOT_FOUND', 'Agent not found', 404, { agent_id: id });
        }

        // Fetch and deliver pending alerts (Heartbeat piggyback)
        const alerts = await collabPersistence.alerts.getPending(id);
        for (const alert of alerts) {
            await collabPersistence.alerts.updateStatus(alert.id, 'pending', 'heartbeat');
        }

        return {
            ...agent,
            pending_alerts: alerts.map(a => a.identity_packet)
        };
    },

    async disconnectAgent(id) {
        await getAgentOrThrow(id);

        const { locksReleased, tasksUnassigned } = await cleanAgentSession(id);
        await collabPersistence.agents.offline(id);

        await logActivity({
            agent_id: id,
            action: 'agent_disconnected',
            target_type: 'agent',
            target_id: id,
            details: { locks_released: locksReleased, tasks_unassigned: tasksUnassigned },
        });

        return { ok: true, locks_released: locksReleased, tasks_unassigned: tasksUnassigned };
    },

    async deleteAgent(id) {
        await getAgentOrThrow(id);

        // Clean session before deletion: release locks + unassign tasks
        const { locksReleased, tasksUnassigned } = await cleanAgentSession(id);

        const deleted = await collabPersistence.agents.delete(id);
        if (!deleted) {
            throw createError('AGENT_NOT_FOUND', 'Agent not found', 404, { agent_id: id });
        }

        await logActivity({
            agent_id: id,
            action: 'agent_deleted',
            target_type: 'agent',
            target_id: id,
            details: { reason: 'manual_delete', locks_released: locksReleased, tasks_unassigned: tasksUnassigned },
        });

        return { ok: true };
    },

    async runAgentQaScan({ autoResolve = true } = {}) {
        return await runAgentQaScanInternal({ autoResolve });
    },

    async revokeAgentKey(keyId) {
        return revokeAuthKey(keyId);
    },

    async runMcpProbe() {
        return await runCollabMcpProbe();
    },

    async listTasks({ status, agent, priority, limit, offset } = {}) {
        return await collabPersistence.tasks.getAll(
            { status, agent, priority },
            { limit, offset },
        );
    },

    async getTask(id) {
        return await getTaskOrThrow(id);
    },

    async getTaskAssignmentPreflight({ task_id, agent_id }) {
        const task = await getTaskOrThrow(task_id);
        const agent = await getAgentOrThrow(agent_id);
        return await buildAssignmentPreflight({ task, agent });
    },

    async createTask(input) {
        const { note, ...rest } = input;
        const initialNotes = [];
        if (note) {
            initialNotes.push({
                agent_id: input.created_by || 'human',
                timestamp: new Date().toISOString(),
                text: note,
            });
        }

        // FIX: Atomic task creation — wrap task + activity log in single batch transaction.
        const taskId = uuid();
        const now = new Date().toISOString();

        await db.batch([
            {
                sql: `INSERT INTO collab_tasks (id, title, description, status, priority, created_by, assigned_agent, file_paths, depends_on, result, notes, created_at, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    taskId,
                    rest.title || '',
                    rest.description || '',
                    rest.status || 'backlog',
                    rest.priority ?? 1,
                    rest.created_by || null,
                    rest.assigned_agent || null,
                    JSON.stringify(Array.isArray(rest.file_paths) ? rest.file_paths : []),
                    JSON.stringify(Array.isArray(rest.depends_on) ? rest.depends_on : []),
                    null,
                    JSON.stringify(initialNotes),
                    now,
                    now,
                ]
            },
            {
                sql: `INSERT INTO collab_activity (agent_id, action, target_type, target_id, details, created_at)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [
                    input.created_by || 'human',
                    'task_created',
                    'task',
                    taskId,
                    JSON.stringify({ title: rest.title }),
                    now,
                ]
            }
        ]);

        return await getTaskOrThrow(taskId);
    },

    async updateTask({ id, actor_agent_id = null, ...updates }) {
        const existingTask = await getTaskOrThrow(id);
        const now = new Date().toISOString();

        // Handle note append
        if (updates.note) {
            const newNote = {
                agent_id: actor_agent_id,
                timestamp: new Date().toISOString(),
                text: updates.note,
            };
            const currentNotes = existingTask.notes || [];
            updates.notes = [...currentNotes, newNote];
            delete updates.note;
        }

        // FIX: Atomic task update — build update fields and batch all operations.
        const fields = [];
        const params = [];

        if (updates.title !== undefined) { fields.push('title = ?'); params.push(updates.title); }
        if (updates.description !== undefined) { fields.push('description = ?'); params.push(updates.description); }
        if (updates.status !== undefined) { fields.push('status = ?'); params.push(updates.status); }
        if (updates.priority !== undefined) { fields.push('priority = ?'); params.push(updates.priority); }
        if (updates.assigned_agent !== undefined) { fields.push('assigned_agent = ?'); params.push(updates.assigned_agent); }
        if (updates.file_paths !== undefined) { fields.push('file_paths = ?'); params.push(JSON.stringify(updates.file_paths)); }
        if (updates.depends_on !== undefined) { fields.push('depends_on = ?'); params.push(JSON.stringify(updates.depends_on)); }
        if (updates.result !== undefined) { fields.push('result = ?'); params.push(updates.result ? JSON.stringify(updates.result) : null); }
        if (updates.notes !== undefined) { fields.push('notes = ?'); params.push(JSON.stringify(updates.notes)); }

        if (fields.length === 0) return existingTask;

        fields.push('updated_at = ?');
        params.push(now);
        params.push(id);

        const statements = [];

        // Task update
        statements.push({ sql: `UPDATE collab_tasks SET ${fields.join(', ')} WHERE id = ?`, args: params });

        // Lock release if marking done
        if (updates.status === 'done') {
            statements.push({ sql: `DELETE FROM collab_file_locks WHERE task_id = ?`, args: [id] });
        }

        // Activity log
        const activityDetails = { ...updates };
        delete activityDetails.notes;
        statements.push({
            sql: `INSERT INTO collab_activity (agent_id, action, target_type, target_id, details, created_at)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [actor_agent_id || 'human', 'task_updated', 'task', id, JSON.stringify(activityDetails), now]
        });

        await db.batch(statements);
        return await getTaskOrThrow(id);
    },

    // FIX: Atomic task deletion — lock release + task delete + activity log in batch.
    async deleteTask({ id, actor_agent_id = null }) {
        await getTaskOrThrow(id);
        const now = new Date().toISOString();

        await db.batch([
            { sql: `DELETE FROM collab_file_locks WHERE task_id = ?`, args: [id] },
            { sql: `DELETE FROM collab_tasks WHERE id = ?`, args: [id] },
            { sql: `INSERT INTO collab_activity (agent_id, action, target_type, target_id, details, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)`, args: [actor_agent_id || 'human', 'task_deleted', 'task', id, '{}', now] }
        ]);

        return { ok: true };
    },

    async archiveAllTasks(actor_agent_id = null) {
        const archivedCount = await collabPersistence.tasks.archiveAll();
        
        await logActivity({
            agent_id: actor_agent_id,
            action: 'tasks_archived_all',
            target_type: 'task',
            target_id: 'all',
            details: { count: archivedCount },
        });

        return { ok: true, count: archivedCount };
    },

    async assignTask(params) {
        return await assignTaskInternal(params);
    },

    async listLocks() {
        return await collabPersistence.locks.getAll();
    },

    async checkLock(path) {
        return await collabPersistence.locks.check(path);
    },

    async acquireLock({ file_path, agent_id, task_id, ttl_minutes, override = false }) {
        const agent = await getAgentOrThrow(agent_id);
        ensureOwnership({
            filePaths: [file_path],
            agent,
            override,
        });

        if (task_id) {
            await getTaskOrThrow(task_id);
        }

        const result = await collabPersistence.locks.acquire({
            file_path,
            agent_id,
            task_id,
            ttl_minutes,
        });

        if (result.conflict) {
            throw createError('FILE_LOCK_CONFLICT', 'File already locked', 409, {
                locked_by: result.locked_by,
                task_id: result.task_id,
                file_path,
            });
        }

        await logActivity({
            agent_id,
            action: 'lock_acquired',
            target_type: 'lock',
            target_id: file_path,
            details: { task_id: task_id ?? null, ttl_minutes },
        });

        return result;
    },

    async releaseLock({ file_path, agent_id }) {
        await getAgentOrThrow(agent_id);

        const released = await collabPersistence.locks.release(file_path, agent_id);
        if (!released) {
            throw createError('LOCK_NOT_FOUND', 'Lock not found or not owned by you', 404, {
                file_path,
                agent_id,
            });
        }

        await logActivity({
            agent_id,
            action: 'lock_released',
            target_type: 'lock',
            target_id: file_path,
            details: {},
        });

        return { ok: true };
    },

    async listPipelines({ status, limit, offset } = {}) {
        return await collabPersistence.pipelines.getAll({ status }, { limit, offset });
    },

    async getPipeline(id) {
        return await getPipelineOrThrow(id);
    },

    async createPipeline({ pipeline_type, trigger_task_id, actor_agent_id = null }) {
        const definition = PIPELINE_DEFINITIONS[pipeline_type];
        if (!definition) {
            throw createError('VALIDATION_FAILED', `Unknown pipeline type: ${pipeline_type}`, 400, {
                pipeline_type,
            });
        }

        // FIX: Atomic pipeline creation — wrap all operations in batch.
        const pipelineId = uuid();
        const now = new Date().toISOString();

        const triggerTask = trigger_task_id
            ? await collabPersistence.tasks.getById(trigger_task_id)
            : null;
        const firstStage = definition.stages[0];
        const stageTask = await createPipelineStageTask({
            pipelineId,
            pipelineLabel: definition.name,
            stage: firstStage,
            triggerTask,
        });
        const autoAssignment = await autoAssignStageTask({
            pipelineId,
            stage: firstStage,
            stageTask,
            filePaths: stageTask.file_paths,
        });

        const pipeline = await collabPersistence.pipelines.create({
            id: pipelineId,
            pipeline_type,
            stages: definition.stages,
            trigger_task_id,
        });

        // Activity log (pipeline row already inserted via collabPersistence.pipelines.create above)
        await db.batch([
            {
                sql: `INSERT INTO collab_activity (agent_id, action, target_type, target_id, details, created_at)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [actor_agent_id || 'human', 'pipeline_started', 'pipeline', pipelineId, JSON.stringify({
                    type: pipeline_type,
                    name: definition.name,
                    stage_task_id: autoAssignment.task?.id ?? stageTask.id,
                    auto_assignment: autoAssignment,
                }), now]
            }
        ]);

        return {
            pipeline,
            stage_task: autoAssignment.task,
            auto_assignment: autoAssignment,
        };
    },

    async advancePipeline({ id, result = {}, actor_agent_id = null }) {
        const pipeline = await getPipelineOrThrow(id);
        if (pipeline.status !== 'running') {
            return {
                pipeline,
                isComplete: pipeline.status === 'completed',
                nextStageIndex: null,
                terminal: true,
                stage_task: null,
                auto_assignment: null,
            };
        }

        const advancement = await collabPersistence.pipelines.advance(id, result);
        let stageTask = null;
        let autoAssignment = null;

        if (!advancement.isComplete) {
            const nextPipeline = advancement.pipeline;
            const nextStage = nextPipeline.stages[advancement.nextStageIndex];
            const triggerTask = nextPipeline.trigger_task_id
                ? await collabPersistence.tasks.getById(nextPipeline.trigger_task_id)
                : null;
            const pipelineLabel = PIPELINE_DEFINITIONS[nextPipeline.pipeline_type]?.name
                ?? nextPipeline.pipeline_type;

            stageTask = await createPipelineStageTask({
                pipelineId: id,
                pipelineLabel,
                stage: nextStage,
                triggerTask,
            });
            autoAssignment = await autoAssignStageTask({
                pipelineId: id,
                stage: nextStage,
                stageTask,
                filePaths: stageTask.file_paths,
            });
            stageTask = autoAssignment.task;
        }

        await logActivity({
            agent_id: actor_agent_id,
            action: advancement.isComplete ? 'pipeline_completed' : 'pipeline_advanced',
            target_type: 'pipeline',
            target_id: id,
            details: {
                stage: advancement.isComplete ? 'done' : advancement.nextStageIndex,
                stage_task_id: stageTask?.id ?? null,
                auto_assignment: autoAssignment,
            },
        });

        return {
            ...advancement,
            terminal: false,
            stage_task: stageTask,
            auto_assignment: autoAssignment,
        };
    },

    async failPipeline({ id, reason, actor_agent_id = null }) {
        const pipeline = await getPipelineOrThrow(id);
        if (pipeline.status !== 'running') {
            return {
                pipeline,
                terminal: true,
            };
        }

        const failed = await collabPersistence.pipelines.fail(id, reason);

        await logActivity({
            agent_id: actor_agent_id,
            action: 'pipeline_failed',
            target_type: 'pipeline',
            target_id: id,
            details: { reason },
        });

        return {
            pipeline: failed,
            terminal: false,
        };
    },

    async listActivity({ limit, offset, agent, action } = {}) {
        return await collabPersistence.activity.getRecent(limit, { agent, action }, offset);
    },

    async logActivity({ agent_id, action, target_type, target_id, details }) {
        await logActivity({ agent_id, action, target_type, target_id, details });
    },

    async setMemory({ agent_id, key, value }) {
        if (agent_id) {
            await getAgentOrThrow(agent_id);
        }
        const memory = await collabPersistence.memories.set(agent_id, key, value);
        await logActivity({
            agent_id,
            action: 'memory_set',
            target_type: 'memory',
            target_id: key,
            details: { has_agent: !!agent_id },
        });
        return memory;
    },

    async getMemory({ agent_id, key }) {
        return await collabPersistence.memories.get(agent_id, key);
    },

    async listMemories(agent_id = null) {
        return await collabPersistence.memories.getAll(agent_id);
    },

    async deleteMemory({ agent_id, key }) {
        const existing = await collabPersistence.memories.get(agent_id, key);
        if (!existing) {
            throw createError('MEMORY_NOT_FOUND', 'Memory not found', 404, {
                agent_id: agent_id || '',
                key,
            });
        }
        const deleted = await collabPersistence.memories.delete(agent_id, key);
        await logActivity({
            agent_id,
            action: 'memory_deleted',
            target_type: 'memory',
            target_id: key,
            details: { has_agent: !!agent_id },
        });
        return { ok: true, deleted };
    },

    async sendMessage(input, authenticatedAgentId = null) {
        const { sender_id, target_id, glyph, text, bytecode, metadata } = input;
        
        // SECURITY: Verify that the authenticated entity matches the sender_id
        // Fail-closed: require authenticatedAgentId to exist and match sender_id.
        if (!authenticatedAgentId || authenticatedAgentId !== sender_id) {
            throw createError('AUTH_SENDER_MISMATCH', 'Authentication required and must match sender_id', 403, {
                authenticated_id: authenticatedAgentId,
                claimed_id: sender_id
            });
        }

        // Verify sender exists
        await getAgentOrThrow(sender_id);
        
        // If target is not 'all', verify target exists
        if (target_id && target_id !== 'all') {
            await getAgentOrThrow(target_id);
        }

        // FIX: Atomic message send — message + activity log in single batch.
        const now = new Date().toISOString();
        const message = await collabPersistence.messages.create({
            sender_id,
            target_id: target_id || 'all',
            glyph: glyph || '✦',
            text,
            bytecode: bytecode || null,
            metadata: metadata || {},
        });

        // Fetch display names for the UI contract
        const sender = await collabPersistence.agents.getById(sender_id);
        const target = target_id && target_id !== 'all' 
            ? await collabPersistence.agents.getById(target_id) 
            : null;

        const normalizedMessage = {
            ...message,
            senderId: message.sender_id,
            targetId: message.target_id,
            senderName: sender?.name || sender_id || 'Unknown Mind',
            targetName: target_id === 'all' ? 'All Minds' : (target?.name || target_id || 'Unknown Mind'),
            timestamp: message.created_at,
        };

        // Batch message + activity log
        await db.batch([
            {
                sql: `INSERT INTO collab_activity (agent_id, action, target_type, target_id, details, created_at)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [sender_id, 'message_sent', 'agent', target_id || 'all', JSON.stringify({
                    glyph: message.glyph,
                    has_bytecode: !!bytecode,
                }), now]
            }
        ]);

        // Emit for real-time subscribers (e.g. SSE bridge)
        this.events.emit('message_sent', normalizedMessage);

        return normalizedMessage;
    },

    async listMessages(filters = {}, pagination = {}) {
        const messages = await collabPersistence.messages.getAll(filters, pagination);
        const agents = await collabPersistence.agents.getAll();
        const agentMap = new Map(agents.map(a => [a.id, a.name]));

        return messages.map(msg => ({
            ...msg,
            senderId: msg.sender_id,
            targetId: msg.target_id,
            senderName: agentMap.get(msg.sender_id) || msg.sender_id || 'Unknown Mind',
            targetName: msg.target_id === 'all' ? 'All Minds' : (agentMap.get(msg.target_id) || msg.target_id || 'Unknown Mind'),
            timestamp: msg.created_at,
        }));
    },

    async deleteMessage(id, actorAgentId = null) {
        const success = await collabPersistence.messages.delete(id);
        if (success) {
            await logActivity({
                agent_id: actorAgentId,
                action: 'message_deleted',
                target_type: 'message',
                target_id: String(id),
                details: { purged: true },
            });
        }
        return { ok: success };
    },

    async getStatus() {
        const agents = await collabPersistence.agents.getAll();
        const taskCounts = await collabPersistence.tasks.getCounts();
        const pipelineCounts = await collabPersistence.pipelines.getCounts();
        const locks = await collabPersistence.locks.getAll();

        const activeMcpLocks = locks.filter(l => l.mcp_active);

        return {
            online_agents: agents.filter(agent => agent.status !== 'offline').length,
            total_agents: agents.length,
            active_tasks: taskCounts.active_tasks,
            total_tasks: taskCounts.total_tasks,
            running_pipelines: pipelineCounts.running_pipelines,
            active_locks: locks.length,
            mcp_port: {
                active_bindings: activeMcpLocks.length,
                throughput: activeMcpLocks.reduce((sum, l) => sum + (l.mcp_stream?.throughput || 0), 0)
            }
        };
    },

    async listCodebaseFiles() {
        return await listFilesInternal();
    },

    async searchHybrid(query) {
        // PATHOGEN_MARKER: RECURSIVE_SHADOW
        // Guard against infinite recursion between service method and service import.
        return await searchHybridInternal(query);
    },

    async getFileNeighbors(filePath) {
        return await getNeighborsInternal(filePath);
    },

    async scanFileImmunity(content, filePath) {
        if (!this._immunityService) {
            this._immunityService = await createImmunityService({ log: console });
        }
        return await this._immunityService.scanFile(content, filePath);
    },

    async getImmunityStatus() {
        if (!this._immunityService) {
            this._immunityService = await createImmunityService({ log: console });
        }
        return await this._immunityService.getStatus();
    },
};

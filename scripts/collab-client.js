#!/usr/bin/env node
/**
 * Lightweight collaboration client for AI agent sessions.
 *
 * Usage as CLI:
 *   AGENT_ID=claude-opus node scripts/collab-client.js register --name "Claude (Opus)" --role ui --capabilities jsx,css
 *   AGENT_ID=claude-opus node scripts/collab-client.js heartbeat --status busy
 *   AGENT_ID=claude-opus node scripts/collab-client.js tasks
 *   AGENT_ID=claude-opus node scripts/collab-client.js claim <task-id>
 *   AGENT_ID=claude-opus node scripts/collab-client.js complete <task-id>
 *   node scripts/collab-client.js status
 *
 * Usage as module:
 *   import { createCollabClient } from './scripts/collab-client.js';
 *   const client = createCollabClient('claude-opus');
 *   await client.register('Claude (Opus)', 'ui', ['jsx', 'css']);
 */

import fs from 'fs';

const BASE_URL = process.env.COLLAB_URL || 'http://localhost:8080/collab';
const API_BASE = process.env.API_BASE_URL || 'http://localhost:8080';
const COOKIE_FILE = process.env.COLLAB_COOKIE_FILE || '/tmp/scholomance_cookie.txt';

// Cookie jar for session management (Node.js fetch doesn't handle cookies automatically)
let _sessionCookie = null;

function loadCookie() {
    try {
        if (fs.existsSync(COOKIE_FILE)) {
            _sessionCookie = fs.readFileSync(COOKIE_FILE, 'utf8').trim() || null;
        }
    } catch {
        // Ignore cookie read failures.
    }
}

function saveCookie() {
    try {
        if (_sessionCookie) {
            fs.writeFileSync(COOKIE_FILE, _sessionCookie, 'utf8');
        }
    } catch {
        // Ignore cookie persistence failures.
    }
}

function captureSessionCookie(response) {
    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return;
    const match = setCookie.match(/(connect|scholomance)\.sid=([^;]+)/);
    if (!match) return;
    _sessionCookie = `${match[1]}.sid=${match[2]}`;
    saveCookie();
}

async function apiFetch(baseUrl, path, agentId, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...(agentId ? { 'X-Agent-ID': agentId } : {}),
        ...options.headers,
    };
    // Attach agent key if available AND matches the calling agent (passwordless remote auth)
    const agentKey = process.env.AGENT_KEY;
    const expectedAgentId = process.env.AGENT_ID;
    if (agentKey && expectedAgentId && agentKey.includes(expectedAgentId)) {
        headers['Authorization'] = `Bearer ${agentKey}`;
    }
    // Attach session cookie if available (local dev auth)
    if (_sessionCookie) {
        headers['Cookie'] = _sessionCookie;
    }
    const res = await fetch(url, {
        ...options,
        headers,
    });
    captureSessionCookie(res);
    const data = await res.json();
    if (!res.ok) {
        const err = new Error(data.message || data.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

loadCookie();

async function collabFetch(path, agentId, options = {}) {
    return apiFetch(BASE_URL, path, agentId, options);
}

async function authFetch(path, options = {}) {
    return apiFetch(API_BASE, path, null, options);
}

export async function login(username, password) {
    const csrfData = await authFetch('/auth/csrf-token');
    const csrfToken = csrfData.token;

    return authFetch('/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ username, password }),
    });
}

export function createCollabClient(agentId) {
    return {
        register: (name, role, capabilities = []) =>
            collabFetch('/agents/register', agentId, {
                method: 'POST',
                body: JSON.stringify({ id: agentId, name, role, capabilities }),
            }),

        heartbeat: (status = 'online', currentTaskId = null) =>
            collabFetch(`/agents/${agentId}/heartbeat`, agentId, {
                method: 'POST',
                body: JSON.stringify({ status, current_task_id: currentTaskId }),
            }),

        getAgents: () => collabFetch('/agents', agentId),

        getTasks: (filters = {}) => {
            const params = new URLSearchParams(
                Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)),
            ).toString();
            return collabFetch(`/tasks${params ? `?${params}` : ''}`, agentId);
        },

        createTask: (title, options = {}) =>
            collabFetch('/tasks', agentId, {
                method: 'POST',
                body: JSON.stringify({ title, created_by: agentId, ...options }),
            }),

        claimTask: (taskId, override = false) =>
            collabFetch(`/tasks/${taskId}/assign`, agentId, {
                method: 'POST',
                body: JSON.stringify({ agent_id: agentId, override }),
            }),

        updateTask: (taskId, updates) =>
            collabFetch(`/tasks/${taskId}`, agentId, {
                method: 'PATCH',
                body: JSON.stringify(updates),
            }),

        completeTask: (taskId, result = {}) =>
            collabFetch(`/tasks/${taskId}`, agentId, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'done', result }),
            }),

        startPipeline: (pipelineType, triggerTaskId = null) =>
            collabFetch('/pipelines', agentId, {
                method: 'POST',
                body: JSON.stringify({ pipeline_type: pipelineType, trigger_task_id: triggerTaskId }),
            }),

        advancePipeline: (pipelineId, result = {}) =>
            collabFetch(`/pipelines/${pipelineId}/advance`, agentId, {
                method: 'POST',
                body: JSON.stringify({ result }),
            }),

        getPipelines: () => collabFetch('/pipelines', agentId),

        getActivity: (limit = 50) => collabFetch(`/activity?limit=${limit}`, agentId),

        getStatus: () => collabFetch('/status', agentId),

        acquireLock: (filePath, taskId = null, ttlMinutes = 30) =>
            collabFetch('/locks', agentId, {
                method: 'POST',
                body: JSON.stringify({ file_path: filePath, agent_id: agentId, task_id: taskId, ttl_minutes: ttlMinutes }),
            }),

        releaseLock: (filePath) =>
            collabFetch(`/locks/${encodeURIComponent(filePath)}`, agentId, {
                method: 'DELETE',
            }),

        getLocks: () => collabFetch('/locks', agentId),
    };
}

// --- CLI Mode ---
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const agentId = process.env.AGENT_ID;

    if (!command) {
        console.log('Usage: AGENT_ID=<id> node collab-client.js <command> [options]');
        console.log('Commands: login, register, heartbeat, tasks, create-task, claim, complete, status, agents, pipelines, start-pipeline, advance-pipeline, fail-pipeline, acquire-lock, release-lock, locks, activity');
        process.exit(0);
    }

    const client = createCollabClient(agentId);

    try {
        switch (command) {
            case 'login': {
                const username = getFlag(args, '--username') || process.env.COLLAB_USER || 'test';
                const password = getFlag(args, '--password') || process.env.COLLAB_PASS || 'password';
                const result = await login(username, password);
                console.log('Logged in:', JSON.stringify(result, null, 2));
                break;
            }
            case 'register': {
                const name = getFlag(args, '--name') || agentId;
                const role = getFlag(args, '--role') || 'backend';
                const caps = (getFlag(args, '--capabilities') || '').split(',').filter(Boolean);
                const result = await client.register(name, role, caps);
                console.log('Registered:', JSON.stringify(result, null, 2));
                break;
            }
            case 'heartbeat': {
                const status = getFlag(args, '--status') || 'online';
                const currentTaskId = getFlag(args, '--task-id');
                const result = await client.heartbeat(status, currentTaskId);
                console.log('Heartbeat:', JSON.stringify(result, null, 2));
                break;
            }
            case 'tasks': {
                const status = getFlag(args, '--status');
                const result = await client.getTasks(status ? { status } : {});
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            case 'create-task': {
                const title = args[1];
                if (!title) { console.error('Task title required'); process.exit(1); }
                const priority = getFlag(args, '--priority') || '1';
                const result = await client.createTask(title, { priority: Number(priority) });
                console.log('Created:', JSON.stringify(result, null, 2));
                break;
            }
            case 'claim': {
                const taskId = args[1];
                if (!taskId) { console.error('Task ID required'); process.exit(1); }
                const result = await client.claimTask(taskId);
                console.log('Claimed:', JSON.stringify(result, null, 2));
                break;
            }
            case 'complete': {
                const taskId = args[1];
                if (!taskId) { console.error('Task ID required'); process.exit(1); }
                const resultStr = getFlag(args, '--result');
                const result = resultStr ? JSON.parse(resultStr) : {};
                const resultObj = await client.completeTask(taskId, result);
                console.log('Completed:', JSON.stringify(resultObj, null, 2));
                break;
            }
            case 'status': {
                const result = await client.getStatus();
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            case 'agents': {
                const result = await client.getAgents();
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            case 'pipelines': {
                const result = await client.getPipelines();
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            case 'start-pipeline': {
                const type = args[1];
                if (!type) { console.error('Pipeline type required'); process.exit(1); }
                const triggerId = getFlag(args, '--trigger-id');
                const result = await client.startPipeline(type, triggerId);
                console.log('Started:', JSON.stringify(result, null, 2));
                break;
            }
            case 'advance-pipeline': {
                const pipeId = args[1];
                if (!pipeId) { console.error('Pipeline ID required'); process.exit(1); }
                const resultStr = getFlag(args, '--result');
                const result = resultStr ? JSON.parse(resultStr) : {};
                const resultObj = await client.advancePipeline(pipeId, result);
                console.log('Advanced:', JSON.stringify(resultObj, null, 2));
                break;
            }
            case 'fail-pipeline': {
                const pipeId = args[1];
                if (!pipeId) { console.error('Pipeline ID required'); process.exit(1); }
                const reason = getFlag(args, '--reason') || 'Unknown failure';
                const result = await client.failPipeline(pipeId, reason);
                console.log('Failed:', JSON.stringify(result, null, 2));
                break;
            }
            case 'acquire-lock': {
                const path = args[1];
                if (!path) { console.error('File path required'); process.exit(1); }
                const taskId = getFlag(args, '--task-id');
                const ttl = getFlag(args, '--ttl') || '30';
                const result = await client.acquireLock(path, taskId, Number(ttl));
                console.log('Acquired:', JSON.stringify(result, null, 2));
                break;
            }
            case 'release-lock': {
                const path = args[1];
                if (!path) { console.error('File path required'); process.exit(1); }
                const result = await client.releaseLock(path);
                console.log('Released:', JSON.stringify(result, null, 2));
                break;
            }
            case 'locks': {
                const result = await client.getLocks();
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            case 'activity': {
                const limit = getFlag(args, '--limit') || '20';
                const result = await client.getActivity(Number(limit));
                console.log(JSON.stringify(result, null, 2));
                break;
            }
            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        if (err.data) console.error(JSON.stringify(err.data, null, 2));
        process.exit(1);
    }
}

function getFlag(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return null;
    return args[idx + 1];
}

// Run CLI if executed directly
const isMainModule = process.argv[1] && (
    process.argv[1].endsWith('collab-client.js') ||
    process.argv[1].endsWith('collab-client')
);
if (isMainModule) {
    main();
}

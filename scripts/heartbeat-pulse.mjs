#!/usr/bin/env node
/**
 * heartbeat-pulse.mjs — Indefinite agent presence pulse
 *
 * Pure Node.js implementation — no shell PATH dependencies.
 * Sends heartbeat every 60s to keep agent registered on collab plane.
 * Runs until the process is killed or the pulse file is removed.
 *
 * Usage:
 *   AGENT_ID=qwen-code node scripts/heartbeat-pulse.mjs
 *
 * To stop:
 *   kill <pid>  or  rm /tmp/scholomance_pulse_<agent>.pid
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const AGENT_ID = process.env.AGENT_ID;
if (!AGENT_ID) {
    console.error('[pulse] AGENT_ID environment variable is required');
    process.exit(1);
}

const INTERVAL = parseInt(process.env.HEARTBEAT_INTERVAL || '60', 10);
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AGENT_KEY = process.env.AGENT_KEY;
const PULSE_FILE = `/tmp/scholomance_pulse_${AGENT_ID}.pid`;

// Record PID
fs.writeFileSync(PULSE_FILE, String(process.pid), 'utf8');

function cleanup() {
    console.error(`[pulse] Agent ${AGENT_ID} pulse stopped at ${new Date().toISOString()}`);
    try { fs.unlinkSync(PULSE_FILE); } catch {}
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

async function heartbeat() {
    try {
        const headers = { 'Content-Type': 'application/json', 'X-Agent-ID': AGENT_ID };
        if (AGENT_KEY) {
            headers['Authorization'] = `Bearer ${AGENT_KEY}`;
        }
        const res = await fetch(`${BASE_URL}/collab/agents/${AGENT_ID}/heartbeat`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ status: 'busy', current_task_id: null }),
        });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

console.error(`[pulse] Agent ${AGENT_ID} pulse started — heartbeat every ${INTERVAL}s`);
console.error(`[pulse] PID: ${process.pid} | Pulse file: ${PULSE_FILE}`);
console.error(`[pulse] Stop with: kill ${process.pid} or rm ${PULSE_FILE}`);

setInterval(async () => {
    if (!fs.existsSync(PULSE_FILE)) {
        console.error('[pulse] Pulse file removed — stopping');
        cleanup();
        return;
    }

    const result = await heartbeat();
    const time = new Date().toISOString().slice(11, 19);

    if (result) {
        console.error(`[pulse] ${time} — ${AGENT_ID} status=${result.status} last_seen=${result.last_seen}`);
    } else {
        console.error(`[pulse] ${time} — ${AGENT_ID} heartbeat failed (server may be down)`);
    }
}, INTERVAL * 1000);

// Send first heartbeat immediately
(async () => {
    const result = await heartbeat();
    if (result) {
        console.error(`[pulse] ${new Date().toISOString().slice(11, 19)} — ${AGENT_ID} status=${result.status} last_seen=${result.last_seen} (initial)`);
    }
})();

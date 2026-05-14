#!/usr/bin/env node
/**
 * collab-admin.js — Collab Plane Administration Tool
 *
 * Manages agent keys for passwordless remote access to the collab control plane.
 *
 * Usage:
 *   node scripts/collab-admin.js generate-agent-key --agent-id qwen-code --role backend
 *   node scripts/collab-admin.js rotate-agent-key --agent-id qwen-code
 *   node scripts/collab-admin.js revoke-agent-key --key-id <uuid>
 *   node scripts/collab-admin.js list-agent-keys [--agent-id qwen-code]
 *
 * Per PDR: live_website_collab_hosting_pdr.md §8.2
 */

import { collabPersistence } from '../codex/server/collab/collab.persistence.js';
import {
    generateAgentKey,
    revokeAgentKey,
    rotateAgentKey,
} from '../codex/server/collab/collab.agent-auth.js';
import fs from 'fs';

const CREATED_BY = process.env.ADMIN_AGENT_ID || 'angel';
const EXPIRY_DAYS = parseInt(process.env.COLLAB_KEY_EXPIRY_DAYS || '0', 10);

function getFlag(args, flag) {
    const idx = args.indexOf(flag);
    if (idx === -1) return null;
    if (idx + 1 >= args.length || args[idx + 1].startsWith('--')) return true;
    return args[idx + 1];
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log('Collab Plane Administration Tool');
        console.log('');
        console.log('Usage: node scripts/collab-admin.js <command> [options]');
        console.log('');
        console.log('Commands:');
        console.log('  generate-agent-key  Generate a new agent key');
        console.log('  rotate-agent-key    Revoke all keys and generate a new one');
        console.log('  revoke-agent-key    Revoke a specific key');
        console.log('  list-agent-keys     List all agent keys');
        console.log('');
        console.log('Options:');
        console.log('  --agent-id <id>     Agent ID');
        console.log('  --role <role>       Agent role (for generation)');
        console.log('  --key-id <uuid>     Key ID (for revocation)');
        console.log('  --expires <days>    Days until expiry (0 = never, default: 0)');
        console.log('');
        console.log('Environment:');
        console.log('  ADMIN_AGENT_ID          Creator identity (default: angel)');
        console.log('  COLLAB_KEY_EXPIRY_DAYS  Default key expiry in days (default: 0)');
        process.exit(0);
    }

    try {
        switch (command) {
            case 'generate-agent-key': {
                const agentId = getFlag(args, '--agent-id');
                if (!agentId) {
                    console.error('Error: --agent-id is required');
                    process.exit(1);
                }

                const expiresInDays = parseInt(getFlag(args, '--expires') || String(EXPIRY_DAYS), 10);

                const result = await generateAgentKey({
                    agentId,
                    createdBy: CREATED_BY,
                    expiresInDays,
                });

                console.log(`Agent key generated successfully.`);
                console.log(`  Agent ID:    ${agentId}`);
                console.log(`  Key ID:      ${result.keyId}`);
                console.log(`  Expires:     ${expiresInDays > 0 ? `${expiresInDays} days` : 'Never'}`);
                console.log(`  Created by:  ${CREATED_BY}`);
                console.log('');
                console.log('⚠️  SAVE THIS KEY NOW — it will never be shown again:');
                console.log('');
                console.log(`  ${result.plaintextKey}`);
                console.log('');
                console.log('Store this in your agent\'s secret manager or .env file as AGENT_KEY.');
                break;
            }

            case 'rotate-agent-key': {
                const agentId = getFlag(args, '--agent-id');
                if (!agentId) {
                    console.error('Error: --agent-id is required');
                    process.exit(1);
                }

                const expiresInDays = parseInt(getFlag(args, '--expires') || String(EXPIRY_DAYS), 10);

                const existingKeys = await collabPersistence.agent_keys.getByAgentId(agentId);
                const activeKeys = existingKeys.filter(k => !k.revoked_at);

                const result = await rotateAgentKey({
                    agentId,
                    createdBy: CREATED_BY,
                    expiresInDays,
                });

                console.log(`Agent key rotated successfully.`);
                console.log(`  Agent ID:      ${agentId}`);
                console.log(`  Keys revoked:  ${activeKeys.length}`);
                console.log(`  New Key ID:    ${result.keyId}`);
                console.log(`  Expires:       ${expiresInDays > 0 ? `${expiresInDays} days` : 'Never'}`);
                console.log('');
                console.log('⚠️  SAVE THIS KEY NOW — it will never be shown again:');
                console.log('');
                console.log(`  ${result.plaintextKey}`);
                console.log('');
                console.log('Update your agent\'s AGENT_KEY environment variable immediately.');
                break;
            }

            case 'revoke-agent-key': {
                const keyId = getFlag(args, '--key-id');
                if (!keyId) {
                    console.error('Error: --key-id is required');
                    process.exit(1);
                }

                const revoked = await revokeAgentKey(keyId);
                if (revoked) {
                    console.log(`Key ${keyId} has been revoked.`);
                } else {
                    console.log(`Key ${keyId} was not found or was already revoked.`);
                }
                break;
            }

            case 'list-agent-keys': {
                const agentId = getFlag(args, '--agent-id');
                const keys = agentId
                    ? await collabPersistence.agent_keys.getByAgentId(agentId)
                    : await collabPersistence.agent_keys.getAll();

                if (keys.length === 0) {
                    console.log('No agent keys found.');
                    break;
                }

                console.log(`Agent Keys (${keys.length} total):`);
                console.log('');
                console.log(`${'Key ID'.padEnd(38)} ${'Agent'.padEnd(16)} ${'Status'.padEnd(10)} ${'Expires'.padEnd(22)} Created`);
                console.log('-'.repeat(120));

                for (const key of keys) {
                    const status = key.revoked_at ? 'REVOKED' : (key.expires_at && new Date(key.expires_at) < new Date() ? 'EXPIRED' : 'ACTIVE');
                    const expires = key.expires_at || 'Never';
                    console.log(
                        `${key.id.padEnd(38)} ${key.agent_id.padEnd(16)} ${status.padEnd(10)} ${expires.padEnd(22)} ${key.created_at}`
                    );
                }
                break;
            }

            case 'generate-canonical-keys': {
                // Generate keys for all canonical agents per VAELRIX_LAW.md §14.6
                const canonicalAgents = [
                    { id: 'claude-ui', name: 'Claude UI', role: 'ui', capabilities: ['jsx', 'css', 'framer-motion', 'a11y'] },
                    { id: 'codex-backend', name: 'Codex Backend', role: 'backend', capabilities: ['node', 'fastify', 'schemas', 'mcp'] },
                    { id: 'gemini-backend', name: 'Gemini Mechanics', role: 'backend', capabilities: ['mechanics', 'balance', 'specs', 'systems'] },
                    { id: 'blackbox-qa', name: 'Blackbox QA', role: 'qa', capabilities: ['vitest', 'playwright', 'ci', 'debugging'] },
                    { id: 'arbiter-backend', name: 'Arbiter', role: 'backend', capabilities: ['architecture', 'review', 'verdicts'] },
                    { id: 'nexus-backend', name: 'Nexus', role: 'backend', capabilities: ['debugging', 'tracing', 'repro'] },
                    { id: 'unity-backend', name: 'Unity', role: 'backend', capabilities: ['docs', 'synthesis', 'navigation'] },
                    { id: 'angel-backend', name: 'Angel', role: 'backend', capabilities: ['override', 'arbitration', 'release'] },
                    { id: 'qwen-code', name: 'Qwen Code', role: 'backend', capabilities: ['node', 'fastify', 'bugfix', 'persistence'] },
                ];

                const expiresInDays = parseInt(getFlag(args, '--expires') || String(EXPIRY_DAYS), 10);
                const outputFile = getFlag(args, '--output') || null;

                console.log('Generating canonical agent keys...');
                console.log('');

                const results = [];
                for (const agent of canonicalAgents) {
                    // Register agent if not exists
                    try {
                        await collabPersistence.agents.register({
                            id: agent.id,
                            name: agent.name,
                            role: agent.role,
                            capabilities: agent.capabilities,
                        });
                    } catch {
                        // Agent already exists
                    }

                    // Check if agent already has an active key
                    const existingKeys = await collabPersistence.agent_keys.getByAgentId(agent.id);
                    const activeKeys = existingKeys.filter(k => !k.revoked_at && (!k.expires_at || new Date(k.expires_at) > new Date()));

                    if (activeKeys.length > 0 && !getFlag(args, '--force')) {
                        console.log(`  ${agent.id.padEnd(20)} — already has ${activeKeys.length} active key(s) (use --force to regenerate)`);
                        continue;
                    }

                    // Revoke existing keys if force
                    if (activeKeys.length > 0 && getFlag(args, '--force')) {
                        await collabPersistence.agent_keys.revokeAll(agent.id);
                    }

                    const result = await generateAgentKey({
                        agentId: agent.id,
                        createdBy: CREATED_BY,
                        expiresInDays,
                    });

                    results.push({ agent: agent.id, keyId: result.keyId, plaintextKey: result.plaintextKey });
                    console.log(`  ${agent.id.padEnd(20)} — key generated: ${result.keyId.slice(0, 8)}...`);
                }

                console.log('');
                console.log(`${results.length} key(s) generated.`);
                console.log('');

                if (results.length > 0) {
                    console.log('⚠️  SAVE THESE KEYS NOW — they will never be shown again:');
                    console.log('');

                    const output = results.map(r => `${r.agent}=${r.plaintextKey}`).join('\n');

                    if (outputFile) {
                        fs.writeFileSync(outputFile, output + '\n', 'utf8');
                        console.log(`Keys written to: ${outputFile}`);
                        console.log('');
                        console.log('⚠️  Distribute these keys securely to each agent operator.');
                        console.log('⚠️  Do NOT commit this file to the repository.');
                    } else {
                        console.log(output);
                        console.log('');
                        console.log('⚠️  Store each key in the corresponding agent\'s AGENT_KEY environment variable.');
                    }
                }
                break;
            }

            default:
                console.error(`Unknown command: ${command}`);
                process.exit(1);
        }
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    } finally {
        await collabPersistence.close();
    }
}

main();

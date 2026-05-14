/**
 * collab.agent-auth.js — Agent Key Authentication Middleware
 *
 * Provides passwordless, bearer-token authentication for remote AI agents
 * connecting to the collab control plane.
 *
 * Auth flow:
 * 1. Extract `Authorization: Bearer <key>` header
 * 2. Look up key hash in collab_agent_keys table
 * 3. Validate: not revoked, not expired
 * 4. Resolve agent identity from collab_agents table
 * 5. Set X-Agent-ID on request for downstream handlers
 *
 * Security:
 * - Keys are bcrypt-hashed, never stored plaintext
 * - Keys are never logged or returned in responses
 * - Failed auth returns generic 401 with no key details
 *
 * Per PDR: live_website_collab_hosting_pdr.md §8.1
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { collabPersistence } from './collab.persistence.js';

/**
 * Validate an agent key and return the agent identity.
 * @param {string} rawKey - The plaintext agent key
 * @returns {Promise<{id: string, name: string, role: string, capabilities: string[]}|null>}
 */
export async function validateAgentKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;

    const keys = await collabPersistence.agent_keys.getAll();
    const now = new Date();

    for (const keyRecord of keys) {
        // Check if revoked
        if (keyRecord.revoked_at) continue;

        // Check if expired
        if (keyRecord.expires_at) {
            const expiry = new Date(keyRecord.expires_at);
            if (expiry < now) continue;
        }

        // Verify the key against the stored hash
        try {
            const match = await bcrypt.compare(rawKey, keyRecord.key_hash);
            if (match) {
                // Resolve agent identity
                const agent = await collabPersistence.agents.getById(keyRecord.agent_id);
                if (agent) {
                    return {
                        id: agent.id,
                        name: agent.name,
                        role: agent.role,
                        capabilities: agent.capabilities || [],
                    };
                }
            }
        } catch {
            // bcrypt.compare can throw on invalid hash format
            continue;
        }
    }

    return null;
}

/**
 * Generate a new agent key and store its bcrypt hash.
 * @param {Object} params
 * @param {string} params.agentId - The agent ID to associate with this key
 * @param {string} params.createdBy - Agent ID of the creator (Angel)
 * @param {number} [params.expiresInDays] - Days until expiry (0 = never)
 * @returns {Promise<{keyId: string, plaintextKey: string}>}
 */
export async function generateAgentKey({ agentId, createdBy, expiresInDays = 0 }) {
    // Generate a cryptographically secure random key
    const randomBytes = crypto.randomBytes(32);
    const plaintextKey = `sk-scholomance-${agentId}-${randomBytes.toString('hex')}`;

    // Hash the key with bcrypt
    const keyHash = await bcrypt.hash(plaintextKey, 12);

    // Store the key
    const keyId = crypto.randomUUID();
    const expiresAt = expiresInDays > 0
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null;

    await collabPersistence.agent_keys.create({
        id: keyId,
        agentId,
        keyHash,
        expiresAt,
        createdBy,
    });

    return { keyId, plaintextKey };
}

/**
 * Revoke an agent key by keyId.
 * @param {string} keyId
 * @returns {boolean}
 */
export async function revokeAgentKey(keyId) {
    return await collabPersistence.agent_keys.revoke(keyId);
}

/**
 * Rotate an agent key: revoke all existing keys and generate a new one.
 * @param {Object} params
 * @param {string} params.agentId
 * @param {string} params.createdBy
 * @param {number} [params.expiresInDays]
 * @returns {Promise<{keyId: string, plaintextKey: string}>}
 */
export async function rotateAgentKey({ agentId, createdBy, expiresInDays = 0 }) {
    // Revoke all existing keys for this agent
    await collabPersistence.agent_keys.revokeAll(agentId);
    // Generate new key
    return generateAgentKey({ agentId, createdBy, expiresInDays });
}

/**
 * Fastify pre-handler for agent key authentication.
 * Tries bearer token auth first, falls through to let session auth handle it.
 */
export async function collabAgentKeyAuth(request, reply) {
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        // No bearer token — let session auth handle it
        return;
    }

    const rawKey = authHeader.slice(7);
    const agent = await validateAgentKey(rawKey);

    if (!agent) {
        return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired agent key',
        });
    }

    // Set agent identity for downstream handlers
    request.headers['x-agent-id'] = agent.id;
    request.agentContext = agent;
}

/**
 * Guard that requires either a valid user session or a valid agent key.
 */
export async function requireCollabAuth(request, reply) {
    // 1. Check for agent context (from collabAgentKeyAuth)
    if (request.agentContext?.id) {
        return;
    }

    // 2. Check for user session (standard auth)
    const user = request.session?.user;
    if (user?.id) {
        // In development, we allow even the bypass user to access collab
        // to ensure the browser UI can participate in the thought-thread.
        return;
    }

    // 3. Fallback: Unauthorized
    return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authentication required: session or agent key missing.',
    });
}

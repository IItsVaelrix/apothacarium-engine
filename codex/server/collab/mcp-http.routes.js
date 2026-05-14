import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { requireAuth } from '../auth-pre-handler.js';
import { collabAgentKeyAuth } from './collab.agent-auth.js';
import { createCollabMcpServer } from './mcp-bridge.js';

function getSessionIdFromHeaders(headers) {
    const header = headers['mcp-session-id'];
    return typeof header === 'string' && header.length > 0 ? header : null;
}

function sendMcpHttpError(reply, statusCode, message, code = -32000) {
    return reply.code(statusCode).send({
        jsonrpc: '2.0',
        error: {
            code,
            message,
        },
        id: null,
    });
}

async function forwardToTransport(request, reply, transport, parsedBody) {
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, parsedBody);
    return reply;
}

async function closeSessionEntry(entry) {
    if (!entry || entry.closing) return;

    entry.closing = true;

    if (typeof entry.server?.close === 'function') {
        await entry.server.close().catch(() => {});
        return;
    }

    if (typeof entry.transport?.close === 'function') {
        await entry.transport.close().catch(() => {});
    }
}

export async function collabMcpHttpAuth(request, reply) {
    await collabAgentKeyAuth(request, reply);

    if (reply.sent || request.agentContext) {
        return;
    }

    return requireAuth(request, reply);
}

export async function collabMcpHttpRoutes(fastify) {
    const sessions = new Map();

    fastify.addHook('preHandler', collabMcpHttpAuth);

    fastify.addHook('onClose', async () => {
        const activeSessions = Array.from(sessions.values());
        sessions.clear();
        await Promise.allSettled(activeSessions.map(closeSessionEntry));
    });

    fastify.post('/mcp', async (request, reply) => {
        const sessionId = getSessionIdFromHeaders(request.headers);

        try {
            if (sessionId) {
                const existingSession = sessions.get(sessionId);
                if (!existingSession) {
                    return sendMcpHttpError(reply, 404, 'Session not found');
                }

                return await forwardToTransport(request, reply, existingSession.transport, request.body);
            }

            if (!isInitializeRequest(request.body)) {
                return sendMcpHttpError(reply, 400, 'Bad Request: No valid session ID provided');
            }

            const server = createCollabMcpServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
                onsessioninitialized: (initializedSessionId) => {
                    sessions.set(initializedSessionId, { server, transport, closing: false });
                    fastify.log.info({ sessionId: initializedSessionId }, '[MCP] HTTP session initialized');
                },
            });

            transport.onclose = () => {
                const activeSessionId = transport.sessionId;
                if (!activeSessionId) return;

                const entry = sessions.get(activeSessionId);
                sessions.delete(activeSessionId);
                if (!entry?.closing) {
                    fastify.log.info({ sessionId: activeSessionId }, '[MCP] HTTP session closed');
                }
            };

            await server.connect(transport);
            return await forwardToTransport(request, reply, transport, request.body);
        } catch (error) {
            fastify.log.error({ err: error }, '[MCP] Failed to handle HTTP POST request');

            if (!reply.sent) {
                return sendMcpHttpError(reply, 500, 'Internal server error', -32603);
            }

            return reply;
        }
    });

    fastify.get('/mcp', async (request, reply) => {
        const sessionId = getSessionIdFromHeaders(request.headers);
        if (!sessionId) {
            return sendMcpHttpError(reply, 400, 'Bad Request: Missing MCP session ID');
        }

        const existingSession = sessions.get(sessionId);
        if (!existingSession) {
            return sendMcpHttpError(reply, 404, 'Session not found');
        }

        try {
            return await forwardToTransport(request, reply, existingSession.transport);
        } catch (error) {
            fastify.log.error({ err: error, sessionId }, '[MCP] Failed to handle HTTP GET request');
            if (!reply.sent) {
                return sendMcpHttpError(reply, 500, 'Internal server error', -32603);
            }
            return reply;
        }
    });

    fastify.delete('/mcp', async (request, reply) => {
        const sessionId = getSessionIdFromHeaders(request.headers);
        if (!sessionId) {
            return sendMcpHttpError(reply, 400, 'Bad Request: Missing MCP session ID');
        }

        const existingSession = sessions.get(sessionId);
        if (!existingSession) {
            return sendMcpHttpError(reply, 404, 'Session not found');
        }

        try {
            return await forwardToTransport(request, reply, existingSession.transport);
        } catch (error) {
            fastify.log.error({ err: error, sessionId }, '[MCP] Failed to handle HTTP DELETE request');
            if (!reply.sent) {
                return sendMcpHttpError(reply, 500, 'Internal server error', -32603);
            }
            return reply;
        }
    });
}

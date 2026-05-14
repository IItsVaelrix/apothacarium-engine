import { z } from 'zod';
import { requireLexiconSession } from '../auth-pre-handler.js';
import { createWorldService } from '../services/world.service.js';

const idSchema = z.string().trim().min(1).max(128);

const roomParamsSchema = z.object({
  roomId: idSchema,
});

const entityParamsSchema = z.object({
  entityId: idSchema,
});

const inspectBodySchema = z.object({
  roomId: idSchema.optional(),
}).strict();

function buildValidationError(reply, details) {
  return reply.status(400).send({
    error: 'Invalid request',
    details,
  });
}

function toIssueDetails(error) {
  return error?.issues ?? [];
}

function toRateLimitKey(request) {
  const userId = request.session?.user?.id;
  if (userId !== undefined && userId !== null) {
    return `user:${userId}`;
  }
  const sessionId = request.session?.sessionId;
  if (typeof sessionId === 'string' && sessionId.trim()) {
    return `session:${sessionId}`;
  }
  return `ip:${request.ip}`;
}

const csrfPreValidation = async (request, reply) => {
  if (typeof request.server?.csrfProtection !== 'function') {
    return reply.status(500).send({ message: 'CSRF protection is not initialized.' });
  }

  return new Promise((resolve, reject) => {
    request.server.csrfProtection(request, reply, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

export async function worldRoutes(fastify, opts = {}) {
  const worldService = opts.worldService || createWorldService({
    adapter: opts.adapter,
    persistence: opts.persistence,
  });

  fastify.get('/rooms/:roomId', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedParams = roomParamsSchema.safeParse(request.params ?? {});
      if (!parsedParams.success) {
        return buildValidationError(reply, toIssueDetails(parsedParams.error));
      }

      const snapshot = await worldService.getRoomSnapshot(parsedParams.data.roomId);
      if (!snapshot?.room) {
        return reply.status(404).send({ error: 'Room not found' });
      }
      return snapshot;
    },
  });

  fastify.get('/entities/:entityId', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedParams = entityParamsSchema.safeParse(request.params ?? {});
      if (!parsedParams.success) {
        return buildValidationError(reply, toIssueDetails(parsedParams.error));
      }

      const entity = await worldService.getEntityView(parsedParams.data.entityId);
      if (!entity?.ref?.entityId) {
        return reply.status(404).send({ error: 'Entity not found' });
      }
      return entity;
    },
  });

  fastify.post('/entities/:entityId/actions/inspect', {
    preValidation: [csrfPreValidation],
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedParams = entityParamsSchema.safeParse(request.params ?? {});
      if (!parsedParams.success) {
        return buildValidationError(reply, toIssueDetails(parsedParams.error));
      }

      const parsedBody = inspectBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return buildValidationError(reply, toIssueDetails(parsedBody.error));
      }

      const result = await worldService.inspectEntity(parsedParams.data.entityId, {
        roomId: parsedBody.data.roomId,
      });
      if (!result) {
        return reply.status(404).send({ error: 'Entity not found' });
      }
      if (result?.conflict && result?.entity) {
        return reply.status(409).send({
          error: 'Entity is not present in the requested room',
          entityId: result.entity.id,
          roomId: result.entity.roomId,
        });
      }

      return {
        action: 'inspect',
        entity: result,
        performedAt: new Date().toISOString(),
      };
    },
  });
}

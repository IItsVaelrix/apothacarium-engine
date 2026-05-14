/**
 * GrimDesign API route
 *
 * POST /api/grimdesign/analyze
 * Body:    { intent: string }
 * Returns: { signal: GrimSignal, decisions: GrimDesignDecisions }
 *
 * Developer tool — rate-limited to 30 req/min. Auth follows ambient session
 * handling (same as other analysis endpoints).
 */

import { z } from 'zod';
import { analyzeDesignIntent } from '../../core/grimdesign/intentAnalyzer.js';
import { resolveDesignDecisions } from '../../core/grimdesign/decisionEngine.js';

const MAX_INTENT_LENGTH = 500;

const grimdesignBodySchema = z.object({
  intent: z.string().min(1).max(MAX_INTENT_LENGTH),
});

/**
 * Registers GrimDesign routes on the Fastify instance.
 * @param {import('fastify').FastifyInstance} fastify
 */
export async function grimdesignRoutes(fastify) {
  fastify.post('/api/grimdesign/analyze', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = grimdesignBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      const signal    = await analyzeDesignIntent(parsed.data.intent);
      const decisions = resolveDesignDecisions(signal);

      return { signal, decisions };
    },
  });
}

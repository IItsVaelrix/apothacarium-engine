import { z } from 'zod';
import { createCombatScoreService } from '../services/combatScore.service.js';

const MAX_SCROLL_TEXT_LENGTH = 100;
const SchoolSchema = z.enum(['SONIC', 'PSYCHIC', 'VOID', 'ALCHEMY', 'WILL']);

const combatScoreBodySchema = z.object({
  scrollText: z.string().max(MAX_SCROLL_TEXT_LENGTH),
  weave: z.string().max(MAX_SCROLL_TEXT_LENGTH).optional(),
  playerId: z.string().trim().min(1).max(128).optional(),
  arenaSchool: SchoolSchema.optional(),
  opponentSchool: SchoolSchema.optional(),
}).strict();

export async function combatRoutes(fastify, opts = {}) {
  const combatScoreService = opts.combatScoreService || await createCombatScoreService({
    log: fastify.log,
  });

  fastify.addHook('onClose', async () => {
    await combatScoreService.close?.();
  });

  fastify.post('/api/combat/score', {
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = combatScoreBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      return combatScoreService.scoreScroll(parsed.data.scrollText, {
        weave: parsed.data.weave,
        playerId: parsed.data.playerId,
        arenaSchool: parsed.data.arenaSchool,
        opponentSchool: parsed.data.opponentSchool,
        session: request.session,
      });
    },
  });
}

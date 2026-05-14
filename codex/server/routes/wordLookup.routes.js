/**
 * Server-Side Word Lookup Routes
 * Provides cached, coalesced, rate-limited word lookups.
 * Sits between clients and external dictionary APIs to reduce redundant calls.
 *
 * Architecture:
 *   Client IndexedDB (L1) -> This endpoint (L2 Redis cache) -> External APIs (L3)
 *
 * @see ARCH.md section 1 - Fixes 1, 2, 4
 */

import { z } from 'zod';
import { createWordLookupService } from '../services/wordLookup.service.js';

const MAX_BATCH_SIZE = 50;
const MAX_WORD_LENGTH = 80;

const batchSchema = z.object({
  words: z.array(z.string().min(1).max(MAX_WORD_LENGTH)).min(1).max(MAX_BATCH_SIZE),
});

/**
 * Registers word lookup routes on the Fastify instance.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} opts
 */
export async function wordLookupRoutes(fastify, _opts) {
  const wordLookupService = createWordLookupService({
    redis: fastify.redis || null,
    log: fastify.log,
  });

  // Single word lookup
  fastify.get('/api/word-lookup/:word', {
    config: {
      rateLimit: { max: 30, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const { word } = request.params;
      if (!word || word.length > MAX_WORD_LENGTH) {
        return reply.status(400).send({ error: 'Invalid word' });
      }

      const { data, source, word: normalizedWord } = await wordLookupService.lookupWord(word);
      fastify.opsMetrics?.recordWordLookup?.(source);

      if (!data) {
        return reply.status(404).send({ error: 'Word not found', word: normalizedWord || word.toLowerCase() });
      }

      return { word: normalizedWord, data, source };
    },
  });

  // Batch word lookup
  fastify.post('/api/word-lookup/batch', {
    config: {
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const parsed = batchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      const { words } = parsed.data;
      return wordLookupService.lookupBatch(words);
    },
  });
}

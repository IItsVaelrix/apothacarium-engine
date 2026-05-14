import { z } from 'zod';
import { requireLexiconSession } from '../auth-pre-handler.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../../core/pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.SHARED;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const lookupParamsSchema = z.object({
  word: z.string().trim().min(1).max(100),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_LIMIT),
});

const suggestQuerySchema = z.object({
  prefix: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(100).default(DEFAULT_LIMIT),
});

const batchSchema = z.object({
  words: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
});

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

function mapSearchResults(entries, extractGloss) {
  return entries.map((entry) => ({
    headword: entry.headword,
    pos: entry.pos,
    definition: extractGloss(entry.senses),
    source: entry.source,
  }));
}

export async function lexiconRoutes(fastify, opts = {}) {
  const adapter = opts.adapter;
  if (!adapter) {
    throw new BytecodeError(
      ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MOD,
      ERROR_CODES.INVALID_STATE,
      { reason: 'lexiconRoutes requires opts.adapter', parameter: 'adapter' },
    );
  }

  fastify.get('/lookup/:word', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedParams = lookupParamsSchema.safeParse(request.params ?? {});
      if (!parsedParams.success) {
        return buildValidationError(reply, toIssueDetails(parsedParams.error));
      }

      const word = parsedParams.data.word;
      const entries = adapter.lookupWord(word, 5);
      const synonyms = typeof adapter.lookupSynonyms === 'function'
        ? adapter.lookupSynonyms(word, 20)
        : [];
      const antonyms = typeof adapter.lookupAntonyms === 'function'
        ? adapter.lookupAntonyms(word, 20)
        : [];
      const rhymeData = adapter.lookupRhymes(word, 50);

      let definition = null;
      if (entries.length > 0) {
        const first = entries[0];
        const gloss = typeof adapter.extractGloss === 'function'
          ? adapter.extractGloss(first?.senses)
          : null;
        if (gloss) {
          definition = {
            text: gloss,
            partOfSpeech: first?.pos || '',
            source: first?.source || 'scholomance',
          };
        }
      }

      return {
        word,
        definition,
        entries,
        synonyms,
        antonyms,
        rhymes: rhymeData.words,
        rhymeFamily: rhymeData.family,
        lore: { seed: word.toLowerCase() },
      };
    },
  });

  fastify.get('/search', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedQuery = searchQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return buildValidationError(reply, toIssueDetails(parsedQuery.error));
      }
      const { q, limit } = parsedQuery.data;
      const boundedLimit = Math.min(limit, MAX_LIMIT);
      const entries = adapter.searchEntries(q, boundedLimit);
      const extractGloss = typeof adapter.extractGloss === 'function'
        ? adapter.extractGloss
        : () => null;
      return {
        query: q,
        results: mapSearchResults(entries, extractGloss),
      };
    },
  });

  fastify.get('/suggest', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedQuery = suggestQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return buildValidationError(reply, toIssueDetails(parsedQuery.error));
      }
      const { prefix, limit } = parsedQuery.data;
      const boundedLimit = Math.min(limit, MAX_LIMIT);
      const results = adapter.suggestEntries(prefix, boundedLimit);
      return { prefix, results };
    },
  });

  fastify.post('/lookup-batch', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedBody = batchSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return buildValidationError(reply, toIssueDetails(parsedBody.error));
      }

      return {
        families: adapter.batchLookupFamilies(parsedBody.data.words),
      };
    },
  });

  fastify.post('/validate-batch', {
    preHandler: [requireLexiconSession],
    config: {
      rateLimit: {
        max: 30,
        timeWindow: '1 minute',
        keyGenerator: toRateLimitKey,
      },
    },
    handler: async (request, reply) => {
      const parsedBody = batchSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return buildValidationError(reply, toIssueDetails(parsedBody.error));
      }

      return {
        valid: adapter.batchValidateWords(parsedBody.data.words),
      };
    },
  });
}

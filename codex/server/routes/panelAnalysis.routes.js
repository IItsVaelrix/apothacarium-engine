/**
 * Server-side route for unified Read panel analysis payloads.
 * Backend-first source of truth for rhyme, scheme, score, and vowel panels.
 */

import { createHash } from 'crypto';
import { z } from 'zod';
import { createPanelAnalysisService } from '../services/panelAnalysis.service.js';
import { parseBooleanEnv, parsePositiveIntegerEnv } from '../utils/envFlags.js';

// SECURITY: Reduced max text length to prevent DoS via CPU/memory exhaustion
// Premium users can have higher limits via separate endpoint
const MAX_TEXT_LENGTH = 100_000; // 100KB max for standard users
const ANALYSIS_TIMEOUT_MS = 30_000; // 30 second timeout for analysis operations
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CACHE_MAX_SIZE = 1000;
const ENABLE_PANEL_ANALYSIS_CACHE = parseBooleanEnv('ENABLE_PANEL_ANALYSIS_CACHE', true);
const ENABLE_PANEL_ANALYSIS_REDIS_CACHE = parseBooleanEnv('ENABLE_PANEL_ANALYSIS_REDIS_CACHE', true);
const CACHE_TTL_MS = parsePositiveIntegerEnv('PANEL_ANALYSIS_CACHE_TTL_MS', DEFAULT_CACHE_TTL_MS);
const CACHE_TTL_SECONDS = Math.ceil(CACHE_TTL_MS / 1000);
const CACHE_MAX_SIZE = parsePositiveIntegerEnv('PANEL_ANALYSIS_CACHE_MAX_SIZE', DEFAULT_CACHE_MAX_SIZE);
const REDIS_CACHE_PREFIX = 'panel-analysis:';

const panelAnalysisBodySchema = z.object({
  text: z.string().max(MAX_TEXT_LENGTH),
  nluMode: z.enum(['direct', 'generate']).optional(),
});

function getCacheKey(text) {
  return createHash('sha256').update(String(text || '')).digest('hex');
}

function getFromMemoryCache(cache, key) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (Date.now() - cached.timestamp >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function setInMemoryCache(cache, key, value) {
  cache.set(key, {
    value,
    timestamp: Date.now(),
  });

  while (cache.size > CACHE_MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) {
      break;
    }
    cache.delete(firstKey);
  }
}

function getDurationMs(startedAtMs) {
  return Math.max(0, Date.now() - startedAtMs);
}

function setAnalysisResponseHeaders(reply, cacheStatus, durationMs) {
  reply.header('X-Cache', cacheStatus);
  reply.header('X-Analysis-Duration-Ms', String(Math.round(Math.max(0, Number(durationMs) || 0))));
  reply.header('X-Analysis-Cache-Ttl-Ms', String(CACHE_TTL_MS));
}

/**
 * Registers panel analysis routes on the Fastify instance.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{
 *   panelAnalysisService?: ReturnType<typeof createPanelAnalysisService>,
 *   enableRhymeAstrology?: boolean,
 * }} [opts]
 */
export async function panelAnalysisRoutes(fastify, opts = {}) {
  const panelAnalysisService = opts.panelAnalysisService || await createPanelAnalysisService({
    log: fastify.log,
    enableRhymeAstrology: opts.enableRhymeAstrology ?? fastify.featureFlags?.rhymeAstrology,
    corpusService: opts.corpusService,
  });
  const memoryCache = new Map();

  fastify.post('/api/analysis/panels', {
    config: {
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      const startedAtMs = Date.now();
      const parsed = panelAnalysisBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid request',
          details: parsed.error.issues,
        });
      }

      const cacheKey = getCacheKey(parsed.data.text);
      const redisClient = fastify.redis;

      try {
        if (ENABLE_PANEL_ANALYSIS_CACHE) {
          const memoryCached = getFromMemoryCache(memoryCache, cacheKey);
          if (memoryCached) {
            const durationMs = getDurationMs(startedAtMs);
            setAnalysisResponseHeaders(reply, 'HIT', durationMs);
            fastify.opsMetrics?.recordPanelAnalysis?.({
              source: 'memory',
              durationMs,
              ok: true,
            });
            return memoryCached;
          }

          if (ENABLE_PANEL_ANALYSIS_REDIS_CACHE && redisClient?.isReady) {
            try {
              const cached = await redisClient.get(`${REDIS_CACHE_PREFIX}${cacheKey}`);
              if (cached) {
                const parsedCached = JSON.parse(cached);
                setInMemoryCache(memoryCache, cacheKey, parsedCached);
                const durationMs = getDurationMs(startedAtMs);
                setAnalysisResponseHeaders(reply, 'HIT-REDIS', durationMs);
                fastify.opsMetrics?.recordPanelAnalysis?.({
                  source: 'redis',
                  durationMs,
                  ok: true,
                });
                return parsedCached;
              }
            } catch (error) {
              fastify.log.warn({ err: error }, '[PanelAnalysisRoute] Redis cache read failed');
            }
          }
        }

        // SECURITY: Wrap analysis in timeout to prevent DoS via hanging operations
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Analysis timeout: operation exceeded 30 seconds')), ANALYSIS_TIMEOUT_MS);
        });
        
        const data = await Promise.race([
          panelAnalysisService.analyzePanels(parsed.data.text, {
            nluMode: parsed.data.nluMode,
          }),
          timeoutPromise,
        ]);
        const responsePayload = {
          source: 'server-analysis',
          data,
        };

        if (ENABLE_PANEL_ANALYSIS_CACHE) {
          setInMemoryCache(memoryCache, cacheKey, responsePayload);
        }

        if (ENABLE_PANEL_ANALYSIS_CACHE && ENABLE_PANEL_ANALYSIS_REDIS_CACHE && redisClient?.isReady) {
          try {
            await redisClient.setEx(
              `${REDIS_CACHE_PREFIX}${cacheKey}`,
              CACHE_TTL_SECONDS,
              JSON.stringify(responsePayload)
            );
          } catch (error) {
            fastify.log.warn({ err: error }, '[PanelAnalysisRoute] Redis cache write failed');
          }
        }

        const durationMs = getDurationMs(startedAtMs);
        const cacheStatus = ENABLE_PANEL_ANALYSIS_CACHE ? 'MISS' : 'BYPASS';
        setAnalysisResponseHeaders(reply, cacheStatus, durationMs);
        fastify.opsMetrics?.recordPanelAnalysis?.({
          source: 'miss',
          durationMs,
          ok: true,
        });
        return responsePayload;
      } catch (error) {
        const durationMs = getDurationMs(startedAtMs);
        fastify.opsMetrics?.recordPanelAnalysis?.({
          source: 'miss',
          durationMs,
          ok: false,
        });
        throw error;
      }
    },
  });

  fastify.addHook('onClose', async () => {
    panelAnalysisService.close?.();
  });
}

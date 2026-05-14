import {
  RHYME_ASTROLOGY_QUERY_ROUTE,
  normalizeRhymeAstrologyQuery,
  validateRhymeAstrologyResult,
} from '../../core/rhyme-astrology/contracts.js';
import { createRhymeAstrologyQueryEngine } from '../../runtime/rhyme-astrology/queryEngine.js';
import { createRhymeAstrologyLexiconRepo } from '../../services/rhyme-astrology/lexiconRepo.js';
import { createRhymeAstrologyIndexRepo } from '../../services/rhyme-astrology/indexRepo.js';
import { resolveRhymeAstrologyArtifactPaths } from '../utils/rhymeAstrologyPaths.js';
const DEFAULT_CACHE_SIZE = 500;
const DEFAULT_BUCKET_QUERY_CAP = 200;
const DEFAULT_QUERY_MAX_CLUSTERS = 12;

/**
 * @param {number | undefined | null} value
 * @param {number} fallback
 * @returns {number}
 */
function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) return fallback;
  return numeric;
}

/**
 * @param {import('fastify').FastifyReply} reply
 * @param {any} error
 */
function sendValidationError(reply, error) {
  return reply.status(400).send({
    error: 'Invalid request',
    details: Array.isArray(error?.issues)
      ? error.issues
      : [{ message: String(error?.message || 'Invalid request') }],
  });
}

/**
 * Registers rhyme-astrology query routes.
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{
 *   queryEngine?: ReturnType<typeof createRhymeAstrologyQueryEngine>,
 *   outputDir?: string,
 *   lexiconDbPath?: string,
 *   indexDbPath?: string,
 *   edgesDbPath?: string,
 *   cacheSize?: number,
 *   bucketCandidateCap?: number,
 *   maxClusters?: number,
 *   phonemeEngine?: any,
 * }} [options]
 */
export async function rhymeAstrologyRoutes(fastify, options = {}) {
  let ownsQueryEngine = false;
  let queryEngine = options.queryEngine || null;

  if (!queryEngine) {
    const artifactPaths = resolveRhymeAstrologyArtifactPaths(options);
    if (artifactPaths.usedExistingArtifactsFallback || artifactPaths.usedProductionPersistentFallback) {
      fastify.log.warn({
        configuredOutputDir: artifactPaths.configuredOutputDir,
        resolvedOutputDir: artifactPaths.outputDir,
        candidateOutputDirs: artifactPaths.candidateOutputDirs,
      }, '[RhymeAstrologyRoute] Falling back to detected artifact bundle.');
    }
    const lexiconRepo = createRhymeAstrologyLexiconRepo(artifactPaths.lexiconDbPath, {
      log: fastify.log,
    });
    const indexRepo = createRhymeAstrologyIndexRepo({
      indexDbPath: artifactPaths.indexDbPath,
      edgesDbPath: artifactPaths.edgesDbPath,
      log: fastify.log,
    });

    queryEngine = createRhymeAstrologyQueryEngine({
      lexiconRepo,
      indexRepo,
      phonemeEngine: options.phonemeEngine,
      cacheSize: toPositiveInteger(
        options.cacheSize ?? process.env.RHYME_ASTROLOGY_CACHE_SIZE,
        DEFAULT_CACHE_SIZE
      ),
      bucketCandidateCap: toPositiveInteger(
        options.bucketCandidateCap ?? process.env.RHYME_ASTROLOGY_BUCKET_QUERY_CAP,
        DEFAULT_BUCKET_QUERY_CAP
      ),
      maxClusters: toPositiveInteger(
        options.maxClusters ?? process.env.RHYME_ASTROLOGY_QUERY_MAX_CLUSTERS,
        DEFAULT_QUERY_MAX_CLUSTERS
      ),
      log: fastify.log,
    });

    ownsQueryEngine = true;
  }

  fastify.get(RHYME_ASTROLOGY_QUERY_ROUTE, {
    config: {
      rateLimit: { max: 60, timeWindow: '1 minute' },
    },
    handler: async (request, reply) => {
      let normalizedQuery;
      try {
        normalizedQuery = normalizeRhymeAstrologyQuery(request.query ?? {});
      } catch (error) {
        return sendValidationError(reply, error);
      }

      try {
        const result = await queryEngine.query(normalizedQuery);
        const validated = validateRhymeAstrologyResult(result);
        reply.header('X-Rhyme-Astrology-Cache', validated.diagnostics.cacheHit ? 'HIT' : 'MISS');
        reply.header('X-Rhyme-Astrology-Query-Time-Ms', String(Math.round(validated.diagnostics.queryTimeMs)));
        reply.header('X-Rhyme-Astrology-Candidates', String(validated.diagnostics.candidateCount));
        return validated;
      } catch (error) {
        fastify.log.error({ err: error }, '[RhymeAstrologyRoute] Query failed.');
        return reply.status(500).send({
          error: 'RhymeAstrology query failed',
        });
      }
    },
  });

  if (ownsQueryEngine) {
    fastify.addHook('onClose', async () => {
      queryEngine.close?.();
    });
  }
}

/**
 * The CODEx Authority Server entry point.
 * Built with Fastify.
 *
 * @see AI_Architecture_V2.md section 3.1, 5.2, and 8.3
 */

import 'dotenv/config';

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import fastifySession from '@fastify/session';
import { RedisStore } from 'connect-redis';
import { TursoSessionStore } from './services/sqliteSessionStore.js';
import csrf from '@fastify/csrf-protection';
import { createClient } from 'redis';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import fastifyCors from '@fastify/cors';
import crypto from 'crypto';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readdirSync, createWriteStream, unlinkSync, renameSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { requireAuth } from './auth-pre-handler.js';
import { userPersistence } from './user.persistence.js';
import { collabPersistence } from './collab/collab.persistence.js';
import { collabRoutes } from './collab/collab.routes.js';
import { collabMcpHttpRoutes } from './collab/mcp-http.routes.js';
import { startAgentQaSweep, stopAgentQaSweep } from './collab/collab.agent-qa.js';
import { wordLookupRoutes } from './routes/wordLookup.routes.js';
import { panelAnalysisRoutes } from './routes/panelAnalysis.routes.js';
import { grimdesignRoutes } from './routes/grimdesign.routes.js';
import { combatRoutes } from './routes/combat.routes.js';
import { lexiconRoutes } from './routes/lexicon.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { worldRoutes } from './routes/world.routes.js';
import { isApiRoutePath, isStaticAssetPath, stripQueryFromUrl } from './notFound.utils.js';
import { createOpsMetrics } from './observability.metrics.js';
import { PhonemeEngine } from '../core/phonology/phoneme.engine.js';
import { authorizeAudioRequest, buildAudioUnauthorizedPayload } from './audioAuth.js';
import { createImmunityService } from './services/immunity.service.js';
import { collabService } from './collab/collab.service.js';
import '../runtime/apoptosis.listener.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../core/pixelbrain/bytecode-error.js';
import {
  BytecodeHealth,
  HEALTH_CODES,
  encodeModuleHealth,
  encodeBytecodeHealth,
} from '../core/diagnostic/BytecodeHealth.js';

const BYTECODE_MOD = MODULE_IDS.SHARED;
import { createLexiconAdapter } from './adapters/lexicon.sqlite.adapter.js';
import { createCorpusAdapter } from './adapters/corpus.sqlite.adapter.js';
import { createCorpusService } from './services/corpus.service.js';
import { corpusRoutes } from './routes/corpus.routes.js';
import { rhymeAstrologyRoutes } from './routes/rhymeAstrology.routes.js';
import { resolveRhymeAstrologyArtifactPaths } from './utils/rhymeAstrologyPaths.js';
import { imageAnalysisRoutes } from './routes/imageAnalysis.routes.js';
import { registerSchoolStylesRoutes } from './routes/schoolStyles.routes.js';
import { diagnosticRoutes } from './routes/diagnostic.routes.js';
import { createMailQueueWorker, createMailerService } from './services/mailer.service.js';
import { R2AudioAdapter } from './services/r2Audio.adapter.js';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_TEST_RUNTIME =
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST === 'true' ||
    typeof process.env.VITEST_WORKER_ID !== 'undefined' ||
    typeof process.env.JEST_WORKER_ID !== 'undefined';

function parseBooleanEnv(name, defaultValue = false) {
    const rawValue = process.env[name];
    if (rawValue === undefined) {
        return defaultValue;
    }
    if (rawValue === 'true') {
        return true;
    }
    if (rawValue === 'false') {
        return false;
    }
    throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, BYTECODE_MOD,
        ERROR_CODES.INVALID_VALUE,
        { parameter: name, expectedValue: 'true|false', actualValue: rawValue },
    );
}

function parseTrustProxyEnv() {
    const rawValue = process.env.TRUST_PROXY;
    if (rawValue === undefined) {
        return false;
    }
    if (rawValue === 'true') {
        return true;
    }
    if (rawValue === 'false') {
        return false;
    }
    const maybeNumber = Number(rawValue);
    if (Number.isInteger(maybeNumber) && maybeNumber >= 0) {
        return maybeNumber;
    }
    // Supports trust proxy values like "loopback" or CIDR strings.
    return rawValue;
}

function parsePositiveIntEnv(name, defaultValue) {
    const rawValue = process.env[name];
    if (rawValue === undefined) return defaultValue;
    const parsed = Number(rawValue);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }
    throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, BYTECODE_MOD,
        ERROR_CODES.INVALID_VALUE,
        { parameter: name, expectedValue: 'positive integer', actualValue: rawValue },
    );
}

function getAudioAdminToken() {
    const token = typeof process.env.AUDIO_ADMIN_TOKEN === 'string'
        ? process.env.AUDIO_ADMIN_TOKEN.trim()
        : '';
    if (IS_PRODUCTION && token.length === 0) {
        throw new BytecodeError(
            ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, BYTECODE_MOD,
            ERROR_CODES.MISSING_REQUIRED,
            { parameter: 'AUDIO_ADMIN_TOKEN', environment: 'production' },
        );
    }
    return token.length > 0 ? token : null;
}

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        if (IS_PRODUCTION && !IS_TEST_RUNTIME) {
            throw new BytecodeError(
                ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, BYTECODE_MOD,
                ERROR_CODES.MISSING_REQUIRED,
                { parameter: 'SESSION_SECRET', environment: 'production' },
            );
        }
        // SECURITY: Use fastify.log for production-safe logging
        fastify.log.warn('[SESSION] Using development secret - NOT FOR PRODUCTION');
        return crypto.randomBytes(32).toString('hex');
    }
    // SECURITY: Enforce minimum secret length in all environments
    if (secret.length < 32) {
        if (IS_PRODUCTION && !IS_TEST_RUNTIME) {
            throw new BytecodeError(
                ERROR_CATEGORIES.RANGE, ERROR_SEVERITY.CRIT, BYTECODE_MOD,
                ERROR_CODES.BELOW_MIN,
                { parameter: 'SESSION_SECRET', value: secret.length, minimum: 32 },
            );
        }
        // SECURITY: Use fastify.log instead of console.warn
        fastify.log.warn('[SESSION] SESSION_SECRET is shorter than 32 characters; consider using a longer secret.');
    }
    return secret;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_DIST_PATH = path.join(PROJECT_ROOT, 'dist');
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIST_PATH, 'index.html');
const PUBLIC_PATH = path.join(PROJECT_ROOT, 'public');
const TRUST_PROXY = parseTrustProxyEnv();
const ENABLE_COLLAB_API = parseBooleanEnv('ENABLE_COLLAB_API', !IS_PRODUCTION);
const ENABLE_RHYME_ASTROLOGY = parseBooleanEnv('ENABLE_RHYME_ASTROLOGY', true);
const AUDIO_UPLOAD_PATH = process.env.AUDIO_STORAGE_PATH 
    ? path.resolve(process.env.AUDIO_STORAGE_PATH) 
    : path.join(PUBLIC_PATH, 'audio');
const SCHOLOMANCE_DICT_PATH = typeof process.env.SCHOLOMANCE_DICT_PATH === 'string' &&
    process.env.SCHOLOMANCE_DICT_PATH.trim().length > 0
    ? path.resolve(process.env.SCHOLOMANCE_DICT_PATH)
    : null;
const SCHOLOMANCE_CORPUS_PATH = typeof process.env.SCHOLOMANCE_CORPUS_PATH === 'string' &&
    process.env.SCHOLOMANCE_CORPUS_PATH.trim().length > 0
    ? path.resolve(process.env.SCHOLOMANCE_CORPUS_PATH)
    : null;

// Ensure audio directory exists
if (!existsSync(AUDIO_UPLOAD_PATH)) {
    mkdirSync(AUDIO_UPLOAD_PATH, { recursive: true });
}

export const fastify = Fastify({
  logger: true,
  trustProxy: TRUST_PROXY
});

const SESSION_SECRET = getSessionSecret();
fastify.decorate('opsMetrics', createOpsMetrics());
fastify.decorate('featureFlags', Object.freeze({
  rhymeAstrology: ENABLE_RHYME_ASTROLOGY,
}));
const lexiconAdapter = createLexiconAdapter(SCHOLOMANCE_DICT_PATH, { log: fastify.log });
const corpusAdapter = createCorpusAdapter(SCHOLOMANCE_CORPUS_PATH, { log: fastify.log });
const corpusService = createCorpusService({ dbPath: SCHOLOMANCE_CORPUS_PATH, log: fastify.log });

// Register multipart for uploads
fastify.register(multipart, {
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
    }
});

// ─── Phase 3: Remote Agent Access Configuration ────────────────────────────

// CORS allow-list for remote agent access
const COLLAB_ALLOWED_ORIGINS = (process.env.COLLAB_ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

const COLLAB_REMOTE_ACCESS = process.env.COLLAB_REMOTE_ACCESS === 'true';

if (COLLAB_REMOTE_ACCESS && COLLAB_ALLOWED_ORIGINS.length > 0) {
    fastify.register(fastifyCors, {
        origin: COLLAB_ALLOWED_ORIGINS,
        methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-ID'],
        exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
        credentials: true,
        maxAge: 86400, // 24h preflight cache
    });
    fastify.log.info(`[CORS] Remote access enabled. Origins: ${COLLAB_ALLOWED_ORIGINS.join(', ')}`);
} else {
    // Default: allow same origin for local development
    fastify.register(fastifyCors, {
        origin: true, // Reflects request origin (CORS disabled for same-origin)
        credentials: true,
    });
}

// HTTPS configuration for production
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const HTTPS_KEY_PATH = process.env.HTTPS_KEY_PATH;
const HTTPS_CERT_PATH = process.env.HTTPS_CERT_PATH;

if (HTTPS_ENABLED) {
    if (!HTTPS_KEY_PATH || !HTTPS_CERT_PATH) {
        fastify.log.warn('[HTTPS] HTTPS enabled but HTTPS_KEY_PATH or HTTPS_CERT_PATH not set');
    } else {
        fastify.log.info('[HTTPS] HTTPS configured for production');
    }
}

// Remote agent rate limiting (separate bucket from general traffic)
const COLLAB_AGENT_RATE_LIMIT_MAX = parseInt(process.env.COLLAB_AGENT_RATE_LIMIT_MAX || '120', 10);
const COLLAB_AGENT_RATE_LIMIT_WINDOW = process.env.COLLAB_AGENT_RATE_LIMIT_WINDOW || '1 minute';

const SESSION_COOKIE_NAME = 'scholomance.sid';
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const TURSO_USER_DB_URL = process.env.TURSO_USER_DB_URL;
const DEFAULT_API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 5000);
const SHUTDOWN_TIMEOUT_MS = parsePositiveIntEnv('SHUTDOWN_TIMEOUT_MS', 10000);
const AUDIO_ADMIN_TOKEN = getAudioAdminToken();
const SERVER_BASE_URL = String(
    process.env.PUBLIC_SERVER_URL ||
    process.env.VITE_API_BASE_URL ||
    `http://localhost:${PORT}`
).trim();
const PUBLIC_APP_URL = String(
    process.env.PUBLIC_APP_URL ||
    process.env.VITE_PUBLIC_APP_URL ||
    (IS_PRODUCTION ? SERVER_BASE_URL : 'http://localhost:5173')
).trim();
const mailerService = createMailerService(fastify.log, {
    appBaseUrl: SERVER_BASE_URL,
    appName: 'Scholomance',
});
const mailQueueWorker = createMailQueueWorker(mailerService, {
    logger: fastify.log,
});
const SHOULD_SERVE_FRONTEND =
    IS_PRODUCTION &&
    process.env.SERVE_FRONTEND !== 'false' &&
    existsSync(FRONTEND_INDEX_PATH);
const RHYME_ASTROLOGY_PATHS = resolveRhymeAstrologyArtifactPaths({
    projectRoot: PROJECT_ROOT,
    isProduction: IS_PRODUCTION,
});
const RHYME_ASTROLOGY_CACHE_SIZE = parsePositiveIntEnv('RHYME_ASTROLOGY_CACHE_SIZE', 500);
const RHYME_ASTROLOGY_BUCKET_QUERY_CAP = parsePositiveIntEnv('RHYME_ASTROLOGY_BUCKET_QUERY_CAP', 200);
const RHYME_ASTROLOGY_QUERY_MAX_CLUSTERS = parsePositiveIntEnv('RHYME_ASTROLOGY_QUERY_MAX_CLUSTERS', 12);

const progressionBodySchema = z.object({
    xp: z.number().int().min(0),
    unlockedSchools: z.array(z.string()).min(1),
});

const scrollParamsSchema = z.object({
    id: z.string().min(1).max(128),
});

const scrollBodySchema = z.object({
    title: z.string().trim().min(1).max(256),
    content: z.string().max(500000).optional().default(''),
    submit: z.boolean().optional().default(false),
});

function toFastifySchema(zodSchema) {
    const schema = zodToJsonSchema(zodSchema, { target: 'draft-7' });
    if (schema && typeof schema === 'object' && '$schema' in schema) {
        delete schema.$schema;
    }
    return schema;
}

function buildExternalApiUrl(baseUrl, params) {
    const url = new URL(baseUrl);
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.set(key, String(value));
        }
    });
    return url.toString();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_API_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new BytecodeError(
                ERROR_CATEGORIES.HOOK, ERROR_SEVERITY.WARN, BYTECODE_MOD,
                ERROR_CODES.HOOK_TIMEOUT,
                { timeoutMs, operation: 'server request' },
            );
        }
        throw error;
    }
}

fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;
  
  // Log the error with request details
  request.log.error({
    err: error,
    method: request.method,
    url: request.url,
    sessionId: request.session?.id,
    statusCode
  }, '[SERVER] Unhandled error');

  if (statusCode >= 500) {
    reply.status(statusCode).send({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred.',
      bytecode: error.code || 'UNKNOWN_ERROR'
    });
  } else {
    reply.status(statusCode).send(error);
  }
});

// 1. Initialize session store
let sessionStore = null;

const enableRedisSessions = process.env.ENABLE_REDIS_SESSIONS === 'true';
const hasTurso = !!process.env.TURSO_USER_DB_URL;

// Prefer Redis ONLY if explicitly requested.
// Otherwise, prefer Turso if available.
// Fallback to local SQLite session store if neither is true.
const useRedisStore = enableRedisSessions;
const useTursoStore = !enableRedisSessions && (hasTurso || IS_PRODUCTION);

let redisClient = null;

if (useRedisStore) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const isUpstash = redisUrl.includes('upstash.io');
  const isRedisLabs = redisUrl.includes('redislabs.com');
  const isTls = redisUrl.startsWith('rediss://');
  
  fastify.log.info(`[REDIS] Initializing ${isUpstash ? 'Upstash ' : isRedisLabs ? 'RedisLabs ' : ''}Redis connection (TLS: ${isTls})...`);
  
  redisClient = createClient({ 
    url: redisUrl,
    socket: {
      tls: isTls ? true : undefined, // Explicitly enable TLS for rediss://
      reconnectStrategy: (retries) => {
        // Stop retrying after 10 attempts to prevent hanging forever
        if (retries > 10) {
          fastify.log.error('[REDIS] Max reconnection attempts reached. Disabling Redis sessions.');
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(retries * 100, 3000);
        return delay;
      },
      connectTimeout: 5000, // 5 second connection timeout
      // Upstash sometimes closes idle connections, so we set a heartbeat
      keepAlive: 5000 
    }
  });
  
  redisClient.on('error', (err) => {
    // SECURITY: Log error metadata without exposing stack traces or internals
    fastify.log.error({
      message: '[REDIS] Client Error',
      code: err.code,
      name: err.name,
      syscall: err.syscall,
      address: err.address,
      port: err.port,
    });
  });
  redisClient.on('connect', () => fastify.log.info('[REDIS] Client Connected'));
  redisClient.on('ready', () => fastify.log.info('[REDIS] Client Ready'));
  
  sessionStore = new RedisStore({ 
    client: redisClient,
    prefix: "scholo:sess:",
  });
} else {
  fastify.log.info(`[SESSION] Initializing SQLite-backed session store (Turso: ${hasTurso})...`);
  // userPersistence.db is the unified wrapper (better-sqlite3 or libsql)
  sessionStore = new TursoSessionStore(userPersistence.db || userPersistence);
}

function getLivenessReport() {
  return {
    status: 'live',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}

function isDatabaseReady(status) {
  return Boolean(
    status &&
    typeof status === 'object' &&
    Number.isInteger(status.version) &&
    status.version >= 1
  );
}

function getReadinessReport() {
  const userDbStatus = userPersistence.getStatus?.() ?? null;
  const collabDbStatus = collabPersistence.getStatus?.() ?? null;
  const userDbReady = isDatabaseReady(userDbStatus);
  const collabDbReady = isDatabaseReady(collabDbStatus);
  const redisReady = !useRedisStore || Boolean(redisClient?.isReady);
  const ready = userDbReady && collabDbReady && redisReady;

  return {
    status: ready ? 'ready' : 'degraded',
    ready,
    timestamp: new Date().toISOString(),
    checks: {
      userDb: {
        ready: userDbReady,
        version: userDbStatus?.version ?? null,
        path: userDbStatus?.path ?? null,
      },
      collabDb: {
        ready: collabDbReady,
        version: collabDbStatus?.version ?? null,
        path: collabDbStatus?.path ?? null,
      },
      redis: {
        ready: redisReady,
        enabled: useRedisStore,
        connected: Boolean(redisClient?.isOpen),
      },
    },
  };
}

// 2. Register cookie and session plugins
await fastify.register(fastifyCookie);
await fastify.register(fastifyWebsocket);
const sessionOptions = {
  secret: SESSION_SECRET || 'dev-only-secret-key-not-for-production-use-32chars',
  cookieName: SESSION_COOKIE_NAME,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 4 * 60 * 60 * 1000, // 4 hours
    path: '/',
  },
  saveUninitialized: true,
  rolling: true,
};

if (sessionStore) {
  sessionOptions.store = sessionStore;
}

await fastify.register(fastifySession, sessionOptions);

// Register CSRF protection after session.
fastify.register(csrf, { sessionPlugin: '@fastify/session' });

const csrfPreValidation = async (request, reply) => {
  if (typeof fastify.csrfProtection !== 'function') {
    return reply.status(500).send({ message: 'CSRF protection is not initialized.' });
  }
  return new Promise((resolve, reject) => {
    fastify.csrfProtection(request, reply, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

function authorizeAudioRouteRequest(request) {
  return authorizeAudioRequest(request, {
    isProduction: IS_PRODUCTION,
    configuredAdminToken: AUDIO_ADMIN_TOKEN,
  });
}

// Register Helmet for security headers
fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://suno.com", "https://www.suno.com"],
      connectSrc: ["'self'", "https://api.datamuse.com", "https://api.dictionaryapi.dev"],
      mediaSrc: ["'self'", "https://audiocdn001.suno.ai", "https://cdn1.suno.ai", "blob:", "data:"],
    },
  },
});

fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 1_000_000 },
    fastify.getDefaultJsonParser('error', 'error'),
);

// SECURITY: PreHandler to enforce Content-Type on state-changing endpoints
function requireJsonContentType(request, reply) {
  const contentType = request.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return reply.status(415).send({
      error: 'Unsupported Media Type',
      message: 'Content-Type must be application/json',
    });
  }
}

// 3. Register global rate limiting (per-user when authenticated, per-IP otherwise)
fastify.register(rateLimit, {
  global: true,
  max: 150,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    // Use session user ID for authenticated users so each user gets their own budget.
    // Falls back to IP for unauthenticated requests.
    return request.session?.user?.id || request.ip;
  },
  errorResponseBuilder: (_request, _reply) => {
    fastify.opsMetrics.increment('rateLimitHits');
    return {
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'You have exceeded the request limit. Please try again later.',
    };
  },
});

// Serve uploaded archive tracks directly from /audio/*
fastify.register(fastifyStatic, {
  root: AUDIO_UPLOAD_PATH,
  prefix: '/audio/',
  decorateReply: false,
});

// Health route
fastify.get('/health/live', async () => {
  return getLivenessReport();
});

fastify.get('/health/ready', async (_request, reply) => {
  const readiness = getReadinessReport();
  const statusCode = readiness.ready ? 200 : 503;
  return reply.code(statusCode).send(readiness);
});

fastify.get('/health', async () => {
  return {
    ...getLivenessReport(),
    message: 'Scholomance CODEx Server is running.',
  };
});

// SECURITY: /metrics exposes internal system information (PID, uptime, feature flags, counters)
// Requires authentication to prevent reconnaissance attacks
fastify.get('/metrics', { 
    preHandler: [requireAuth],
    config: {
        rateLimit: {
            max: 10,
            timeWindow: '1 minute'
        }
    }
}, async (_request) => {
  const readiness = getReadinessReport();
  return {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    readiness: {
      ready: readiness.ready,
      status: readiness.status,
    },
    featureFlags: fastify.featureFlags,
    counters: fastify.opsMetrics.snapshot(),
  };
});

fastify.register(authRoutes, {
    prefix: '/auth',
    mailer: mailerService,
    appBaseUrl: SERVER_BASE_URL,
    publicAppUrl: PUBLIC_APP_URL,
    appName: 'Scholomance',
});

// Reference API Proxy Routes
// SECURITY: Rate limit external API proxy to prevent enumeration attacks
fastify.get('/api/rhymes/:word', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
}, async (request, reply) => {
    const { word } = request.params;
    try {
        const rhymeUrl = buildExternalApiUrl('https://api.datamuse.com/words', { rel_rhy: word, max: 20 });
        const res = await fetchWithTimeout(rhymeUrl);
        return await res.json();
    } catch (e) {
        return reply.status(500).send({ message: 'Error fetching rhymes' });
    }
});

// Progression
fastify.get('/api/progression', { preHandler: [requireAuth] }, async (request) => {
    return await userPersistence.progression.get(request.session.user.id);
});

fastify.post('/api/progression', {
    preValidation: [csrfPreValidation],
    preHandler: [requireAuth],
    schema: { body: toFastifySchema(progressionBodySchema) },
    handler: async (request) => {
        return await userPersistence.progression.save(request.session.user.id, request.body);
    }
});

fastify.delete('/api/progression', {
    preValidation: [csrfPreValidation],
    preHandler: [requireAuth],
    handler: async (request) => {
        return await userPersistence.progression.reset(request.session.user.id);
    }
});

fastify.get('/api/scrolls', { preHandler: [requireAuth] }, async (request) => {
    return await userPersistence.scrolls.getAll(request.session.user.id);
});

fastify.post('/api/scrolls/:id', {
    preValidation: [csrfPreValidation],
    preHandler: [requireAuth],
    schema: {
        params: toFastifySchema(scrollParamsSchema),
        body: toFastifySchema(scrollBodySchema),
    },
    handler: async (request, reply) => {
        const saved = await userPersistence.scrolls.save(
            request.params.id,
            request.session.user.id,
            request.body,
        );
        if (!saved) {
            return reply.status(409).send({ message: 'Scroll id already exists for another user.' });
        }
        return saved;
    }
});

fastify.delete('/api/scrolls/:id', {
    preValidation: [csrfPreValidation],
    preHandler: [requireAuth],
    schema: { params: toFastifySchema(scrollParamsSchema) },
    handler: async (request, reply) => {
        const deleted = await userPersistence.scrolls.delete(request.params.id, request.session.user.id);
        if (!deleted) {
            return reply.status(404).send({ message: 'Scroll not found.' });
        }
        return { ok: true };
    }
});

// Settings
// SECURITY: Rate limit settings endpoint to prevent harvesting
fastify.get('/api/settings', { 
    preHandler: [requireAuth],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } }
}, async (request) => {
    return await userPersistence.settings.get(request.session.user.id);
});

fastify.post('/api/settings', {
    preValidation: [csrfPreValidation],
    preHandler: [requireAuth, requireJsonContentType],
    handler: async (request) => {
        return await userPersistence.settings.save(request.session.user.id, request.body);
    }
});

// Audio filename helpers
const AUDIO_EXT_RE = /\.(mp3|wav|ogg|m4a)$/i;

function getAudioAdapter() {
    const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (CLOUDFLARE_ACCOUNT_ID) {
        fastify.log.info('[AUDIO] Using Cloudflare R2 audio adapter.');
        return new R2AudioAdapter({
            accountId: CLOUDFLARE_ACCOUNT_ID,
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            bucketName: process.env.R2_BUCKET_NAME,
        });
    }
    
    fastify.log.info('[AUDIO] Using local filesystem audio adapter.');
    return null; // Fallback to local fs logic for now
}

const audioAdapter = getAudioAdapter();

function sanitizeAudioFilename(raw) {
    return raw.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
}

function isValidAudioFilename(name) {
    if (!name || typeof name !== 'string') return false;
    if (!AUDIO_EXT_RE.test(name)) return false;
    // Block path traversal
    if (name.includes('..') || name.includes('/') || name.includes('\\')) return false;
    return true;
}

function resolveAudioFilePath(filename) {
    return path.join(AUDIO_UPLOAD_PATH, filename);
}

// Upload and Audio List Routes
fastify.get('/api/audio-files', async (request, reply) => {
    const authorization = authorizeAudioRouteRequest(request);
    if (!authorization.authorized) {
        return reply.status(401).send(buildAudioUnauthorizedPayload(authorization.reason));
    }
    
    // Phase 4: R2 support
    if (audioAdapter) {
        // In a real implementation, we'd list from R2 bucket. 
        // For now, we'll return empty or mock if R2 doesn't support easy listing without a DB.
        // The PDR suggests R2 read via presigned URL.
        return [];
    }

    try {
        const files = readdirSync(AUDIO_UPLOAD_PATH);
        return files.filter(f => AUDIO_EXT_RE.test(f)).map(f => {
            const filePath = resolveAudioFilePath(f);
            let size = null;
            let uploadedAt = null;
            try {
                const stats = statSync(filePath);
                size = stats.size;
                uploadedAt = stats.mtime.toISOString();
            } catch {
                // File may have been removed between readdir and stat
            }
            return { name: f, url: `/audio/${f}`, size, uploadedAt };
        });
    } catch (e) {
        return [];
    }
});

fastify.post('/api/upload', async (request, reply) => {
    const authorization = authorizeAudioRouteRequest(request);
    if (!authorization.authorized) {
        fastify.opsMetrics.increment('uploadFailures');
        return reply.status(401).send(buildAudioUnauthorizedPayload(authorization.reason));
    }
    try {
        const data = await request.file();
        if (!data) {
            fastify.opsMetrics.increment('uploadFailures');
            return reply.status(400).send({ message: 'No file' });
        }
        if (!AUDIO_EXT_RE.test(data.filename)) {
            fastify.opsMetrics.increment('uploadFailures');
            return reply.status(400).send({ message: 'Invalid type' });
        }
        const safeFilename = sanitizeAudioFilename(data.filename);
        
        if (audioAdapter) {
            const buffer = await data.toBuffer();
            const key = await audioAdapter.saveTrack(safeFilename.replace(/\.[^.]+$/, ''), buffer, data.mimetype);
            // In R2 mode, we return a signed URL or CDN URL
            const url = await audioAdapter.getPresignedUrl(safeFilename.replace(/\.[^.]+$/, ''));
            return { message: 'Uploaded', filename: safeFilename, url };
        } else {
            const targetPath = resolveAudioFilePath(safeFilename);
            if (existsSync(targetPath)) {
                fastify.opsMetrics.increment('uploadFailures');
                return reply.status(409).send({ message: 'File already exists', filename: safeFilename });
            }
            await pipeline(data.file, createWriteStream(targetPath));
            return { message: 'Uploaded', filename: safeFilename, url: `/audio/${safeFilename}` };
        }
    } catch (error) {
        fastify.opsMetrics.increment('uploadFailures');
        if (error?.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
            return reply.status(400).send({ message: 'No file' });
        }
        fastify.log.error({ err: error }, '[UPLOAD] Failed to store uploaded file.');
        return reply.status(500).send({ message: 'Upload failed' });
    }
});

fastify.delete('/api/audio-files/:filename', async (request, reply) => {
    const authorization = authorizeAudioRouteRequest(request);
    if (!authorization.authorized) {
        return reply.status(401).send(buildAudioUnauthorizedPayload(authorization.reason));
    }
    const { filename } = request.params;
    if (!isValidAudioFilename(filename)) {
        return reply.status(400).send({ message: 'Invalid filename' });
    }

    try {
        if (audioAdapter) {
            await audioAdapter.deleteTrack(filename.replace(/\.[^.]+$/, ''));
            return { message: 'Deleted', filename };
        } else {
            const targetPath = resolveAudioFilePath(filename);
            if (!existsSync(targetPath)) {
                return reply.status(404).send({ message: 'File not found' });
            }
            unlinkSync(targetPath);
            return { message: 'Deleted', filename };
        }
    } catch (error) {
        fastify.log.error({ err: error }, '[AUDIO] Failed to delete file.');
        return reply.status(500).send({ message: 'Delete failed' });
    }
});

fastify.patch('/api/audio-files/:filename', async (request, reply) => {
    const authorization = authorizeAudioRouteRequest(request);
    if (!authorization.authorized) {
        return reply.status(401).send(buildAudioUnauthorizedPayload(authorization.reason));
    }
    const { filename } = request.params;
    if (!isValidAudioFilename(filename)) {
        return reply.status(400).send({ message: 'Invalid filename' });
    }
    const newName = request.body?.name;
    if (!newName || typeof newName !== 'string') {
        return reply.status(400).send({ message: 'Missing new name' });
    }
    const safeNewName = sanitizeAudioFilename(newName);
    if (!isValidAudioFilename(safeNewName)) {
        return reply.status(400).send({ message: 'Invalid new filename' });
    }

    if (audioAdapter) {
        return reply.status(501).send({ message: 'Renaming is not supported on R2 storage.' });
    }

    const sourcePath = resolveAudioFilePath(filename);
    if (!existsSync(sourcePath)) {
        return reply.status(404).send({ message: 'File not found' });
    }
    const destPath = resolveAudioFilePath(safeNewName);
    if (existsSync(destPath)) {
        return reply.status(409).send({ message: 'Target filename already exists', filename: safeNewName });
    }
    try {
        renameSync(sourcePath, destPath);
        return { message: 'Renamed', oldFilename: filename, filename: safeNewName, url: `/audio/${safeNewName}` };
    } catch (error) {
        fastify.log.error({ err: error }, '[AUDIO] Failed to rename file.');
        return reply.status(500).send({ message: 'Rename failed' });
    }
});

// Expose Redis client to route plugins for shared caching
fastify.decorate('redis', redisClient);

fastify.addHook('onSend', async (request, _reply, payload) => {
    const requestPath = stripQueryFromUrl(request.raw?.url || request.url || '');
    if (request.method !== 'GET' || !requestPath.startsWith('/api/word-lookup/')) {
        return payload;
    }
    if (typeof payload !== 'string') {
        return payload;
    }
    try {
        const parsedPayload = JSON.parse(payload);
        fastify.opsMetrics.recordWordLookup(parsedPayload?.source);
    } catch {
        fastify.opsMetrics.recordWordLookup();
    }
    return payload;
});

fastify.register(wordLookupRoutes);
fastify.register(grimdesignRoutes);
await fastify.register(panelAnalysisRoutes, {
    enableRhymeAstrology: fastify.featureFlags?.rhymeAstrology,
    corpusService,
});
await fastify.register(combatRoutes);
fastify.register(lexiconRoutes, { prefix: '/api/lexicon', adapter: lexiconAdapter });
fastify.register(diagnosticRoutes, { prefix: '/api/diagnostic' });
fastify.register(worldRoutes, { prefix: '/api/world', adapter: lexiconAdapter, persistence: userPersistence });
fastify.register(corpusRoutes, { prefix: '/api/corpus', adapter: corpusAdapter, lexiconAdapter });
fastify.register(imageAnalysisRoutes, { prefix: '/api/image' });
fastify.register(registerSchoolStylesRoutes, { prefix: '/api/styles' });
if (ENABLE_RHYME_ASTROLOGY) {
    if (RHYME_ASTROLOGY_PATHS.usedExistingArtifactsFallback || RHYME_ASTROLOGY_PATHS.usedProductionPersistentFallback) {
        fastify.log.warn({
            configuredOutputDir: RHYME_ASTROLOGY_PATHS.configuredOutputDir,
            resolvedOutputDir: RHYME_ASTROLOGY_PATHS.outputDir,
            candidateOutputDirs: RHYME_ASTROLOGY_PATHS.candidateOutputDirs,
        }, '[RhymeAstrology] Falling back to detected artifact bundle.');
    }
    if (!RHYME_ASTROLOGY_PATHS.hasCompleteDbSet) {
        fastify.log.warn({
            lexiconDbPath: RHYME_ASTROLOGY_PATHS.lexiconDbPath,
            indexDbPath: RHYME_ASTROLOGY_PATHS.indexDbPath,
            edgesDbPath: RHYME_ASTROLOGY_PATHS.edgesDbPath,
        }, '[RhymeAstrology] Artifact bundle is incomplete; runtime will degrade until artifacts are built or mounted.');
    }
    fastify.register(rhymeAstrologyRoutes, {
        lexiconDbPath: RHYME_ASTROLOGY_PATHS.lexiconDbPath,
        indexDbPath: RHYME_ASTROLOGY_PATHS.indexDbPath,
        edgesDbPath: RHYME_ASTROLOGY_PATHS.edgesDbPath,
        cacheSize: RHYME_ASTROLOGY_CACHE_SIZE,
        bucketCandidateCap: RHYME_ASTROLOGY_BUCKET_QUERY_CAP,
        maxClusters: RHYME_ASTROLOGY_QUERY_MAX_CLUSTERS,
        phonemeEngine: PhonemeEngine,
    });
} else {
    fastify.log.info('[RhymeAstrology] API disabled. Set ENABLE_RHYME_ASTROLOGY=true to enable.');
}

if (ENABLE_COLLAB_API) {
    if (IS_PRODUCTION) {
        fastify.log.warn('[COLLAB] API enabled in production; all routes require authentication.');
    }
    await fastify.register(async function collabApiPlugin(instance) {
        instance.register(async function collabRestApiPlugin(restApi) {
            restApi.addHook('preHandler', requireAuth);
            restApi.register(collabRoutes, { prefix: '/collab' });
        });

        instance.register(collabMcpHttpRoutes);
    });
    startAgentQaSweep();
}
 else {
    fastify.log.info('[COLLAB] API disabled. Set ENABLE_COLLAB_API=true to enable.');
}

if (SHOULD_SERVE_FRONTEND) {
    fastify.register(fastifyStatic, {
        root: FRONTEND_DIST_PATH,
        prefix: '/',
        index: ['index.html'],
        setHeaders: (res, filePath) => {
            const normalizedPath = String(filePath || '');
            const fileName = path.basename(normalizedPath).toLowerCase();

            if (fileName === 'index.html') {
                // Always fetch latest shell so dynamic chunk URLs stay in sync after deploys.
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                return;
            }

            if (normalizedPath.includes(`${path.sep}assets${path.sep}`)) {
                // Fingerprinted assets are immutable by design.
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return;
            }

            // Non-fingerprinted static files get a short cache.
            res.setHeader('Cache-Control', 'public, max-age=3600');
        },
    });
    fastify.setNotFoundHandler((request, reply) => {
        const requestPath = stripQueryFromUrl(request.raw?.url || request.url);
        if (isApiRoutePath(requestPath)) {
            return reply.code(404).send({
                message: 'Route not found',
                path: requestPath,
            });
        }
        if (isStaticAssetPath(requestPath)) {
            return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
        }
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        return reply.type('text/html; charset=utf-8').sendFile('index.html');
    });
} else {
    fastify.setNotFoundHandler((request, reply) => {
        const requestPath = stripQueryFromUrl(request.raw?.url || request.url);
        if (isApiRoutePath(requestPath)) {
            return reply.code(404).send({
                message: 'Route not found',
                path: requestPath,
            });
        }
        if (isStaticAssetPath(requestPath)) {
            return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
        }
        return reply.code(404).send({ message: 'Not found' });
    });
}

let shutdownPromise = null;

async function closeRedisConnection() {
    if (!redisClient || !redisClient.isOpen) {
        return;
    }

    try {
        await redisClient.quit();
    } catch (error) {
        fastify.log.warn({ err: error }, '[REDIS] Graceful quit failed, forcing disconnect.');
        try {
            redisClient.disconnect();
        } catch {
            // Ignore disconnect errors during shutdown.
        }
    }
}

function closePersistenceConnections() {
    const shutdownHealth = [];
    try {
        stopAgentQaSweep();
    } catch (error) {
        fastify.log.warn({ err: error }, '[COLLAB] Agent QA sweep stop failed.');
    }
    try {
        mailQueueWorker.stop();
    } catch (error) {
        fastify.log.warn({ err: error }, '[MAILER] Queue worker stop failed.');
    }
    try {
        userPersistence.close();
        shutdownHealth.push(encodeBytecodeHealth('LIFECYCLE', 'USER_DB_CLOSED', { module: 'user' }));
    } catch (error) {
        fastify.log.warn({ err: error }, '[DB:user] Failed to close cleanly.');
    }
    try {
        collabPersistence.close();
        shutdownHealth.push(encodeBytecodeHealth('LIFECYCLE', 'COLLAB_DB_CLOSED', { module: 'collab' }));
    } catch (error) {
        fastify.log.warn({ err: error }, '[DB:collab] Failed to close cleanly.');
    }
    try {
        lexiconAdapter.close?.();
        shutdownHealth.push(encodeModuleHealth('lexicon', 'LIFECYCLE', 'LEXICON_DB_CLOSED', {
            reconnects: lexiconAdapter.__unsafe?.reconnectCount,
        }));
    } catch (error) {
        fastify.log.warn({ err: error }, '[DB:lexicon] Failed to close cleanly.');
    }
    try {
        corpusAdapter.close?.();
        shutdownHealth.push(encodeModuleHealth('corpus', 'LIFECYCLE', 'CORPUS_DB_CLOSED', {
            reconnects: corpusAdapter.__unsafe?.reconnectCount,
        }));
    } catch (error) {
        fastify.log.warn({ err: error }, '[DB:corpus] Failed to close cleanly.');
    }
    try {
        corpusService.close?.();
        shutdownHealth.push(encodeModuleHealth('corpus-service', 'LIFECYCLE', 'CORPUS_SERVICE_CLOSED', {
            reconnects: corpusService.__unsafe?.reconnectCount,
        }));
    } catch (error) {
        fastify.log.warn({ err: error }, '[Service:corpus] Failed to close cleanly.');
    }

    if (shutdownHealth.length > 0) {
        fastify.log.info({
            healthSignals: shutdownHealth.map(h => ({ bytecode: h.bytecode, checksum: h.checksum })),
            count: shutdownHealth.length,
        }, '[LIFECYCLE] Shutdown health signals emitted.');
    }
}

export async function gracefulShutdown(signal = 'manual', { exitCode = 0, exitProcess = true } = {}) {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
        fastify.log.info({ signal }, '[LIFECYCLE] Shutdown initiated.');
        const timeoutId = setTimeout(() => {
            fastify.log.error(
                { timeoutMs: SHUTDOWN_TIMEOUT_MS, signal },
                '[LIFECYCLE] Shutdown timeout reached. Forcing process exit.',
            );
            if (exitProcess) {
                process.exit(1);
            }
        }, SHUTDOWN_TIMEOUT_MS);
        if (typeof timeoutId.unref === 'function') {
            timeoutId.unref();
        }

        try {
            await fastify.close();
        } catch (error) {
            fastify.log.error({ err: error }, '[LIFECYCLE] Fastify close failed.');
        }

        await collabService.close();
        await closeRedisConnection();
        closePersistenceConnections();
        clearTimeout(timeoutId);

        fastify.log.info({ signal }, '[LIFECYCLE] Shutdown complete.');
        if (exitProcess) {
            process.exit(exitCode);
        }
    })();

    return shutdownPromise;
}

export const start = async () => {
    try {
        if (redisClient && !redisClient.isOpen) {
            await redisClient.connect();
        }
        await PhonemeEngine.init();
        await collabService.bootstrap();
        
        const immunityService = await createImmunityService({ log: fastify.log, db: userPersistence.db });
        fastify.get('/api/immunity/status', async () => {
            return await immunityService.getStatus();
        });

        if (!IS_TEST_RUNTIME) {
            mailQueueWorker.start();
            
            // Phase 3: Session cleanup for Turso
            if (TURSO_USER_DB_URL) {
                setInterval(async () => {
                    try {
                        const db = userPersistence.db || userPersistence;
                        await db.execute('DELETE FROM sessions WHERE expires < ?', [Date.now()]);
                    } catch (err) {
                        fastify.log.error({ err }, '[SESSION] Cleanup failed');
                    }
                }, 3600000); // Purge every hour
            }
        }
        await fastify.listen({ host: HOST, port: PORT });
    } catch (error) {
        fastify.log.error(error);
        await closeRedisConnection();
        closePersistenceConnections();
        process.exit(1);
    }
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.once(signal, () => {
            gracefulShutdown(signal).catch((error) => {
                fastify.log.error({ err: error, signal }, '[LIFECYCLE] Shutdown failed unexpectedly.');
                process.exit(1);
            });
        });
    }
    start();
}

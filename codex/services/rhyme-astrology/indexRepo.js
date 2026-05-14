import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';

const DEFAULT_BUCKET_LIMIT = 200;
const DEFAULT_EDGE_LIMIT = 25;
const DEFAULT_CLUSTER_LIMIT = 12;

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
 * @param {any} value
 * @returns {string[]}
 */
function parseJsonArray(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Allowlist of valid table names for PRAGMA queries.
 * Prevents SQL injection via table name interpolation.
 */
const ALLOWED_PRAGMA_TABLES = new Set([
  'signature_bucket',
  'constellation_cluster',
  'rhyme_index',
  'rhyme_lexicon',
  'rhyme_edges',
  'hot_edge',
]);

/**
 * @param {Database.Database | null | undefined} db
 * @param {string} tableName
 * @param {string} columnName
 * @returns {boolean}
 */
function hasColumn(db, tableName, columnName) {
  if (!db?.open) return false;
  
  // SECURITY: Validate table name against allowlist before interpolation
  // PRAGMA statements cannot use parameterized queries in SQLite
  if (!ALLOWED_PRAGMA_TABLES.has(tableName)) {
    return false;
  }
  
  try {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.some((row) => String(row?.name || '').toLowerCase() === columnName.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * @param {any} row
 */
function mapBucketNode(row) {
  if (!row || typeof row !== 'object') return null;
  const phonemes = parseJsonArray(row.phonemes_json);
  const vowelSkeleton = parseJsonArray(row.vowel_skeleton_json);
  const consonantSkeleton = parseJsonArray(row.consonant_skeleton_json);
  const onsetSignature = String(row.onset_signature || '');
  return {
    id: String(row.node_id || ''),
    token: normalizeToken(row.token),
    normalized: normalizeToken(row.token),
    phonemes,
    stressPattern: String(row.stress_pattern || ''),
    syllableCount: Number(row.syllable_count) || 0,
    vowelSkeleton,
    consonantSkeleton,
    endingSignature: String(row.ending_signature || ''),
    onsetSignature,
    frequencyScore: Number(row.frequency_score) || 0,
    dominantVowelFamily: String(row.dominant_vowel_family || ''),
    signature: {
      phonemes,
      vowelSkeleton,
      consonantSkeleton,
      endingSignature: String(row.ending_signature || ''),
      onsetSignature,
      stressPattern: String(row.stress_pattern || ''),
      syllableCount: Number(row.syllable_count) || 0,
    },
  };
}

/**
 * @param {any} row
 */
function mapHotEdge(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    toId: String(row.to_id || ''),
    toToken: normalizeToken(row.to_token),
    exactRhymeScore: Number(row.exact_rhyme_score) || 0,
    slantRhymeScore: Number(row.slant_rhyme_score) || 0,
    vowelMatchScore: Number(row.vowel_match_score) || 0,
    consonantMatchScore: Number(row.consonant_match_score) || 0,
    stressAlignmentScore: Number(row.stress_alignment_score) || 0,
    syllableDeltaPenalty: Number(row.syllable_delta_penalty) || 0,
    overallScore: Number(row.overall_score) || 0,
    reasons: parseJsonArray(row.reasons_json),
  };
}

/**
 * @param {any} row
 */
function mapCluster(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || ''),
    anchorId: String(row.anchor_id || ''),
    label: String(row.label || ''),
    dominantVowelFamily: parseJsonArray(row.dominant_vowel_family_json),
    dominantStressPattern: String(row.dominant_stress_pattern || ''),
    members: parseJsonArray(row.members_json),
    densityScore: Number(row.density_score) || 0,
    cohesionScore: Number(row.cohesion_score) || 0,
  };
}

/**
 * @param {string | null | undefined} dbPath
 * @param {any} log
 * @param {string} label
 */
function openReadonlyDb(dbPath, log, label) {
  const resolvedPath = typeof dbPath === 'string' && dbPath.trim()
    ? path.resolve(dbPath.trim())
    : null;
  if (!resolvedPath) {
    log?.warn?.(`[RhymeAstrologyIndexRepo] No ${label} DB path configured.`);
    return {
      db: null,
      path: null,
    };
  }
  if (!existsSync(resolvedPath)) {
    log?.warn?.({ dbPath: resolvedPath }, `[RhymeAstrologyIndexRepo] ${label} DB not found.`);
    return {
      db: null,
      path: resolvedPath,
    };
  }

  try {
    const db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 5000');
    return {
      db,
      path: resolvedPath,
    };
  } catch (error) {
    log?.warn?.({ err: error, dbPath: resolvedPath }, `[RhymeAstrologyIndexRepo] Failed to open ${label} DB.`);
    return {
      db: null,
      path: resolvedPath,
    };
  }
}

function createEmptyIndexRepo(indexDbPath = null, edgesDbPath = null) {
  return {
    lookupHotEdges() {
      return [];
    },
    lookupBucketMembers() {
      return [];
    },
    lookupClustersByEndingSignature() {
      return [];
    },
    close() {},
    __unsafe: {
      indexDbConnected: false,
      edgesDbConnected: false,
      indexDbPath,
      edgesDbPath,
    },
  };
}

/**
 * @param {{
 *   indexDbPath?: string | null,
 *   edgesDbPath?: string | null,
 *   log?: any,
 * }} [options]
 */
export function createRhymeAstrologyIndexRepo(options = {}) {
  const log = options.log ?? console;
  const indexDbOpen = openReadonlyDb(options.indexDbPath, log, 'index');
  const edgesDbOpen = openReadonlyDb(options.edgesDbPath, log, 'edges');
  const indexDb = indexDbOpen.db;
  const edgesDb = edgesDbOpen.db;

  if (!indexDb && !edgesDb) {
    return createEmptyIndexRepo(indexDbOpen.path, edgesDbOpen.path);
  }

  const bucketHasOnsetSignature = hasColumn(indexDb, 'signature_bucket', 'onset_signature');

  const lookupBucketMembersStmt = indexDb
    ? indexDb.prepare(`
      SELECT
        ending_signature,
        node_id,
        token,
        frequency_score,
        syllable_count,
        stress_pattern,
        dominant_vowel_family,
        ${bucketHasOnsetSignature ? 'onset_signature,' : "'' AS onset_signature,"}
        phonemes_json,
        vowel_skeleton_json,
        consonant_skeleton_json
      FROM signature_bucket
      WHERE ending_signature = ?
      ORDER BY frequency_score DESC, token ASC
      LIMIT ?
    `)
    : null;

  const lookupClustersStmt = indexDb
    ? indexDb.prepare(`
      SELECT
        id,
        anchor_id,
        label,
        dominant_vowel_family_json,
        dominant_stress_pattern,
        members_json,
        density_score,
        cohesion_score
      FROM constellation_cluster
      WHERE ending_signature = ?
      ORDER BY cohesion_score DESC, density_score DESC, id ASC
      LIMIT ?
    `)
    : null;

  const lookupHotEdgesStmt = edgesDb
    ? edgesDb.prepare(`
      SELECT
        to_id,
        to_token,
        exact_rhyme_score,
        slant_rhyme_score,
        vowel_match_score,
        consonant_match_score,
        stress_alignment_score,
        syllable_delta_penalty,
        overall_score,
        reasons_json
      FROM hot_edge
      WHERE from_id = ?
      ORDER BY overall_score DESC, to_token ASC
      LIMIT ?
    `)
    : null;

  function lookupHotEdges(fromId, limit = DEFAULT_EDGE_LIMIT) {
    if (!lookupHotEdgesStmt) return [];
    const normalizedId = String(fromId || '').trim();
    if (!normalizedId) return [];
    const boundedLimit = toPositiveInteger(limit, DEFAULT_EDGE_LIMIT);
    const rows = lookupHotEdgesStmt.all(normalizedId, boundedLimit);
    return rows.map(mapHotEdge).filter(Boolean);
  }

  function lookupBucketMembers(endingSignature, limit = DEFAULT_BUCKET_LIMIT) {
    if (!lookupBucketMembersStmt) return [];
    const normalized = String(endingSignature || '').trim();
    if (!normalized) return [];
    const boundedLimit = toPositiveInteger(limit, DEFAULT_BUCKET_LIMIT);
    const rows = lookupBucketMembersStmt.all(normalized, boundedLimit);
    return rows.map(mapBucketNode).filter(Boolean);
  }

  function lookupClustersByEndingSignature(endingSignature, limit = DEFAULT_CLUSTER_LIMIT) {
    if (!lookupClustersStmt) return [];
    const normalized = String(endingSignature || '').trim();
    if (!normalized) return [];
    const boundedLimit = toPositiveInteger(limit, DEFAULT_CLUSTER_LIMIT);
    const rows = lookupClustersStmt.all(normalized, boundedLimit);
    return rows.map(mapCluster).filter(Boolean);
  }

  function close() {
    if (indexDb?.open) {
      indexDb.close();
    }
    if (edgesDb?.open) {
      edgesDb.close();
    }
  }

  return {
    lookupHotEdges,
    lookupBucketMembers,
    lookupClustersByEndingSignature,
    close,
    __unsafe: {
      indexDbConnected: Boolean(indexDb),
      edgesDbConnected: Boolean(edgesDb),
      indexDbPath: indexDbOpen.path,
      edgesDbPath: edgesDbOpen.path,
      bucketHasOnsetSignature,
    },
  };
}

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';

/**
 * @param {any} value
 * @returns {string[]}
 */
function parseJsonArray(value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
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
 * @param {any} row
 */
function mapLexiconNode(row) {
  if (!row || typeof row !== 'object') return null;
  const phonemes = parseJsonArray(row.phonemes_json);
  const vowelSkeleton = parseJsonArray(row.vowel_skeleton_json);
  const consonantSkeleton = parseJsonArray(row.consonant_skeleton_json);
  return {
    id: String(row.id || ''),
    token: normalizeToken(row.token),
    normalized: normalizeToken(row.normalized),
    phonemes,
    stressPattern: String(row.stress_pattern || ''),
    syllableCount: Number(row.syllable_count) || 0,
    vowelSkeleton,
    consonantSkeleton,
    endingSignature: String(row.ending_signature || ''),
    onsetSignature: String(row.onset_signature || ''),
    frequencyScore: Number(row.frequency_score) || 0,
    embeddings_tq: row.embeddings_tq || null,
    signature: {
      phonemes,
      vowelSkeleton,
      consonantSkeleton,
      endingSignature: String(row.ending_signature || ''),
      onsetSignature: String(row.onset_signature || ''),
      stressPattern: String(row.stress_pattern || ''),
      syllableCount: Number(row.syllable_count) || 0,
    },
  };
}

function createEmptyLexiconRepo(dbPath = null) {
  return {
    lookupNodeByNormalized() {
      return null;
    },
    lookupNodeById() {
      return null;
    },
    lookupNodesByNormalizedBatch() {
      return {};
    },
    close() {},
    __unsafe: {
      connected: false,
      dbPath,
    },
  };
}

/**
 * @param {string | null | undefined} dbPath
 * @param {{ log?: any }} [options]
 */
export function createRhymeAstrologyLexiconRepo(dbPath, options = {}) {
  const log = options.log ?? console;
  const resolvedPath = typeof dbPath === 'string' && dbPath.trim()
    ? path.resolve(dbPath.trim())
    : null;

  if (!resolvedPath) {
    log?.warn?.('[RhymeAstrologyLexiconRepo] No lexicon DB path configured.');
    return createEmptyLexiconRepo(null);
  }

  if (!existsSync(resolvedPath)) {
    log?.warn?.({ dbPath: resolvedPath }, '[RhymeAstrologyLexiconRepo] Lexicon DB not found.');
    return createEmptyLexiconRepo(resolvedPath);
  }

  let db;
  try {
    db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.pragma('busy_timeout = 5000');
  } catch (error) {
    log?.warn?.({ err: error, dbPath: resolvedPath }, '[RhymeAstrologyLexiconRepo] Failed to open lexicon DB.');
    return createEmptyLexiconRepo(resolvedPath);
  }

  const lookupByNormalizedStmt = db.prepare(`
    SELECT
      id,
      token,
      normalized,
      phonemes_json,
      stress_pattern,
      syllable_count,
      vowel_skeleton_json,
      consonant_skeleton_json,
      ending_signature,
      onset_signature,
      frequency_score,
      embeddings_tq
    FROM lexicon_node
    WHERE normalized = ?
    LIMIT 1
  `);

  const lookupByIdStmt = db.prepare(`
    SELECT
      id,
      token,
      normalized,
      phonemes_json,
      stress_pattern,
      syllable_count,
      vowel_skeleton_json,
      consonant_skeleton_json,
      ending_signature,
      onset_signature,
      frequency_score,
      embeddings_tq
    FROM lexicon_node
    WHERE id = ?
    LIMIT 1
  `);

  const batchStmtCache = new Map();

  function lookupNodeByNormalized(token) {
    const normalized = normalizeToken(token);
    if (!normalized) return null;
    return mapLexiconNode(lookupByNormalizedStmt.get(normalized));
  }

  function lookupNodeById(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return null;
    return mapLexiconNode(lookupByIdStmt.get(normalizedId));
  }

  function lookupNodesByNormalizedBatch(tokens) {
    const normalizedTokens = [...new Set((Array.isArray(tokens) ? tokens : [])
      .map(normalizeToken)
      .filter(Boolean))];
    if (normalizedTokens.length === 0) return {};

    const placeholderCount = normalizedTokens.length;
    let statement = batchStmtCache.get(placeholderCount);
    if (!statement) {
      const placeholders = normalizedTokens.map(() => '?').join(', ');
      statement = db.prepare(`
        SELECT
          id,
          token,
          normalized,
          phonemes_json,
          stress_pattern,
          syllable_count,
          vowel_skeleton_json,
          consonant_skeleton_json,
          ending_signature,
          onset_signature,
          frequency_score,
          embeddings_tq
        FROM lexicon_node
        WHERE normalized IN (${placeholders})
      `);
      batchStmtCache.set(placeholderCount, statement);
    }

    const rows = statement.all(...normalizedTokens);
    const out = {};
    for (const row of rows) {
      const node = mapLexiconNode(row);
      if (!node || !node.normalized) continue;
      out[node.normalized] = node;
    }
    return out;
  }

  function close() {
    if (!db?.open) return;
    db.close();
  }

  return {
    lookupNodeByNormalized,
    lookupNodeById,
    lookupNodesByNormalizedBatch,
    close,
    __unsafe: {
      connected: true,
      dbPath: resolvedPath,
    },
  };
}

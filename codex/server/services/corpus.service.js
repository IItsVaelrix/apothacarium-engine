import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

import { resolveDatabasePath } from '../utils/pathResolution.js';
import { encodeModuleHealth } from '../../core/diagnostic/BytecodeHealth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

export function createCorpusService(options = {}) {
  const targetPath = resolveDatabasePath(
    options.dbPath || process.env.SCHOLOMANCE_CORPUS_PATH || process.env.CORPUS_DB_PATH,
    'scholomance_corpus.sqlite'
  );
  const log = options.log || console;
  
  let db = null;
  let reconnectCount = 0;
  let healthLog = [];

  function emitHealth(checkId, context = {}) {
    const h = encodeModuleHealth(targetPath, 'CONNECTION_HEALTH', checkId, context);
    healthLog.push(h);
    log.info?.({ bytecode: h.bytecode }, `[CorpusService] ${checkId}`);
    return h;
  }

  /** Close stale handle before replacement — prevents recursive handle leak */
  function closeStale() {
    if (!db) return false;
    try {
      if (db.open) db.close();
      return true;
    } catch {
      return false;
    }
  }

  function tryConnect() {
    if (db && db.open) return true;
    if (!targetPath || !existsSync(targetPath)) return false;

    // If db exists but is not open, close the stale handle first
    if (db) {
      reconnectCount++;
      const hadStale = closeStale();
      emitHealth('RECONNECT', {
        reconnectCount,
        hadStaleHandle: hadStale,
        prevDbExists: true,
      });
    }

    try {
      db = new Database(targetPath, { readonly: true });
      emitHealth('CONNECTED', { reconnectCount });
      log.info?.(`[CorpusService] Connected to ${targetPath}`);
      return true;
    } catch (error) {
      log.warn?.({ err: error.message, targetPath }, '[CorpusService] Failed to connect to corpus database');
      return false;
    }
  }

  // Initial attempt
  tryConnect();

  /**
   * Search for sentences in the corpus using FTS5.
   * Returns enriched results: snippet, match_score, match_offsets.
   * @param {string} query - FTS5 query string.
   * @param {number} limit - Max results.
   */
  function searchSentences(query, limit = 10) {
    if (!tryConnect()) return [];
    try {
      const stmt = db.prepare(`
        SELECT
          s.id,
          s.text,
          src.title,
          src.author,
          src.type as source_type,
          snippet(sentence_fts, 0, ?, ?, ?, 40) AS raw_snippet,
          bm25(sentence_fts) AS raw_bm25
        FROM sentence_fts
        JOIN sentence s ON s.id = sentence_fts.rowid
        JOIN source src ON src.id = s.source_id
        WHERE sentence_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      // Marker chars as bind params: \x1b=open, \x1d=close, \x1e=ellipsis
      // Using non-null control chars to avoid SQLite string truncation
      const rows = stmt.all('\x1b', '\x1d', '\x1e', query, limit);
      return rows.map(row => enrichResult(row));
    } catch (error) {
      log.warn?.({ err: error.message, query }, '[CorpusService] Search failed');
      return [];
    }
  }

  // ─── FTS5 Enrichment (mirrors adapter logic) ─────────────────────────

  function enrichResult(row) {
    const { id, text, title, author, source_type, raw_snippet, raw_bm25 } = row;
    const matchScore = typeof raw_bm25 === 'number' ? raw_bm25 : 0;
    const { snippet, matchOffsets } = buildSnippet(raw_snippet, text);

    return {
      id,
      text,
      title,
      author,
      type: source_type,
      snippet,
      match_score: matchScore,
      match_offsets: matchOffsets,
    };
  }

  function buildSnippet(rawSnippet, fallbackText) {
    if (!rawSnippet || typeof rawSnippet !== 'string') {
      const truncated = fallbackText && fallbackText.length > 200
        ? fallbackText.slice(0, 200)
        : (fallbackText || '');
      return { snippet: truncated, matchOffsets: [] };
    }

    const OPEN = '\x1b';
    const CLOSE = '\x1d';
    const ELLIPSIS = '\x1e';

    const matchOffsets = [];
    let clean = '';
    let cleanPos = 0;
    let rawPos = 0;

    while (rawPos < rawSnippet.length) {
      const openIdx = rawSnippet.indexOf(OPEN, rawPos);
      if (openIdx === -1) {
        const remaining = rawSnippet.slice(rawPos).split(ELLIPSIS).join('…');
        clean += remaining;
        cleanPos += remaining.length;
        break;
      }

      const before = rawSnippet.slice(rawPos, openIdx).split(ELLIPSIS).join('…');
      clean += before;
      cleanPos += before.length;

      const closeIdx = rawSnippet.indexOf(CLOSE, openIdx + 1);
      if (closeIdx === -1) {
        clean += OPEN;
        cleanPos += 1;
        rawPos = openIdx + 1;
        continue;
      }

      const matchStart = cleanPos;
      const matchedText = rawSnippet.slice(openIdx + 1, closeIdx);
      const matchEnd = cleanPos + matchedText.length;
      matchOffsets.push([matchStart, matchEnd]);

      clean += matchedText;
      cleanPos = matchEnd;
      rawPos = closeIdx + 1;
    }

    return { snippet: clean, matchOffsets };
  }

  /**
   * Find sentences containing specific tokens for RAG.
   * @param {string[]} tokens - List of tokens to match.
   * @param {number} limit - Max results.
   */
  function findLiteraryExamples(tokens, limit = 5) {
    if (!tokens || tokens.length === 0) return [];
    // Build a simple OR query for FTS
    const query = tokens.map(t => `"${t}"`).join(' OR ');
    return searchSentences(query, limit);
  }

  return {
    searchSentences,
    findLiteraryExamples,
    close: () => {
      if (db && db.open) {
        emitHealth('CLOSED', { reconnectCount });
        db.close();
      }
    },
    __unsafe: {
      get connected() { return !!(db && db.open); },
      get reconnectCount() { return reconnectCount; },
      get healthLog() { return healthLog; },
    },
  };
}

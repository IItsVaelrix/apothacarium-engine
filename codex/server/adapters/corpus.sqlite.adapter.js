import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import path from 'path';
import { resolveDatabasePath } from '../utils/pathResolution.js';
import { BytecodeHealth, HEALTH_CODES, encodeModuleHealth } from '../../core/diagnostic/BytecodeHealth.js';

/**
 * Adapter for the Scholomance Super Corpus SQLite database.
 * Provides full-text search and context retrieval for literary sentences.
 *
 * Returns enriched results: snippet (±20-word window with highlights),
 * match_score (BM25 rank), and match_offsets (char ranges for UI highlighting).
 */
export function createCorpusAdapter(dbPath, options = {}) {
  const logger = options.log ?? console;
  const resolvedPath = resolveDatabasePath(dbPath, 'scholomance_corpus.sqlite');

  let db = null;
  let stmts = null;
  let reconnectCount = 0;
  let healthLog = [];

  function emitHealth(checkId, context = {}) {
    const h = encodeModuleHealth(resolvedPath, 'CONNECTION_HEALTH', checkId, context);
    healthLog.push(h);
    logger.info?.({ bytecode: h.bytecode }, `[CorpusAdapter] ${checkId}`);
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
    if (!resolvedPath || !existsSync(resolvedPath)) return false;

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
      db = new Database(resolvedPath, { readonly: true, fileMustExist: true });
      db.pragma('query_only = ON');
      db.pragma('busy_timeout = 5000');

      emitHealth('CONNECTED', { reconnectCount });

      // Prepared Statements — enriched with FTS5 snippet and BM25
      // Uses bind parameters for marker chars to avoid null-byte SQL parse errors
      stmts = {
        searchSentences: db.prepare(`
          SELECT
            s.id,
            s.text,
            src.title,
            src.author,
            src.type,
            src.url,
            snippet(sentence_fts, 0, ?, ?, ?, 40) AS raw_snippet,
            bm25(sentence_fts) AS raw_bm25
          FROM sentence_fts
          JOIN sentence s ON s.id = sentence_fts.rowid
          JOIN source src ON src.id = s.source_id
          WHERE sentence_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `),
        getSentenceContext: db.prepare(`
          SELECT id, text
          FROM sentence
          WHERE source_id = (SELECT source_id FROM sentence WHERE id = ?)
            AND id BETWEEN (? - ?) AND (? + ?)
          ORDER BY id ASC
        `)
      };

      logger.info?.({ dbPath: resolvedPath }, '[CorpusAdapter] Connected to corpus DB.');
      return true;
    } catch (error) {
      logger.warn?.({ err: error.message, dbPath: resolvedPath }, '[CorpusAdapter] Failed to open corpus DB.');
      return false;
    }
  }

  // Initial attempt
  tryConnect();

  function searchSentences(query, limit = 20) {
    if (!tryConnect()) return [];
    const sanitized = sanitizeFtsQuery(query);
    if (!sanitized) return [];
    try {
      // Marker chars as bind params: \x1b=open, \x1d=close, \x1e=ellipsis
      // Using non-null control chars to avoid SQLite string truncation
      const rows = stmts.searchSentences.all('\x1b', '\x1d', '\x1e', sanitized, Math.min(limit, 100));
      return rows.map(row => enrichResult(row));
    } catch (e) {
      logger.error?.({ err: e.message, query: sanitized }, '[CorpusAdapter] Search failed');
      return [];
    }
  }

  // ─── FTS5 Enrichment ─────────────────────────────────────────────────

  function enrichResult(row) {
    const { id, text, title, author, type, url, raw_snippet, raw_bm25 } = row;
    const matchScore = typeof raw_bm25 === 'number' ? raw_bm25 : 0;
    const { snippet, matchOffsets } = buildSnippet(raw_snippet, text);

    return {
      id,
      text,
      title,
      author,
      type,
      url,
      snippet,
      match_score: matchScore,
      match_offsets: matchOffsets,
    };
  }

  /**
   * Parse FTS5 snippet output to produce clean snippet text and match offsets.
   * The snippet uses \x1b as open-marker, \x1d as close-marker,
   * and \x1e as ellipsis. Non-null control chars survive SQLite binding.
   * Returns clean text with markers stripped and char-range offsets.
   */
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

    // Find all match ranges by scanning for open/close marker pairs
    const matchOffsets = [];
    let clean = '';
    let cleanPos = 0;
    let rawPos = 0;

    while (rawPos < rawSnippet.length) {
      const openIdx = rawSnippet.indexOf(OPEN, rawPos);
      if (openIdx === -1) {
        // No more markers — append rest
        const remaining = rawSnippet.slice(rawPos).split(ELLIPSIS).join('…');
        clean += remaining;
        cleanPos += remaining.length;
        break;
      }

      // Append text before marker
      const before = rawSnippet.slice(rawPos, openIdx).split(ELLIPSIS).join('…');
      clean += before;
      cleanPos += before.length;

      // Find close marker
      const closeIdx = rawSnippet.indexOf(CLOSE, openIdx + 1);
      if (closeIdx === -1) {
        // Malformed — skip the open marker
        clean += OPEN;
        cleanPos += 1;
        rawPos = openIdx + 1;
        continue;
      }

      // Record match range
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

  function getSentenceContext(sentenceId, windowSize = 2) {
    if (!tryConnect()) return [];
    try {
      return stmts.getSentenceContext.all(sentenceId, sentenceId, windowSize, sentenceId, windowSize);
    } catch (e) {
      logger.error?.({ err: e.message, sentenceId }, '[CorpusAdapter] Context lookup failed');
      return [];
    }
  }

  function sanitizeFtsQuery(raw) {
    const query = String(raw ?? '').trim();
    if (!query) return '';
    return query
      .replace(/\b(?:AND|OR|NOT|NEAR)\b/gi, ' ')
      .replace(/["'*:^(){}[\]|+\-~\\/<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function close() {
    if (db && db.open) {
      emitHealth('CLOSED', { reconnectCount });
      db.close();
    }
  }

  return {
    searchSentences,
    getSentenceContext,
    close,
    __unsafe: {
      get connected() { return !!(db && db.open); },
      get dbPath() { return resolvedPath; },
      get reconnectCount() { return reconnectCount; },
      get healthLog() { return healthLog; },
    }
  };
}

function createEmptyAdapter(resolvedPath, logger) {
  const logWait = () => logger.warn?.(`[CorpusAdapter] Corpus DB not ready at ${resolvedPath}. Corpus routes will return empty results.`);
  return {
    searchSentences() { logWait(); return []; },
    getSentenceContext() { logWait(); return []; },
    close: () => {},
    __unsafe: { connected: false, dbPath: resolvedPath }
  };
}

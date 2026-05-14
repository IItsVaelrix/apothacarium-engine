import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PhonemeEngine } from '../codex/core/phonology/phoneme.engine.js';
import {
  buildPhoneticSignature,
  getDominantVowelFamily,
} from '../codex/core/rhyme-astrology/signatures.js';
import { buildConstellationClusters } from '../codex/core/rhyme-astrology/clustering.js';
import { scoreNodeSimilarity } from '../codex/core/rhyme-astrology/similarity.js';
import { resolveDatabasePath } from '../codex/server/utils/pathResolution.js';
import { generatePhonosemanticVector } from '../codex/core/semantic/vector.utils.js';
import { quantizeVectorJS } from '../codex/core/quantization/turboquant.js';

const TOKEN_REGEX = /[a-z]+(?:'[a-z]+)*/g;

const DEFAULT_TARGET_LEXICON_SIZE = 50000;
const DEFAULT_HOT_EDGE_WORD_LIMIT = 10000;
const DEFAULT_HOT_EDGE_TOP_K = 50;
const DEFAULT_OVERSIZED_BUCKET_THRESHOLD = 500;
const DEFAULT_BUCKET_CANDIDATE_CAP = 200;
const DEFAULT_CLUSTER_LIMIT_PER_BUCKET = 6;
const DEFAULT_STORAGE_TARGET_MB = 100;
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'dict_data', 'rhyme-astrology');
const MANIFEST_VERSION = 1;
const DEFAULT_EMOTION_PRIOR_TOP_K = 180;
const DEFAULT_EMOTION_PRIOR_MIN_COUNT = 3;

const EMOTION_PRIOR_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with',
  'by', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'they', 'them',
  'it', 'its', 'this', 'that', 'these', 'those', 'not', 'no', 'so', 'very', 'too', 'just', 'can', 'could',
  'would', 'should', 'will', 'shall', 'may', 'might', 'must',
]);

const EMOTION_PRIOR_SEEDS = Object.freeze({
  Joy: new Set(['joy', 'happy', 'delight', 'love', 'smile', 'laugh', 'light', 'warm', 'hope', 'bliss']),
  Melancholy: new Set(['sad', 'sorrow', 'grief', 'tears', 'loss', 'alone', 'empty', 'cold', 'broken', 'regret']),
  Rage: new Set(['anger', 'rage', 'fury', 'hate', 'battle', 'war', 'burn', 'blood', 'wrath', 'strike']),
  Defiance: new Set(['never', 'rise', 'stand', 'resist', 'defy', 'refuse', 'free', 'fearless', 'power', 'conquer']),
  Wonder: new Set(['wonder', 'awe', 'mystery', 'magic', 'dream', 'beauty', 'stars', 'infinite', 'cosmos', 'divine']),
  Dread: new Set(['fear', 'terror', 'dread', 'anxious', 'horror', 'doom', 'nightmare', 'haunt', 'death', 'void']),
});

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function durationMs(startMs) {
  return nowMs() - startMs;
}

function tokenize(text) {
  return String(text || '').toLowerCase().match(TOKEN_REGEX) || [];
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveOutputDir() {
  const raw = process.env.RHYME_ASTROLOGY_OUTPUT_DIR;
  if (typeof raw === 'string' && raw.trim()) {
    return path.resolve(raw.trim());
  }
  return DEFAULT_OUTPUT_DIR;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function countRows(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${tableName}`).get()?.n || 0);
}

function collectSet(db, sql) {
  const out = new Set();
  const statement = db.prepare(sql);
  for (const row of statement.iterate()) {
    const value = normalizeToken(row?.value);
    if (value) out.add(value);
  }
  return out;
}

function collectCorpusFrequencies(corpusDb) {
  const frequencyByToken = new Map();
  let sentenceCount = 0;
  let tokenCount = 0;

  const statement = corpusDb.prepare('SELECT text FROM sentence');
  for (const row of statement.iterate()) {
    sentenceCount += 1;
    const tokens = tokenize(row?.text);
    for (const token of tokens) {
      if (token.length < 2) continue;
      tokenCount += 1;
      frequencyByToken.set(token, (frequencyByToken.get(token) || 0) + 1);
    }
  }

  return {
    sentenceCount,
    tokenCount,
    frequencyByToken,
  };
}

function sortFallbackTokens(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
}

function buildSelectedLexicon(rankedCandidates, lexicalPronunciationSet, targetLexiconSize) {
  const selected = [];
  const selectedSet = new Set();

  for (const entry of rankedCandidates) {
    if (selected.length >= targetLexiconSize) break;
    selected.push({
      token: entry.token,
      frequency: entry.frequency,
      source: 'corpus',
    });
    selectedSet.add(entry.token);
  }

  if (selected.length < targetLexiconSize) {
    const remaining = [];
    for (const token of lexicalPronunciationSet) {
      if (!selectedSet.has(token)) remaining.push(token);
    }
    remaining.sort(sortFallbackTokens);
    for (const token of remaining) {
      if (selected.length >= targetLexiconSize) break;
      selected.push({
        token,
        frequency: 1,
        source: 'fallback_floor',
      });
      selectedSet.add(token);
    }
  }

  return selected;
}

function sanitizeIdPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'x';
}

function mode(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = String(value || '');
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function prepareWritableDb(dbPath) {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('busy_timeout = 5000');
  return db;
}

function cleanupSqliteTriplet(basePath) {
  for (const candidate of [basePath, `${basePath}-shm`, `${basePath}-wal`]) {
    if (existsSync(candidate)) rmSync(candidate, { force: true });
  }
}

function createLexiconSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lexicon_node (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      normalized TEXT NOT NULL,
      phonemes_json TEXT NOT NULL,
      stress_pattern TEXT NOT NULL,
      syllable_count INTEGER NOT NULL,
      vowel_skeleton_json TEXT NOT NULL,
      consonant_skeleton_json TEXT NOT NULL,
      ending_signature TEXT NOT NULL,
      onset_signature TEXT NOT NULL,
      dominant_vowel_family TEXT NOT NULL,
      frequency_score REAL NOT NULL,
      frequency_count INTEGER NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      embeddings_tq BLOB
    );

    CREATE INDEX IF NOT EXISTS idx_lexicon_node_normalized ON lexicon_node(normalized);
    CREATE INDEX IF NOT EXISTS idx_lexicon_node_ending_signature ON lexicon_node(ending_signature);
    CREATE INDEX IF NOT EXISTS idx_lexicon_node_frequency_score ON lexicon_node(frequency_score DESC);
  `);
}

function createIndexSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signature_bucket (
      ending_signature TEXT NOT NULL,
      node_id TEXT NOT NULL,
      token TEXT NOT NULL,
      frequency_score REAL NOT NULL,
      syllable_count INTEGER NOT NULL,
      stress_pattern TEXT NOT NULL,
      dominant_vowel_family TEXT NOT NULL,
      onset_signature TEXT NOT NULL,
      phonemes_json TEXT NOT NULL,
      vowel_skeleton_json TEXT NOT NULL,
      consonant_skeleton_json TEXT NOT NULL,
      PRIMARY KEY (ending_signature, node_id)
    );

    CREATE TABLE IF NOT EXISTS signature_bucket_stats (
      ending_signature TEXT PRIMARY KEY,
      member_count INTEGER NOT NULL,
      dominant_vowel_family TEXT NOT NULL,
      dominant_stress_pattern TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS constellation_cluster (
      id TEXT PRIMARY KEY,
      ending_signature TEXT NOT NULL,
      anchor_id TEXT NOT NULL,
      label TEXT NOT NULL,
      dominant_vowel_family_json TEXT NOT NULL,
      dominant_stress_pattern TEXT NOT NULL,
      members_json TEXT NOT NULL,
      density_score REAL NOT NULL,
      cohesion_score REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_signature_bucket_ending_signature ON signature_bucket(ending_signature);
    CREATE INDEX IF NOT EXISTS idx_signature_bucket_node_id ON signature_bucket(node_id);
    CREATE INDEX IF NOT EXISTS idx_cluster_ending_signature ON constellation_cluster(ending_signature);
  `);
}

function createEdgesSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hot_edge (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      from_token TEXT NOT NULL,
      to_token TEXT NOT NULL,
      exact_rhyme_score REAL NOT NULL,
      slant_rhyme_score REAL NOT NULL,
      vowel_match_score REAL NOT NULL,
      consonant_match_score REAL NOT NULL,
      stress_alignment_score REAL NOT NULL,
      syllable_delta_penalty REAL NOT NULL,
      overall_score REAL NOT NULL,
      reasons_json TEXT NOT NULL,
      PRIMARY KEY (from_id, to_id)
    );

    CREATE INDEX IF NOT EXISTS idx_hot_edge_from_id_score ON hot_edge(from_id, overall_score DESC);
    CREATE INDEX IF NOT EXISTS idx_hot_edge_to_id ON hot_edge(to_id);
  `);
}

function stageA_buildLexicon({
  dictPath,
  corpusPath,
  targetLexiconSize,
  lexiconDbPath,
}) {
  const stageStart = nowMs();
  const dictDb = new Database(dictPath, { readonly: true, fileMustExist: true });
  const corpusDb = new Database(corpusPath, { readonly: true, fileMustExist: true });

  try {
    const entryWordSet = collectSet(
      dictDb,
      'SELECT headword_lower AS value FROM entry WHERE headword_lower IS NOT NULL AND headword_lower != \'\''
    );
    const rhymeWordSet = collectSet(
      dictDb,
      'SELECT word_lower AS value FROM rhyme_index WHERE word_lower IS NOT NULL AND word_lower != \'\''
    );

    const lexicalPronunciationSet = new Set();
    for (const token of entryWordSet) {
      if (rhymeWordSet.has(token)) lexicalPronunciationSet.add(token);
    }

    const { sentenceCount, tokenCount, frequencyByToken } = collectCorpusFrequencies(corpusDb);

    const rankedCandidates = [];
    for (const [token, frequency] of frequencyByToken.entries()) {
      if (!lexicalPronunciationSet.has(token)) continue;
      rankedCandidates.push({ token, frequency });
    }
    rankedCandidates.sort((a, b) => b.frequency - a.frequency || a.token.localeCompare(b.token));

    const selectedLexicon = buildSelectedLexicon(
      rankedCandidates,
      lexicalPronunciationSet,
      targetLexiconSize
    );

    const maxFrequency = selectedLexicon.reduce(
      (max, entry) => Math.max(max, Number(entry.frequency) || 0),
      1
    );

    cleanupSqliteTriplet(lexiconDbPath);
    const lexiconDb = prepareWritableDb(lexiconDbPath);
    const builtAt = new Date().toISOString();

    try {
      createLexiconSchema(lexiconDb);
      const insertMetaStmt = lexiconDb.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
      const insertLexiconStmt = lexiconDb.prepare(`
        INSERT INTO lexicon_node (
          id, token, normalized, phonemes_json, stress_pattern, syllable_count,
          vowel_skeleton_json, consonant_skeleton_json, ending_signature, onset_signature,
          dominant_vowel_family, frequency_score, frequency_count, source, created_at,
          embeddings_tq
        ) VALUES (
          @id, @token, @normalized, @phonemesJson, @stressPattern, @syllableCount,
          @vowelSkeletonJson, @consonantSkeletonJson, @endingSignature, @onsetSignature,
          @dominantVowelFamily, @frequencyScore, @frequencyCount, @source, @createdAt,
          @embeddingsTq
        )
      `);

      const nodes = [];
      const skipped = [];

      const writeAll = lexiconDb.transaction(() => {
        let cursor = 0;
        for (const entry of selectedLexicon) {
          const normalized = normalizeToken(entry.token);
          if (!normalized) {
            skipped.push({ token: entry.token, reason: 'empty_normalized_token' });
            continue;
          }

          const deep = PhonemeEngine.analyzeDeep(normalized);
          if (!deep || !Array.isArray(deep.phonemes) || deep.phonemes.length === 0) {
            skipped.push({ token: normalized, reason: 'missing_phoneme_analysis' });
            continue;
          }

          const signature = buildPhoneticSignature(deep.phonemes);
          if (!signature.endingSignature) {
            skipped.push({ token: normalized, reason: 'missing_ending_signature' });
            continue;
          }

          const dominantVowelFamily = getDominantVowelFamily(signature) || 'UNK';
          const frequencyCount = Number(entry.frequency) || 1;
          const frequencyScore = Math.log1p(frequencyCount) / Math.log1p(maxFrequency);
          const nodeId = `w_${cursor + 1}`;

          // Generate TurboQuant embedding for the node
          const vector = generatePhonosemanticVector(normalized, 256);
          const { data, norm } = quantizeVectorJS(vector, 42); // Using canonical seed 42

          // Pack: [4-byte norm][data...]
          const dataBuffer = Buffer.from(data);
          const tqPayload = Buffer.alloc(4 + dataBuffer.length);
          tqPayload.writeFloatLE(norm, 0); 
          dataBuffer.copy(tqPayload, 4);

          const node = {
            id: nodeId,
            token: normalized,
            normalized,
            phonemes: signature.phonemes,
            stressPattern: signature.stressPattern || deep.stressPattern || '',
            syllableCount: signature.syllableCount,
            vowelSkeleton: signature.vowelSkeleton,
            consonantSkeleton: signature.consonantSkeleton,
            endingSignature: signature.endingSignature,
            onsetSignature: signature.onsetSignature,
            dominantVowelFamily,
            frequencyScore,
            frequencyCount,
            source: entry.source,
            signature,
            embeddingsTq: tqPayload
          };

          insertLexiconStmt.run({
            id: node.id,
            token: node.token,
            normalized: node.normalized,
            phonemesJson: JSON.stringify(node.phonemes),
            stressPattern: node.stressPattern,
            syllableCount: node.syllableCount,
            vowelSkeletonJson: JSON.stringify(node.vowelSkeleton),
            consonantSkeletonJson: JSON.stringify(node.consonantSkeleton),
            endingSignature: node.endingSignature,
            onsetSignature: node.onsetSignature,
            dominantVowelFamily: node.dominantVowelFamily,
            frequencyScore: node.frequencyScore,
            frequencyCount: node.frequencyCount,
            source: node.source,
            createdAt: builtAt,
            embeddingsTq: node.embeddingsTq
          });
          nodes.push(node);
          cursor += 1;
        }

        insertMetaStmt.run('version', String(MANIFEST_VERSION));
        insertMetaStmt.run('built_at', builtAt);
        insertMetaStmt.run('target_lexicon_size', String(targetLexiconSize));
        insertMetaStmt.run('lexicon_count', String(nodes.length));
        insertMetaStmt.run('skipped_count', String(skipped.length));
        insertMetaStmt.run('source_dict_path', dictPath);
        insertMetaStmt.run('source_corpus_path', corpusPath);
      });

      writeAll();

      return {
        nodes,
        skipped,
        stats: {
          dictionaryEntryCount: countRows(dictDb, 'entry'),
          dictionaryRhymeIndexCount: countRows(dictDb, 'rhyme_index'),
          pronunciationBackedWordCount: lexicalPronunciationSet.size,
          corpusSentenceCount: sentenceCount,
          corpusTokenCount: tokenCount,
          corpusUniqueTokenCount: frequencyByToken.size,
          corpusOverlapCount: rankedCandidates.length,
          selectedLexiconCount: selectedLexicon.length,
          skippedLexiconCount: skipped.length,
        },
        durationMs: durationMs(stageStart),
      };
    } finally {
      lexiconDb.close();
    }
  } finally {
    dictDb.close();
    corpusDb.close();
  }
}

function stageB_buildIndex({
  nodes,
  indexDbPath,
  oversizedBucketThreshold,
  clusterLimitPerBucket,
}) {
  const stageStart = nowMs();
  cleanupSqliteTriplet(indexDbPath);
  const indexDb = prepareWritableDb(indexDbPath);
  const builtAt = new Date().toISOString();

  try {
    createIndexSchema(indexDb);
    const insertMetaStmt = indexDb.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    const insertBucketStmt = indexDb.prepare(`
      INSERT INTO signature_bucket (
        ending_signature, node_id, token, frequency_score, syllable_count, stress_pattern,
        dominant_vowel_family, onset_signature, phonemes_json, vowel_skeleton_json, consonant_skeleton_json
      ) VALUES (
        @endingSignature, @nodeId, @token, @frequencyScore, @syllableCount, @stressPattern,
        @dominantVowelFamily, @onsetSignature, @phonemesJson, @vowelSkeletonJson, @consonantSkeletonJson
      )
    `);
    const insertBucketStatsStmt = indexDb.prepare(`
      INSERT INTO signature_bucket_stats (
        ending_signature, member_count, dominant_vowel_family, dominant_stress_pattern
      ) VALUES (
        @endingSignature, @memberCount, @dominantVowelFamily, @dominantStressPattern
      )
    `);
    const insertClusterStmt = indexDb.prepare(`
      INSERT INTO constellation_cluster (
        id, ending_signature, anchor_id, label, dominant_vowel_family_json,
        dominant_stress_pattern, members_json, density_score, cohesion_score
      ) VALUES (
        @id, @endingSignature, @anchorId, @label, @dominantVowelFamilyJson,
        @dominantStressPattern, @membersJson, @densityScore, @cohesionScore
      )
    `);

    const bucketMap = new Map();
    for (const node of nodes) {
      if (!bucketMap.has(node.endingSignature)) {
        bucketMap.set(node.endingSignature, []);
      }
      bucketMap.get(node.endingSignature).push(node);
    }

    for (const [endingSignature, members] of bucketMap.entries()) {
      members.sort(
        (a, b) =>
          b.frequencyScore - a.frequencyScore ||
          b.frequencyCount - a.frequencyCount ||
          a.token.localeCompare(b.token) ||
          a.id.localeCompare(b.id)
      );
      bucketMap.set(endingSignature, members);
    }

    const sortedBucketEntries = [...bucketMap.entries()].sort(
      (a, b) =>
        b[1].length - a[1].length ||
        a[0].localeCompare(b[0])
    );

    const oversizedBuckets = [];
    let clusterCount = 0;

    const writeAll = indexDb.transaction(() => {
      insertMetaStmt.run('version', String(MANIFEST_VERSION));
      insertMetaStmt.run('built_at', builtAt);
      insertMetaStmt.run('bucket_count', String(bucketMap.size));
      insertMetaStmt.run('lexicon_count', String(nodes.length));

      for (let bucketIndex = 0; bucketIndex < sortedBucketEntries.length; bucketIndex += 1) {
        const [endingSignature, members] = sortedBucketEntries[bucketIndex];
        const memberCount = members.length;
        const dominantVowelFamily = mode(members.map((member) => member.dominantVowelFamily)) || 'UNK';
        const dominantStressPattern = mode(members.map((member) => member.stressPattern)) || '';

        if (memberCount > oversizedBucketThreshold) {
          oversizedBuckets.push({
            endingSignature,
            memberCount,
            dominantVowelFamily,
          });
        }

        for (const member of members) {
          insertBucketStmt.run({
            endingSignature,
            nodeId: member.id,
            token: member.token,
            frequencyScore: member.frequencyScore,
            syllableCount: member.syllableCount,
            stressPattern: member.stressPattern,
            dominantVowelFamily: member.dominantVowelFamily,
            onsetSignature: member.onsetSignature,
            phonemesJson: JSON.stringify(member.phonemes),
            vowelSkeletonJson: JSON.stringify(member.vowelSkeleton),
            consonantSkeletonJson: JSON.stringify(member.consonantSkeleton),
          });
        }

        insertBucketStatsStmt.run({
          endingSignature,
          memberCount,
          dominantVowelFamily,
          dominantStressPattern,
        });

        const clusterInput = members.map((member) => ({
          nodeId: member.id,
          token: member.token,
          overallScore: member.frequencyScore,
          signature: member.signature,
        }));
        const clusters = buildConstellationClusters(clusterInput, {
          minScore: 0,
          maxClusters: clusterLimitPerBucket,
        });

        for (let index = 0; index < clusters.length; index += 1) {
          const cluster = clusters[index];
          const id = `c_${sanitizeIdPart(endingSignature)}_${bucketIndex + 1}_${index + 1}`;
          insertClusterStmt.run({
            id,
            endingSignature,
            anchorId: cluster.anchorId,
            label: cluster.label,
            dominantVowelFamilyJson: JSON.stringify(cluster.dominantVowelFamily),
            dominantStressPattern: cluster.dominantStressPattern,
            membersJson: JSON.stringify(cluster.members),
            densityScore: cluster.densityScore,
            cohesionScore: cluster.cohesionScore,
          });
          clusterCount += 1;
        }
      }

      insertMetaStmt.run('cluster_count', String(clusterCount));
      insertMetaStmt.run('oversized_bucket_count', String(oversizedBuckets.length));
      insertMetaStmt.run('oversized_bucket_threshold', String(oversizedBucketThreshold));
    });

    writeAll();

    return {
      bucketMap,
      oversizedBuckets,
      bucketCount: bucketMap.size,
      clusterCount,
      largestBucketSize: sortedBucketEntries.length > 0 ? sortedBucketEntries[0][1].length : 0,
      durationMs: durationMs(stageStart),
    };
  } finally {
    indexDb.close();
  }
}

function stageC_buildHotEdges({
  nodes,
  bucketMap,
  edgesDbPath,
  hotEdgeWordLimit,
  hotEdgeTopK,
  bucketCandidateCap,
}) {
  const stageStart = nowMs();
  cleanupSqliteTriplet(edgesDbPath);
  const edgesDb = prepareWritableDb(edgesDbPath);
  const builtAt = new Date().toISOString();

  try {
    createEdgesSchema(edgesDb);
    const insertMetaStmt = edgesDb.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
    const insertEdgeStmt = edgesDb.prepare(`
      INSERT INTO hot_edge (
        from_id, to_id, from_token, to_token,
        exact_rhyme_score, slant_rhyme_score, vowel_match_score, consonant_match_score,
        stress_alignment_score, syllable_delta_penalty, overall_score, reasons_json
      ) VALUES (
        @fromId, @toId, @fromToken, @toToken,
        @exactRhymeScore, @slantRhymeScore, @vowelMatchScore, @consonantMatchScore,
        @stressAlignmentScore, @syllableDeltaPenalty, @overallScore, @reasonsJson
      )
    `);

    const hotWords = [...nodes]
      .sort(
        (a, b) =>
          b.frequencyScore - a.frequencyScore ||
          b.frequencyCount - a.frequencyCount ||
          a.token.localeCompare(b.token)
      )
      .slice(0, hotEdgeWordLimit);

    let hotEdgeCount = 0;
    let truncatedCandidateBuckets = 0;

    const writeAll = edgesDb.transaction(() => {
      insertMetaStmt.run('version', String(MANIFEST_VERSION));
      insertMetaStmt.run('built_at', builtAt);
      insertMetaStmt.run('hot_edge_word_limit', String(hotEdgeWordLimit));
      insertMetaStmt.run('hot_edge_top_k', String(hotEdgeTopK));
      insertMetaStmt.run('bucket_candidate_cap', String(bucketCandidateCap));

      for (const anchor of hotWords) {
        const bucketMembers = bucketMap.get(anchor.endingSignature) || [];
        let candidates = bucketMembers.filter((candidate) => candidate.id !== anchor.id);
        if (bucketCandidateCap > 0 && candidates.length > bucketCandidateCap) {
          truncatedCandidateBuckets += 1;
          candidates = candidates
            .sort(
              (a, b) =>
                b.frequencyScore - a.frequencyScore ||
                b.frequencyCount - a.frequencyCount ||
                a.token.localeCompare(b.token)
            )
            .slice(0, bucketCandidateCap);
        }

        const scored = [];
        for (const candidate of candidates) {
          const edge = scoreNodeSimilarity(anchor, candidate);
          if (edge.overallScore <= 0) continue;
          scored.push({
            ...edge,
            toToken: candidate.token,
          });
        }

        scored.sort(
          (a, b) =>
            b.overallScore - a.overallScore ||
            b.exactRhymeScore - a.exactRhymeScore ||
            a.toToken.localeCompare(b.toToken)
        );

        const topEdges = scored.slice(0, hotEdgeTopK);
        for (const edge of topEdges) {
          insertEdgeStmt.run({
            fromId: anchor.id,
            toId: edge.toId,
            fromToken: anchor.token,
            toToken: edge.toToken,
            exactRhymeScore: edge.exactRhymeScore,
            slantRhymeScore: edge.slantRhymeScore,
            vowelMatchScore: edge.vowelMatchScore,
            consonantMatchScore: edge.consonantMatchScore,
            stressAlignmentScore: edge.stressAlignmentScore,
            syllableDeltaPenalty: edge.syllableDeltaPenalty,
            overallScore: edge.overallScore,
            reasonsJson: JSON.stringify(edge.reasons || []),
          });
          hotEdgeCount += 1;
        }
      }

      insertMetaStmt.run('hot_edge_word_count', String(hotWords.length));
      insertMetaStmt.run('hot_edge_count', String(hotEdgeCount));
      insertMetaStmt.run('truncated_candidate_buckets', String(truncatedCandidateBuckets));
    });

    writeAll();

    return {
      hotWordCount: hotWords.length,
      hotEdgeCount,
      truncatedCandidateBuckets,
      durationMs: durationMs(stageStart),
    };
  } finally {
    edgesDb.close();
  }
}

function collectArtifactStats(artifactPaths) {
  const output = {};
  let totalBytes = 0;
  for (const [key, artifactPath] of Object.entries(artifactPaths)) {
    if (!existsSync(artifactPath)) {
      output[key] = {
        path: artifactPath,
        exists: false,
        bytes: 0,
        mb: 0,
      };
      continue;
    }
    const sizeBytes = statSync(artifactPath).size;
    totalBytes += sizeBytes;
    output[key] = {
      path: artifactPath,
      exists: true,
      bytes: sizeBytes,
      mb: Number((sizeBytes / (1024 * 1024)).toFixed(3)),
    };
  }
  return {
    artifacts: output,
    totalBytes,
    totalMb: Number((totalBytes / (1024 * 1024)).toFixed(3)),
  };
}

function collectRowCounts({ lexiconDbPath, indexDbPath, edgesDbPath }) {
  const lexiconDb = new Database(lexiconDbPath, { readonly: true, fileMustExist: true });
  const indexDb = new Database(indexDbPath, { readonly: true, fileMustExist: true });
  const edgesDb = new Database(edgesDbPath, { readonly: true, fileMustExist: true });

  try {
    return {
      lexiconNode: countRows(lexiconDb, 'lexicon_node'),
      signatureBucket: countRows(indexDb, 'signature_bucket'),
      signatureBucketStats: countRows(indexDb, 'signature_bucket_stats'),
      constellationCluster: countRows(indexDb, 'constellation_cluster'),
      hotEdge: countRows(edgesDb, 'hot_edge'),
      hotEdgeWordCount: Number(
        edgesDb.prepare('SELECT COUNT(DISTINCT from_id) AS n FROM hot_edge').get()?.n || 0
      ),
    };
  } finally {
    lexiconDb.close();
    indexDb.close();
    edgesDb.close();
  }
}

function readMetaMap(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare('SELECT key, value FROM meta').all();
    const out = {};
    for (const row of rows) {
      out[row.key] = row.value;
    }
    return out;
  } finally {
    db.close();
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function buildGutenbergEmotionPriors({
  corpusPath,
  topK = DEFAULT_EMOTION_PRIOR_TOP_K,
  minCount = DEFAULT_EMOTION_PRIOR_MIN_COUNT,
}) {
  const stageStart = nowMs();
  const corpusDb = new Database(corpusPath, { readonly: true, fileMustExist: true });

  try {
    const tokenDocumentFrequency = new Map();
    const emotionDocumentFrequency = Object.fromEntries(
      Object.keys(EMOTION_PRIOR_SEEDS).map((emotion) => [emotion, new Map()])
    );
    const emotionSentenceCount = Object.fromEntries(
      Object.keys(EMOTION_PRIOR_SEEDS).map((emotion) => [emotion, 0])
    );

    let sentenceCount = 0;
    let tokenCount = 0;

    const statement = corpusDb.prepare("SELECT sentence.text AS text FROM sentence INNER JOIN source ON source.id = sentence.source_id WHERE source.type = 'gutenberg'");

    for (const row of statement.iterate()) {
      const tokens = tokenize(row?.text).filter((token) => token.length >= 3);
      if (tokens.length === 0) continue;
      sentenceCount += 1;
      tokenCount += tokens.length;

      const unique = new Set(tokens);
      for (const token of unique) {
        tokenDocumentFrequency.set(token, (tokenDocumentFrequency.get(token) || 0) + 1);
      }

      const emotionHits = {};
      for (const [emotion, seeds] of Object.entries(EMOTION_PRIOR_SEEDS)) {
        emotionHits[emotion] = tokens.some((token) => seeds.has(token));
      }

      for (const [emotion, hit] of Object.entries(emotionHits)) {
        if (!hit) continue;
        emotionSentenceCount[emotion] += 1;
        const emotionMap = emotionDocumentFrequency[emotion];
        for (const token of unique) {
          if (EMOTION_PRIOR_STOP_WORDS.has(token)) continue;
          emotionMap.set(token, (emotionMap.get(token) || 0) + 1);
        }
      }
    }

    const emotions = {};
    const diagnostics = {};

    for (const [emotion, counts] of Object.entries(emotionDocumentFrequency)) {
      const matchedSentenceCount = emotionSentenceCount[emotion] || 0;
      if (matchedSentenceCount === 0) {
        emotions[emotion] = {};
        diagnostics[emotion] = { matchedSentenceCount: 0, retainedTokenCount: 0 };
        continue;
      }

      let maxLift = 0;
      const scored = [];
      for (const [token, count] of counts.entries()) {
        if (count < minCount) continue;

        const emotionRate = count / matchedSentenceCount;
        const baselineRate = (tokenDocumentFrequency.get(token) || 0) / Math.max(1, sentenceCount);
        if (baselineRate <= 0) continue;
        const lift = emotionRate / baselineRate;
        if (lift <= 1) continue;
        if (lift > maxLift) maxLift = lift;

        scored.push({ token, count, lift });
      }

      scored.sort((a, b) => b.lift - a.lift || b.count - a.count || a.token.localeCompare(b.token));
      const top = scored.slice(0, topK);
      const out = {};
      for (const row of top) {
        const normalizedLift = maxLift > 0 ? row.lift / maxLift : 0;
        const frequencyScale = Math.log1p(row.count) / Math.log1p(top[0]?.count || 1);
        out[row.token] = Number(clamp01((normalizedLift * 0.7) + (frequencyScale * 0.3)).toFixed(4));
      }

      emotions[emotion] = out;
      diagnostics[emotion] = {
        matchedSentenceCount,
        retainedTokenCount: Object.keys(out).length,
      };
    }

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      sourceType: 'gutenberg',
      sentenceCount,
      tokenCount,
      emotions,
      diagnostics,
      durationMs: durationMs(stageStart),
    };
  } finally {
    corpusDb.close();
  }
}

async function main() {
  const totalStart = nowMs();

  const dictPath = resolveDatabasePath(
    process.env.SCHOLOMANCE_DICT_PATH,
    'scholomance_dict.sqlite'
  );
  const corpusPath = resolveDatabasePath(
    process.env.SCHOLOMANCE_CORPUS_PATH,
    'scholomance_corpus.sqlite'
  );
  const outputDir = resolveOutputDir();
  const targetLexiconSize = parsePositiveInteger(
    process.env.RHYME_ASTROLOGY_TARGET_LEXICON,
    DEFAULT_TARGET_LEXICON_SIZE
  );
  const hotEdgeWordLimit = parsePositiveInteger(
    process.env.RHYME_ASTROLOGY_HOT_EDGE_WORD_LIMIT,
    DEFAULT_HOT_EDGE_WORD_LIMIT
  );
  const hotEdgeTopK = parsePositiveInteger(
    process.env.RHYME_ASTROLOGY_HOT_EDGE_TOP_K,
    DEFAULT_HOT_EDGE_TOP_K
  );
  const oversizedBucketThreshold = parsePositiveInteger(
    process.env.RHYME_ASTROLOGY_OVERSIZED_BUCKET_THRESHOLD,
    DEFAULT_OVERSIZED_BUCKET_THRESHOLD
  );
  const bucketCandidateCap = parseNonNegativeInteger(
    process.env.RHYME_ASTROLOGY_BUCKET_CANDIDATE_CAP,
    DEFAULT_BUCKET_CANDIDATE_CAP
  );
  const clusterLimitPerBucket = parsePositiveInteger(
    process.env.RHYME_ASTROLOGY_CLUSTER_LIMIT_PER_BUCKET,
    DEFAULT_CLUSTER_LIMIT_PER_BUCKET
  );
  const storageTargetMb = parsePositiveNumber(
    process.env.RHYME_ASTROLOGY_STORAGE_TARGET_MB,
    DEFAULT_STORAGE_TARGET_MB
  );
  const emotionPriorTopK = parsePositiveInteger(
    process.env.RHYME_EMOTION_PRIOR_TOP_K,
    DEFAULT_EMOTION_PRIOR_TOP_K
  );
  const emotionPriorMinCount = parsePositiveInteger(
    process.env.RHYME_EMOTION_PRIOR_MIN_COUNT,
    DEFAULT_EMOTION_PRIOR_MIN_COUNT
  );

  if (!existsSync(dictPath)) {
    throw new Error(`Dictionary DB not found: ${dictPath}`);
  }
  if (!existsSync(corpusPath)) {
    throw new Error(`Corpus DB not found: ${corpusPath}`);
  }

  mkdirSync(outputDir, { recursive: true });
  const lexiconDbPath = path.join(outputDir, 'rhyme_lexicon.sqlite');
  const indexDbPath = path.join(outputDir, 'rhyme_index.sqlite');
  const edgesDbPath = path.join(outputDir, 'rhyme_edges.sqlite');
  const manifestPath = path.join(outputDir, 'rhyme_manifest.json');
  const oversizedBucketsPath = path.join(outputDir, 'rhyme_oversized_buckets.json');
  const emotionPriorsPath = path.join(outputDir, 'rhyme_emotion_priors.json');

  console.log(`[rhyme-astrology:phase2] output directory: ${outputDir}`);
  console.log('[rhyme-astrology:phase2] initializing phoneme engine...');
  await PhonemeEngine.init();

  console.log('[rhyme-astrology:phase2] Stage A: building rhyme_lexicon.sqlite');
  const stageA = stageA_buildLexicon({
    dictPath,
    corpusPath,
    targetLexiconSize,
    lexiconDbPath,
  });
  console.log(
    `[rhyme-astrology:phase2] Stage A complete: ${stageA.nodes.length} lexicon nodes` +
    ` (${stageA.stats.skippedLexiconCount} skipped) in ${stageA.durationMs}ms`
  );

  if (stageA.nodes.length === 0) {
    throw new Error('Stage A produced zero lexicon nodes.');
  }

  console.log('[rhyme-astrology:phase2] Stage B: building rhyme_index.sqlite');
  const stageB = stageB_buildIndex({
    nodes: stageA.nodes,
    indexDbPath,
    oversizedBucketThreshold,
    clusterLimitPerBucket,
  });
  console.log(
    `[rhyme-astrology:phase2] Stage B complete: ${stageB.bucketCount} buckets,` +
    ` ${stageB.clusterCount} clusters, largest bucket ${stageB.largestBucketSize}`
  );

  console.log('[rhyme-astrology:phase2] Stage C: building rhyme_edges.sqlite');
  const stageC = stageC_buildHotEdges({
    nodes: stageA.nodes,
    bucketMap: stageB.bucketMap,
    edgesDbPath,
    hotEdgeWordLimit,
    hotEdgeTopK,
    bucketCandidateCap,
  });
  console.log(
    `[rhyme-astrology:phase2] Stage C complete: ${stageC.hotWordCount} hot words,` +
    ` ${stageC.hotEdgeCount} hot edges`
  );

  console.log('[rhyme-astrology:phase2] Stage D: building rhyme_emotion_priors.json');
  const stageD = buildGutenbergEmotionPriors({
    corpusPath,
    topK: emotionPriorTopK,
    minCount: emotionPriorMinCount,
  });
  writeFileSync(emotionPriorsPath, `${JSON.stringify(stageD, null, 2)}\n`, 'utf8');
  console.log(
    `[rhyme-astrology:phase2] Stage D complete: ${stageD.sentenceCount} Gutenberg sentences` +
    `, priors=${Object.values(stageD.emotions).reduce((sum, map) => sum + Object.keys(map || {}).length, 0)}` +
    ` in ${stageD.durationMs}ms`
  );

  const artifactStats = collectArtifactStats({
    rhymeLexiconSqlite: lexiconDbPath,
    rhymeIndexSqlite: indexDbPath,
    rhymeEdgesSqlite: edgesDbPath,
    rhymeEmotionPriorsJson: emotionPriorsPath,
  });
  const rowCounts = collectRowCounts({ lexiconDbPath, indexDbPath, edgesDbPath });
  const lexiconMeta = readMetaMap(lexiconDbPath);
  const indexMeta = readMetaMap(indexDbPath);
  const edgesMeta = readMetaMap(edgesDbPath);

  const oversizedBucketPayload = {
    generatedAt: new Date().toISOString(),
    threshold: oversizedBucketThreshold,
    count: stageB.oversizedBuckets.length,
    buckets: stageB.oversizedBuckets,
  };
  writeFileSync(oversizedBucketsPath, `${JSON.stringify(oversizedBucketPayload, null, 2)}\n`, 'utf8');

  const storageWithinTarget = artifactStats.totalMb <= storageTargetMb;
  const manifest = {
    version: MANIFEST_VERSION,
    builtAt: new Date().toISOString(),
    sources: {
      dictionary: dictPath,
      corpus: corpusPath,
    },
    config: {
      targetLexiconSize,
      hotEdgeWordLimit,
      hotEdgeTopK,
      oversizedBucketThreshold,
      bucketCandidateCap,
      clusterLimitPerBucket,
      storageTargetMb,
      outputDir,
      emotionPriorTopK,
      emotionPriorMinCount,
    },
    lexiconCount: rowCounts.lexiconNode,
    signatureBuckets: rowCounts.signatureBucketStats,
    hotEdgeWords: stageC.hotWordCount,
    hotEdgeCount: rowCounts.hotEdge,
    clusterCount: rowCounts.constellationCluster,
    diagnostics: {
      stageA: {
        durationMs: stageA.durationMs,
        skippedLexiconCount: stageA.stats.skippedLexiconCount,
        pronunciationBackedWordCount: stageA.stats.pronunciationBackedWordCount,
        corpusOverlapCount: stageA.stats.corpusOverlapCount,
      },
      stageB: {
        durationMs: stageB.durationMs,
        largestBucketSize: stageB.largestBucketSize,
        oversizedBucketCount: stageB.oversizedBuckets.length,
      },
      stageC: {
        durationMs: stageC.durationMs,
        truncatedCandidateBuckets: stageC.truncatedCandidateBuckets,
      },
      stageD: {
        durationMs: stageD.durationMs,
        sentenceCount: stageD.sentenceCount,
        tokenCount: stageD.tokenCount,
      },
      timingsMs: {
        total: durationMs(totalStart),
      },
    },
    validation: {
      rowCounts,
      artifactSizes: artifactStats.artifacts,
      totalArtifactBytes: artifactStats.totalBytes,
      totalArtifactMb: artifactStats.totalMb,
      storageTargetMb,
      storageWithinTarget,
      oversizedBucketsPath,
      oversizedBucketCount: stageB.oversizedBuckets.length,
      emotionPriorsPath,
      emotionPriorsEmotionCount: Object.keys(stageD.emotions || {}).length,
    },
    meta: {
      lexicon: lexiconMeta,
      index: indexMeta,
      edges: edgesMeta,
    },
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log('[rhyme-astrology:phase2] Validation summary');
  console.log(
    `[rhyme-astrology:phase2] rows lexicon=${rowCounts.lexiconNode} buckets=${rowCounts.signatureBucketStats}` +
    ` clusters=${rowCounts.constellationCluster} hotEdges=${rowCounts.hotEdge}`
  );
  console.log(
    `[rhyme-astrology:phase2] artifacts total=${artifactStats.totalMb}MB` +
    ` target=${storageTargetMb}MB withinTarget=${storageWithinTarget}`
  );
  if (stageB.oversizedBuckets.length > 0) {
    console.warn(
      `[rhyme-astrology:phase2] oversized buckets=${stageB.oversizedBuckets.length}` +
      ` (threshold ${oversizedBucketThreshold})`
    );
  }
  console.log(`[rhyme-astrology:phase2] wrote manifest: ${manifestPath}`);
  console.log(`[rhyme-astrology:phase2] wrote oversized-bucket log: ${oversizedBucketsPath}`);
  console.log(`[rhyme-astrology:phase2] wrote emotion priors: ${emotionPriorsPath}`);
}

main().catch((error) => {
  console.error('[rhyme-astrology:phase2] build failed:', error);
  process.exitCode = 1;
});

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { resolveDatabasePath } from '../codex/server/utils/pathResolution.js';

const DEFAULT_TARGET_LEXICON_SIZE = 50000;
const TOKEN_REGEX = /[a-z]+(?:'[a-z]+)*/g;

function tokenize(text) {
  return String(text || '').toLowerCase().match(TOKEN_REGEX) || [];
}

function countRows(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM ${tableName}`).get()?.n || 0);
}

function fail(message) {
  console.error(`[rhyme-astrology:phase0] ${message}`);
  process.exitCode = 1;
}

function collectSet(db, sql) {
  const out = new Set();
  const statement = db.prepare(sql);
  for (const row of statement.iterate()) {
    const value = String(row?.value || '').trim().toLowerCase();
    if (value) out.add(value);
  }
  return out;
}

function collectCorpusFrequencies(corpusDb) {
  const frequencyByToken = new Map();
  let sentenceCount = 0;
  let tokenCount = 0;

  const sentenceStmt = corpusDb.prepare('SELECT text FROM sentence');
  for (const row of sentenceStmt.iterate()) {
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
  const selectedTokenSet = new Set();

  for (const entry of rankedCandidates) {
    if (selected.length >= targetLexiconSize) break;
    selected.push({
      token: entry.token,
      frequency: entry.frequency,
      source: 'corpus',
    });
    selectedTokenSet.add(entry.token);
  }

  if (selected.length < targetLexiconSize) {
    const remaining = [];
    for (const token of lexicalPronunciationSet) {
      if (!selectedTokenSet.has(token)) {
        remaining.push(token);
      }
    }
    remaining.sort(sortFallbackTokens);

    for (const token of remaining) {
      if (selected.length >= targetLexiconSize) break;
      selected.push({
        token,
        frequency: 1,
        source: 'fallback_floor',
      });
      selectedTokenSet.add(token);
    }
  }

  return selected;
}

function buildPhase0Summary({
  dictPath,
  corpusPath,
  targetLexiconSize,
  dictStats,
  corpusStats,
  rankedCandidates,
  selectedLexicon,
}) {
  const highestFrequency = selectedLexicon.reduce(
    (max, entry) => Math.max(max, Number(entry.frequency) || 0),
    1
  );
  const frequencyPreview = selectedLexicon.slice(0, 10).map((entry, index) => ({
    rank: index + 1,
    token: entry.token,
    count: entry.frequency,
    source: entry.source,
    normalizedScore: Number((
      Math.log1p(entry.frequency) / Math.log1p(highestFrequency)
    ).toFixed(6)),
  }));

  const selectedFromCorpusCount = selectedLexicon.filter((entry) => entry.source === 'corpus').length;
  const selectedFromFallbackCount = selectedLexicon.length - selectedFromCorpusCount;

  return {
    generatedAt: new Date().toISOString(),
    targetLexiconSize,
    sources: {
      dictionary: dictPath,
      corpus: corpusPath,
      lexiconSource: 'scholomance_dict.sqlite:entry + rhyme_index',
      frequencySource: 'scholomance_corpus.sqlite:sentence text token frequency (fallback floor for uncovered words)',
    },
    frequencyPolicy: {
      method: 'corpus_frequency_then_fallback_floor',
      fallbackFloorCount: 1,
      fallbackSort: 'shorter token first, then lexical',
    },
    dictionary: dictStats,
    corpus: corpusStats,
    candidatePool: {
      intersectionCount: rankedCandidates.length,
      selectedCount: selectedLexicon.length,
      selectedFromCorpusCount,
      selectedFromFallbackCount,
      coverageGap: Math.max(0, targetLexiconSize - rankedCandidates.length),
      targetReady: selectedLexicon.length >= targetLexiconSize,
    },
    frequencyPreview,
  };
}

function main() {
  const dictPath = resolveDatabasePath(
    process.env.SCHOLOMANCE_DICT_PATH,
    'scholomance_dict.sqlite'
  );
  const corpusPath = resolveDatabasePath(
    process.env.SCHOLOMANCE_CORPUS_PATH,
    'scholomance_corpus.sqlite'
  );
  const targetLexiconSize = Number(process.env.RHYME_ASTROLOGY_TARGET_LEXICON || DEFAULT_TARGET_LEXICON_SIZE);
  let hasErrors = false;

  if (!Number.isInteger(targetLexiconSize) || targetLexiconSize <= 0) {
    fail(`RHYME_ASTROLOGY_TARGET_LEXICON must be a positive integer. Received: ${process.env.RHYME_ASTROLOGY_TARGET_LEXICON}`);
    hasErrors = true;
    return;
  }

  if (!existsSync(dictPath)) {
    fail(`Dictionary DB not found at ${dictPath}`);
    hasErrors = true;
    return;
  }
  if (!existsSync(corpusPath)) {
    fail(`Corpus DB not found at ${corpusPath}`);
    hasErrors = true;
    return;
  }

  const dictDb = new Database(dictPath, { readonly: true, fileMustExist: true });
  const corpusDb = new Database(corpusPath, { readonly: true, fileMustExist: true });

  try {
    const dictEntryCount = countRows(dictDb, 'entry');
    const dictRhymeIndexCount = countRows(dictDb, 'rhyme_index');

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
      if (rhymeWordSet.has(token)) {
        lexicalPronunciationSet.add(token);
      }
    }

    const {
      sentenceCount,
      tokenCount,
      frequencyByToken,
    } = collectCorpusFrequencies(corpusDb);

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

    if (lexicalPronunciationSet.size < targetLexiconSize) {
      fail(
        `Dictionary does not have enough pronunciation-backed words: ${lexicalPronunciationSet.size} < ${targetLexiconSize}`
      );
      hasErrors = true;
    }

    if (rankedCandidates.length === 0) {
      fail(
        'Corpus-derived frequency source produced zero overlap with pronunciation-backed dictionary words.'
      );
      hasErrors = true;
    }

    const summary = buildPhase0Summary({
      dictPath,
      corpusPath,
      targetLexiconSize,
      dictStats: {
        entryCount: dictEntryCount,
        rhymeIndexCount: dictRhymeIndexCount,
        pronunciationBackedWordCount: lexicalPronunciationSet.size,
      },
      corpusStats: {
        sentenceCount,
        tokenCount,
        uniqueTokenCount: frequencyByToken.size,
      },
      rankedCandidates,
      selectedLexicon,
    });

    const outputDir = path.resolve(process.cwd(), 'docs', 'rhyme-astrology');
    const outputPath = path.join(outputDir, 'phase0-source-verification.json');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    console.log('[rhyme-astrology:phase0] Source verification complete.');
    console.log(`[rhyme-astrology:phase0] Dictionary words with pronunciation coverage: ${summary.dictionary.pronunciationBackedWordCount}`);
    console.log(`[rhyme-astrology:phase0] Corpus overlap candidates: ${summary.candidatePool.intersectionCount}`);
    if (summary.candidatePool.coverageGap > 0) {
      console.warn(
        `[rhyme-astrology:phase0] Coverage gap for target ${targetLexiconSize}: ${summary.candidatePool.coverageGap} words (filled via fallback floor).`
      );
    }
    console.log(`[rhyme-astrology:phase0] Selected lexicon size: ${summary.candidatePool.selectedCount}`);
    console.log(`[rhyme-astrology:phase0] Wrote summary: ${outputPath}`);
    if (hasErrors || process.exitCode) {
      process.exitCode = process.exitCode || 1;
    }
  } finally {
    dictDb.close();
    corpusDb.close();
  }
}

main();

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { TriePredictor } from '../codex/core/trie.js';
import { PhonemeEngine } from '../codex/core/phonology/phoneme.engine.js';
import { RhymeIndex } from '../src/lib/pls/rhymeIndex.js';
import { rhymeProvider } from '../src/lib/pls/providers/rhymeProvider.js';
import { prefixProvider } from '../src/lib/pls/providers/prefixProvider.js';
import { meterProvider } from '../src/lib/pls/providers/meterProvider.js';
import { colorProvider } from '../src/lib/pls/providers/colorProvider.js';
import { democracyProvider } from '../src/lib/pls/providers/democracyProvider.js';
import { validityProvider } from '../src/lib/pls/providers/validityProvider.js';
import { rankCandidates as upgradedRankCandidates } from '../src/lib/pls/ranker.js';
import { predictabilityProvider as upgradedPredictabilityProvider } from '../src/lib/pls/providers/predictabilityProvider.js';

const PROJECT_ROOT = process.cwd();
const DATASET_PATH = path.join(PROJECT_ROOT, 'public', 'ritual_dataset.jsonl');
const TMP_DIR = path.join(PROJECT_ROOT, '.tmp', 'pls-arbiter-benchmark');
const MAX_PROBES = Number(process.env.PLS_BENCH_MAX_PROBES || 6000);
const AMBIGUITY_GAP_THRESHOLD = 0.06;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z']/g, '');
}

function extractLastWord(text) {
  const matches = String(text || '').toLowerCase().match(/[a-z']+/g);
  if (!matches || matches.length === 0) return null;
  return normalizeToken(matches[matches.length - 1]);
}

function seededShuffle(items, seed = 20260308) {
  const result = [...items];
  let state = seed >>> 0;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createNestedCounter() {
  return new Map();
}

function incrementNestedCounter(counter, key, value) {
  if (!key || value === null || value === undefined || value === '') return;
  const inner = counter.get(key) || new Map();
  inner.set(value, (inner.get(value) || 0) + 1);
  counter.set(key, inner);
}

function dominantValue(counter, key) {
  const inner = counter.get(key);
  if (!inner || inner.size === 0) return null;
  let best = null;
  let bestCount = -1;
  for (const [value, count] of inner.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function loadDataset() {
  const raw = fs.readFileSync(DATASET_PATH, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function buildCorpusAndProbes(dataset) {
  const trie = new TriePredictor();
  const vocab = new Set();
  const schoolCounter = createNestedCounter();
  const syllableCounter = createNestedCounter();
  const probes = [];

  for (const entry of dataset) {
    const rawTokens = Array.isArray(entry?.tokens) ? entry.tokens : [];
    const tokens = [];

    for (const rawToken of rawTokens) {
      const token = normalizeToken(rawToken?.token);
      if (!token) continue;

      const school = String(rawToken?.school || '').toUpperCase() || null;
      const syllablesRaw = Number(rawToken?.syllables);
      const syllables = Number.isFinite(syllablesRaw) && syllablesRaw > 0 ? Math.round(syllablesRaw) : null;

      tokens.push({ token, school, syllables });
      vocab.add(token);
      incrementNestedCounter(schoolCounter, token, school);
      if (syllables !== null) incrementNestedCounter(syllableCounter, token, String(syllables));
    }

    for (let i = 0; i < tokens.length; i += 1) {
      const current = tokens[i]?.token;
      const next = tokens[i + 1]?.token || null;
      if (current) trie.insert(current, next);
    }

    if (tokens.length < 2) continue;

    const prevLineContexts = Array.isArray(entry?.context_prev_lines) ? entry.context_prev_lines : [];
    const prevLineEndWord = prevLineContexts.length
      ? extractLastWord(prevLineContexts[prevLineContexts.length - 1])
      : null;

    let runningSyllables = 0;
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      runningSyllables += t.syllables || 1;

      if (i === 0) continue;
      const target = tokens[i];
      const currentLineWords = tokens.slice(0, i).map((item) => item.token);
      const consumedSyllables = tokens.slice(0, i).reduce((sum, item) => sum + (item.syllables || 1), 0);

      probes.push({
        currentLineWords,
        prevWord: tokens[i - 1].token,
        prevLineEndWord,
        targetToken: target.token,
        targetSchool: target.school || null,
        targetSyllables: target.syllables || 1,
        consumedSyllables,
      });
    }
  }

  return { trie, vocab: [...vocab], schoolCounter, syllableCounter, probes };
}

async function loadBaselineModules() {
  const baselineProviderSource = execSync('git show HEAD:src/lib/pls/providers/predictabilityProvider.js', {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });
  const baselineRankerSource = execSync('git show HEAD:src/lib/pls/ranker.js', {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  fs.mkdirSync(TMP_DIR, { recursive: true });

  const hhmModelUrl = pathToFileURL(path.join(PROJECT_ROOT, 'src/lib/models/harkov.model.js')).href;
  const providerPatched = baselineProviderSource.replace(
    /from\s+['"]\.\.\/\.\.\/models\/harkov\.model\.js['"]/,
    `from '${hhmModelUrl}'`
  );

  const providerPath = path.join(TMP_DIR, 'predictabilityProvider.baseline.mjs');
  const rankerPath = path.join(TMP_DIR, 'ranker.baseline.mjs');
  fs.writeFileSync(providerPath, providerPatched, 'utf8');
  fs.writeFileSync(rankerPath, baselineRankerSource, 'utf8');

  const cacheBust = Date.now();
  const providerModule = await import(`${pathToFileURL(providerPath).href}?v=${cacheBust}`);
  const rankerModule = await import(`${pathToFileURL(rankerPath).href}?v=${cacheBust}`);

  return {
    predictabilityProvider: providerModule.predictabilityProvider,
    rankCandidates: rankerModule.rankCandidates,
  };
}

function initializeStats() {
  return {
    total: 0,
    top1Hits: 0,
    top3Hits: 0,
    top5Hits: 0,
    mrrSum: 0,
    misses: 0,
    semanticHits: 0,
    semanticTotal: 0,
    syllableDeltaSum: 0,
    syllableWithinOne: 0,
    topGapSum: 0,
    topGapCount: 0,
    latencies: [],
  };
}

function topGap(results) {
  if (!Array.isArray(results) || results.length < 2) return 1;
  const first = Number(results[0]?.score) || 0;
  const second = Number(results[1]?.score) || 0;
  return Math.max(0, first - second);
}

function chooseTop(results) {
  if (!Array.isArray(results) || results.length === 0) return null;
  return results[0];
}

function finalizeStats(stats) {
  const total = Math.max(1, stats.total);
  return {
    samples: stats.total,
    top1_rate: (stats.top1Hits / total) * 100,
    top3_rate: (stats.top3Hits / total) * 100,
    top5_rate: (stats.top5Hits / total) * 100,
    mrr: stats.mrrSum / total,
    miss_rate: (stats.misses / total) * 100,
    semantic_top1_rate: stats.semanticTotal > 0 ? (stats.semanticHits / stats.semanticTotal) * 100 : 0,
    semantic_coverage: stats.semanticTotal,
    syllable_divergence_mae: stats.syllableDeltaSum / total,
    syllable_within_1_rate: (stats.syllableWithinOne / total) * 100,
    avg_top_gap: stats.topGapCount > 0 ? (stats.topGapSum / stats.topGapCount) : 0,
    latency_ms_mean: mean(stats.latencies),
    latency_ms_p50: percentile(stats.latencies, 50),
    latency_ms_p95: percentile(stats.latencies, 95),
  };
}

function formatDelta(after, before) {
  const delta = after - before;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(3)}`;
}

function metricRow(label, before, after, unit = '') {
  return {
    metric: label,
    prior: `${before.toFixed(3)}${unit}`,
    upgraded: `${after.toFixed(3)}${unit}`,
    delta: `${formatDelta(after, before)}${unit}`,
  };
}

function resolveTokenSchool(schoolCounter, token) {
  return dominantValue(schoolCounter, token);
}

function resolveTokenSyllables(syllableCounter, token) {
  const dominant = dominantValue(syllableCounter, token);
  if (dominant) return Number(dominant) || 1;
  const analysis = PhonemeEngine.analyzeWord(token);
  return analysis?.syllableCount || 1;
}

function recordResult(stats, results, probe, schoolCounter, syllableCounter, latencyMs) {
  stats.total += 1;
  stats.latencies.push(latencyMs);

  const normalizedTarget = probe.targetToken;
  const idx = (Array.isArray(results) ? results : []).findIndex(
    (candidate) => normalizeToken(candidate?.token) === normalizedTarget
  );

  if (idx === 0) stats.top1Hits += 1;
  if (idx >= 0 && idx < 3) stats.top3Hits += 1;
  if (idx >= 0 && idx < 5) stats.top5Hits += 1;
  if (idx >= 0) {
    stats.mrrSum += 1 / (idx + 1);
  } else {
    stats.misses += 1;
  }

  const best = chooseTop(results);
  if (best) {
    const bestToken = normalizeToken(best.token);
    const bestSchool = resolveTokenSchool(schoolCounter, bestToken);
    if (probe.targetSchool && bestSchool) {
      stats.semanticTotal += 1;
      if (bestSchool === probe.targetSchool) stats.semanticHits += 1;
    }

    const bestSyllables = resolveTokenSyllables(syllableCounter, bestToken);
    const syllableDelta = Math.abs(bestSyllables - (probe.targetSyllables || 1));
    stats.syllableDeltaSum += syllableDelta;
    if (syllableDelta <= 1) stats.syllableWithinOne += 1;
  }

  const gap = topGap(results);
  if (Number.isFinite(gap)) {
    stats.topGapSum += gap;
    stats.topGapCount += 1;
  }
}

async function runPipeline(context, engines, modules) {
  const [rhymeResults, prefixResults] = await Promise.all([
    rhymeProvider(context, engines),
    Promise.resolve(prefixProvider(context, engines)),
  ]);

  const generatorResults = {
    rhyme: rhymeResults,
    prefix: prefixResults,
    synonym: [],
  };

  const allCandidates = [];
  const seen = new Set();
  for (const resultSet of Object.values(generatorResults)) {
    for (const entry of resultSet) {
      const token = normalizeToken(entry?.token);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      allCandidates.push({ token, score: 0, scores: {}, badge: null });
    }
  }

  if (allCandidates.length === 0) return [];

  const [meterResults, colorResults, validityResults, democracyResults, predictabilityResults] = await Promise.all([
    Promise.resolve(meterProvider(context, engines, allCandidates)),
    Promise.resolve(colorProvider(context, engines, allCandidates)),
    validityProvider(context, engines, allCandidates),
    democracyProvider(context, engines, allCandidates),
    Promise.resolve(modules.predictabilityProvider(context, engines, allCandidates)),
  ]);

  const scorerResults = {
    meter: meterResults,
    color: colorResults,
    validity: validityResults,
    democracy: democracyResults,
    predictability: predictabilityResults,
  };

  return modules.rankCandidates(generatorResults, scorerResults, undefined, context, 10);
}

async function evaluateMode(modeName, probes, engines, baselineModules, upgradedModules, schoolCounter, syllableCounter) {
  const baselineStats = initializeStats();
  const upgradedStats = initializeStats();
  const baselineAmbiguousStats = initializeStats();
  const upgradedAmbiguousStats = initializeStats();

  const useTypedPrefix = modeName === 'typed_prefix';

  for (let i = 0; i < probes.length; i += 1) {
    const probe = probes[i];
    const prefix = useTypedPrefix
      ? probe.targetToken.slice(0, Math.min(2, probe.targetToken.length))
      : '';

    const context = {
      prefix,
      prevWord: probe.prevWord,
      prevLineEndWord: probe.prevLineEndWord,
      currentLineWords: probe.currentLineWords,
      targetSyllableCount: probe.consumedSyllables + (probe.targetSyllables || 1),
      priorLineSyllableCounts: [],
    };

    const beforeStart = performance.now();
    const baselineResults = await runPipeline(context, engines, baselineModules);
    const beforeLatency = performance.now() - beforeStart;

    const afterStart = performance.now();
    const upgradedResults = await runPipeline(context, engines, upgradedModules);
    const afterLatency = performance.now() - afterStart;

    recordResult(baselineStats, baselineResults, probe, schoolCounter, syllableCounter, beforeLatency);
    recordResult(upgradedStats, upgradedResults, probe, schoolCounter, syllableCounter, afterLatency);

    const gap = topGap(baselineResults);
    if (gap <= AMBIGUITY_GAP_THRESHOLD) {
      recordResult(baselineAmbiguousStats, baselineResults, probe, schoolCounter, syllableCounter, beforeLatency);
      recordResult(upgradedAmbiguousStats, upgradedResults, probe, schoolCounter, syllableCounter, afterLatency);
    }

    if ((i + 1) % 500 === 0) {
      console.log(`[${modeName}] processed ${i + 1}/${probes.length}`);
    }
  }

  return {
    modeName,
    baseline: finalizeStats(baselineStats),
    upgraded: finalizeStats(upgradedStats),
    baselineAmbiguous: finalizeStats(baselineAmbiguousStats),
    upgradedAmbiguous: finalizeStats(upgradedAmbiguousStats),
  };
}

function printComparison(label, baseline, upgraded) {
  console.log(`\n=== ${label} ===`);
  console.table([
    metricRow('Top-1 Accuracy', baseline.top1_rate, upgraded.top1_rate, '%'),
    metricRow('Top-3 Accuracy', baseline.top3_rate, upgraded.top3_rate, '%'),
    metricRow('Top-5 Accuracy', baseline.top5_rate, upgraded.top5_rate, '%'),
    metricRow('MRR', baseline.mrr, upgraded.mrr),
    metricRow('Semantic Top-1 Accuracy', baseline.semantic_top1_rate, upgraded.semantic_top1_rate, '%'),
    metricRow('Syllable Divergence MAE (lower better)', baseline.syllable_divergence_mae, upgraded.syllable_divergence_mae),
    metricRow('Within-1 Syllable Rate', baseline.syllable_within_1_rate, upgraded.syllable_within_1_rate, '%'),
    metricRow('Mean Top Gap', baseline.avg_top_gap, upgraded.avg_top_gap),
    metricRow('Latency Mean', baseline.latency_ms_mean, upgraded.latency_ms_mean, 'ms'),
    metricRow('Latency p50', baseline.latency_ms_p50, upgraded.latency_ms_p50, 'ms'),
    metricRow('Latency p95', baseline.latency_ms_p95, upgraded.latency_ms_p95, 'ms'),
  ]);

  const beforeMae = baseline.syllable_divergence_mae;
  const afterMae = upgraded.syllable_divergence_mae;
  const reduction = beforeMae > 0 ? ((beforeMae - afterMae) / beforeMae) * 100 : 0;
  console.log(`Syllable diversion reduction: ${reduction.toFixed(3)}%`);
  console.log(`Semantic coverage samples: prior=${baseline.semantic_coverage}, upgraded=${upgraded.semantic_coverage}`);
}

async function main() {
  console.log('Loading ritual dataset...');
  const dataset = loadDataset();
  console.log(`Loaded ${dataset.length} dataset rows.`);

  console.log('Building corpus structures...');
  const { trie, vocab, schoolCounter, syllableCounter, probes } = buildCorpusAndProbes(dataset);
  const shuffled = seededShuffle(probes, 20260308);
  const selected = shuffled.slice(0, Math.min(MAX_PROBES, shuffled.length));
  console.log(`Using ${selected.length} probes (max requested: ${MAX_PROBES}).`);

  console.log('Initializing phoneme engine and rhyme index...');
  await PhonemeEngine.init();
  const rhymeIndex = new RhymeIndex();
  rhymeIndex.build(vocab, PhonemeEngine);

  const engines = {
    phonemeEngine: PhonemeEngine,
    trie,
    spellchecker: null,
    rhymeIndex,
    dictionaryAPI: null,
  };

  console.log('Loading baseline modules from git HEAD...');
  const baselineModules = await loadBaselineModules();
  const upgradedModules = {
    predictabilityProvider: upgradedPredictabilityProvider,
    rankCandidates: upgradedRankCandidates,
  };

  const modeResults = [];
  modeResults.push(
    await evaluateMode('open_context', selected, engines, baselineModules, upgradedModules, schoolCounter, syllableCounter)
  );
  modeResults.push(
    await evaluateMode('typed_prefix', selected, engines, baselineModules, upgradedModules, schoolCounter, syllableCounter)
  );

  for (const mode of modeResults) {
    printComparison(`${mode.modeName} (all samples)`, mode.baseline, mode.upgraded);
    printComparison(
      `${mode.modeName} (ambiguous subset: prior top-gap <= ${AMBIGUITY_GAP_THRESHOLD})`,
      mode.baselineAmbiguous,
      mode.upgradedAmbiguous
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    maxProbes: MAX_PROBES,
    probesEvaluated: selected.length,
    ambiguityGapThreshold: AMBIGUITY_GAP_THRESHOLD,
    modes: modeResults,
  };

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const reportPath = path.join(TMP_DIR, 'pls-arbiter-ab-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nSaved full report to ${reportPath}`);
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});

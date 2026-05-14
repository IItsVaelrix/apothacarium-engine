import { HHM_LOGIC_ORDER, HHM_STAGE_WEIGHTS } from './shared/models/harkov.model.js';
import {
  arbitrateGraphCandidates,
  rankGraphCandidates as rankTokenGraphCandidates,
} from './token-graph/judiciary.js';
import { clamp01 } from './token-graph/types.js';

/**
 * CODEx Judiciary (Democracy System)
 * Orchestrates multiple analysis layers to reach a consensus choice.
 * Factory-based: call createJudiciaryEngine(config) to get an isolated instance.
 */
const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'than',
  'i', 'me', 'my', 'mine', 'you', 'your', 'yours', 'we', 'our', 'ours',
  'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them', 'their', 'theirs',
  'it', 'its', 'this', 'that', 'these', 'those',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'have', 'has', 'had', 'done',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'as',
  'not', 'no', 'so', 'too', 'very', 'just', 'can', 'could', 'would', 'should',
  'will', 'shall', 'might', 'may', 'must',
]);

const TIE_BREAK_DELTA = 0.05;
const MAX_LEGACY_TOTAL = 1.35;

const DEFAULT_LAYERS = {
  PHONEME: { weight: 0.40, name: 'Phoneme Engine' },
  SPELLCHECK: { weight: 0.25, name: 'Spellchecker' },
  PREDICTOR: { weight: 0.20, name: 'Predictor' },
  SYNTAX: { weight: 0.15, name: 'Syntax Analyzer' },
};

const DEFAULT_CONSENSUS_THRESHOLD = 0.65;

function normalizeHhmStageWeights(stageWeights) {
  if (!stageWeights || typeof stageWeights !== 'object') {
    return { ...HHM_STAGE_WEIGHTS };
  }

  const merged = { ...HHM_STAGE_WEIGHTS };
  let total = 0;
  HHM_LOGIC_ORDER.forEach((stage) => {
    const raw = Number(stageWeights?.[stage]);
    if (Number.isFinite(raw) && raw > 0) {
      merged[stage] = raw;
    }
    total += merged[stage];
  });

  if (total <= 0) {
    return { ...HHM_STAGE_WEIGHTS };
  }

  const normalized = {};
  HHM_LOGIC_ORDER.forEach((stage) => {
    normalized[stage] = merged[stage] / total;
  });
  return normalized;
}

function getStageSignal(hhm, stage) {
  const signalRaw = Number(hhm?.stageScores?.[stage]?.signal);
  if (!Number.isFinite(signalRaw)) return 1;
  return Math.max(0.05, Math.min(1.6, signalRaw));
}

function getOrderBonus(logicOrder, stage) {
  const index = logicOrder.indexOf(stage);
  if (index < 0) return 1;
  return Math.max(0.9, 1.08 - (index * 0.04));
}

function normalizeGraphCandidateScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clamp01(fallback);
  return clamp01(numeric);
}

export class JudiciaryEngine {
  constructor(config = {}) {
    this.layers = { ...DEFAULT_LAYERS, ...(config.layers || {}) };
    this.CONSENSUS_THRESHOLD = config.consensusThreshold || DEFAULT_CONSENSUS_THRESHOLD;
  }

  /**
   * Resolves a choice among conflicting suggestions.
   * @param {Array<{word: string, layer: string, confidence: number, isRhyme?: boolean, reason?: string, type?: string, category?: string, strategy?: string, source?: string}>} candidates
   * @param {{role?: string, lineRole?: string, stressRole?: string, rhymePolicy?: string, hhm?: object} | null} [syntaxContext=null]
   * @returns {{word: string, confidence: number, consensus: boolean, breakdown: object} | null}
   */
  vote(candidates, syntaxContext = null) {
    if (this.looksLikeGraphCandidateList(candidates)) {
      return this.voteGraph(candidates, syntaxContext);
    }

    const scores = this.calculateAllScores(candidates, syntaxContext);
    if (scores.size === 0) return null;

    const graphCandidates = this.adaptLegacyScoresToGraphCandidates(scores);
    const winner = arbitrateGraphCandidates(graphCandidates, { tieDelta: TIE_BREAK_DELTA });
    if (!winner) return null;

    const scoreData = scores.get(winner.token);
    if (!scoreData) return null;

    return this.formatResult(winner.token, scoreData.total, scoreData.breakdown);
  }

  voteGraph(candidates, _syntaxContext = null) {
    const ranked = this.rankGraphCandidates(candidates);
    const winner = ranked[0];
    if (!winner) return null;

    const breakdown = {
      [winner.token]: Array.isArray(winner.trace)
        ? winner.trace.map((trace) => ({
          layer: trace.heuristic,
          score: trace.contribution,
          syntaxModifier: 1,
        }))
        : [],
    };

    return {
      word: winner.token,
      confidence: normalizeGraphCandidateScore(winner.totalScore),
      consensus: normalizeGraphCandidateScore(winner.totalScore) >= this.CONSENSUS_THRESHOLD,
      breakdown,
    };
  }

  /**
   * Scores all candidates without picking a single winner.
   * Useful for PLS scorer integration.
   */
  calculateAllScores(candidates, syntaxContext = null) {
    if (!Array.isArray(candidates) || candidates.length === 0) return new Map();

    if (this.looksLikeGraphCandidateList(candidates)) {
      return this.calculateGraphScores(candidates);
    }

    const seedCandidates = candidates.filter((candidate) =>
      candidate &&
      typeof candidate.word === 'string' &&
      typeof candidate.layer === 'string' &&
      Number.isFinite(candidate.confidence)
    );
    if (seedCandidates.length === 0) return new Map();

    const syntaxCandidates = this.buildSyntaxCandidates(seedCandidates, syntaxContext);
    const evaluatedCandidates = seedCandidates.concat(syntaxCandidates);

    const scores = new Map(); // word -> { total, breakdown: { layer, score }[] }

    evaluatedCandidates.forEach((candidate) => {
      const layerMeta = this.layers[candidate.layer];
      if (!layerMeta) return;

      const syntaxModifier = this.getSyntaxModifier(candidate, syntaxContext);
      const hhmData = this.getHhmModifier(candidate, syntaxContext);
      const weightedScore = candidate.confidence * layerMeta.weight * syntaxModifier * hhmData.modifier;

      if (!scores.has(candidate.word)) {
        scores.set(candidate.word, { total: 0, breakdown: [] });
      }

      const data = scores.get(candidate.word);
      data.total += weightedScore;
      data.breakdown.push({
        layer: candidate.layer,
        score: weightedScore,
        syntaxModifier,
        hhmStage: hhmData.stage,
        hhmModifier: hhmData.modifier,
      });
    });

    return scores;
  }

  calculateGraphScores(graphCandidates = []) {
    const scores = new Map();

    graphCandidates.forEach((candidate) => {
      if (!candidate || typeof candidate.token !== 'string') return;
      scores.set(candidate.token, {
        total: normalizeGraphCandidateScore(candidate.totalScore),
        breakdown: Array.isArray(candidate.trace)
          ? candidate.trace.map((trace) => ({
            layer: trace.heuristic,
            score: trace.contribution,
            syntaxModifier: 1,
          }))
          : [],
        candidate,
      });
    });

    return scores;
  }

  rankGraphCandidates(graphCandidates = []) {
    return rankTokenGraphCandidates(graphCandidates, { tieDelta: TIE_BREAK_DELTA });
  }

  getSyntaxModifier(candidate, syntaxContext) {
    if (!syntaxContext) return 1;

    let modifier = 1;
    const isRhymeCandidate = this.isRhymeCandidate(candidate);

    if (isRhymeCandidate && syntaxContext.rhymePolicy === 'suppress') {
      modifier *= 0.3;
    } else if (isRhymeCandidate && syntaxContext.rhymePolicy === 'allow_weak') {
      modifier *= 0.6;
    }

    if (
      isRhymeCandidate &&
      syntaxContext.role === 'content' &&
      syntaxContext.lineRole === 'line_end'
    ) {
      modifier *= 1.25;
    }

    if (syntaxContext.stressRole === 'primary' && candidate.layer === 'PHONEME') {
      modifier *= 1.15;
    }

    if (
      syntaxContext.stressRole === 'unstressed'
      && syntaxContext.role === 'function'
      && candidate.layer !== 'SPELLCHECK'
    ) {
      modifier *= 0.8;
    }

    // In stressed content slots where rhyme is allowed, non-rhyme candidates
    // (spellcheck/predictor surfaces) should yield to phoneme-anchored rhyme
    // candidates so syntax modifiers apply BEFORE phoneme tie-breaking.
    if (
      !isRhymeCandidate
      && syntaxContext.role === 'content'
      && syntaxContext.stressRole === 'primary'
      && syntaxContext.rhymePolicy !== 'suppress'
      && candidate.layer !== 'PHONEME'
    ) {
      modifier *= 0.7;
    }

    return modifier;
  }

  getHhmModifier(candidate, syntaxContext) {
    const fallbackStage = this.layers[candidate?.layer] ? candidate.layer : 'JUDICIARY';
    const hhm = syntaxContext?.hhm && typeof syntaxContext.hhm === 'object'
      ? syntaxContext.hhm
      : null;

    if (!hhm) {
      return {
        stage: fallbackStage,
        modifier: 1,
      };
    }

    const stageWeights = normalizeHhmStageWeights(hhm.stageWeights);
    const logicOrder = Array.isArray(hhm.logicOrder) && hhm.logicOrder.length > 0
      ? hhm.logicOrder
      : HHM_LOGIC_ORDER;
    const tokenWeightRaw = Number(hhm.tokenWeight);
    const tokenWeight = Number.isFinite(tokenWeightRaw)
      ? Math.max(0.05, Math.min(1.5, tokenWeightRaw))
      : 1;
    const stageSignal = getStageSignal(hhm, fallbackStage);
    const orderBonus = getOrderBonus(logicOrder, fallbackStage);
    const stageWeight = Number(stageWeights[fallbackStage]) || 0;
    const defaultStageWeight = Number(HHM_STAGE_WEIGHTS[fallbackStage]) || 0.1;
    const weightRatio = stageWeight > 0 && defaultStageWeight > 0
      ? stageWeight / defaultStageWeight
      : 1;

    const modifier = Math.max(
      0.2,
      Math.min(2.8, tokenWeight * stageSignal * orderBonus * weightRatio),
    );

    return {
      stage: fallbackStage,
      modifier,
      tokenWeight,
      stageSignal,
      orderBonus,
      stageWeight,
    };
  }

  buildSyntaxCandidates(candidates, syntaxContext) {
    if (!syntaxContext) return [];
    if (!(syntaxContext.role === 'content' && syntaxContext.lineRole === 'line_end')) return [];

    const scoreByWord = new Map();
    candidates.forEach((candidate) => {
      const layerMeta = this.layers[candidate.layer];
      if (!layerMeta) return;
      const score = candidate.confidence * layerMeta.weight;
      scoreByWord.set(candidate.word, (scoreByWord.get(candidate.word) || 0) + score);
    });

    const rankedWords = Array.from(scoreByWord.entries()).sort((a, b) => b[1] - a[1]);
    if (rankedWords.length === 0) return [];

    const contentWords = rankedWords.filter(([word]) => this.isLikelyContentWord(word));
    const syntaxCandidates = [];

    const endorsedWord = contentWords[0]?.[0] || rankedWords[0][0];
    syntaxCandidates.push({
      word: endorsedWord,
      layer: 'SYNTAX',
      confidence: 0.9,
      reason: 'syntax_line_end_content_endorsement',
    });

    const leadingWord = rankedWords[0][0];
    if (!this.isLikelyContentWord(leadingWord) && contentWords.length > 0) {
      const demandStrength = syntaxContext.stressRole === 'primary' ? 0.85 : 0.75;
      const leadingSupport = rankedWords[0][1] || 1;

      contentWords.slice(0, 2).forEach(([word, support], index) => {
        if (word === endorsedWord) return;
        const relativeSupport = support / leadingSupport;
        const confidence = Math.max(
          0.35,
          Math.min(0.9, demandStrength * relativeSupport * (index === 0 ? 1 : 0.9))
        );
        syntaxCandidates.push({
          word,
          layer: 'SYNTAX',
          confidence,
          reason: 'syntax_line_end_content_preference',
        });
      });
    }

    return syntaxCandidates;
  }

  looksLikeGraphCandidateList(candidates) {
    return Array.isArray(candidates)
      && candidates.length > 0
      && typeof candidates[0]?.token === 'string'
      && Number.isFinite(candidates[0]?.totalScore);
  }

  adaptLegacyScoresToGraphCandidates(scores) {
    return Array.from(scores.entries()).map(([word, scoreData]) => {
      const breakdown = Array.isArray(scoreData?.breakdown) ? scoreData.breakdown : [];
      const phonemeScore = breakdown
        .filter((entry) => entry.layer === 'PHONEME')
        .reduce((sum, entry) => sum + (entry.score || 0), 0);
      const syntaxScore = breakdown
        .filter((entry) => entry.layer === 'SYNTAX')
        .reduce((sum, entry) => sum + (entry.score || 0), 0);
      const predictorScore = breakdown
        .filter((entry) => entry.layer === 'PREDICTOR')
        .reduce((sum, entry) => sum + (entry.score || 0), 0);
      const spellcheckScore = breakdown
        .filter((entry) => entry.layer === 'SPELLCHECK')
        .reduce((sum, entry) => sum + (entry.score || 0), 0);
      const syntaxModifierAverage = breakdown.length > 0
        ? breakdown.reduce((sum, entry) => sum + (Number(entry.syntaxModifier) || 1), 0) / breakdown.length
        : 1;

      const totalScore = clamp01((Number(scoreData?.total) || 0) / MAX_LEGACY_TOTAL);
      const legalityScore = clamp01(
        ((syntaxScore / DEFAULT_LAYERS.SYNTAX.weight) * 0.65)
        + (((syntaxModifierAverage - 1) + 1) * 0.2)
        + (this.isLikelyContentWord(word) ? 0.15 : 0.05),
      );
      const semanticScore = clamp01(
        ((predictorScore / DEFAULT_LAYERS.PREDICTOR.weight) * 0.45)
        + ((spellcheckScore / DEFAULT_LAYERS.SPELLCHECK.weight) * 0.4)
        + (this.isLikelyContentWord(word) ? 0.15 : 0.05),
      );
      const phoneticComponent = clamp01(phonemeScore / DEFAULT_LAYERS.PHONEME.weight);

      return {
        token: word,
        totalScore,
        activationScore: totalScore,
        legalityScore,
        semanticScore,
        phoneticScore: phoneticComponent,
        schoolScore: 0,
        noveltyScore: this.isLikelyContentWord(word) ? 0.6 : 0.18,
        connectedness: clamp01(breakdown.length / 4),
        pathCoherence: clamp01(
          breakdown.length > 0
            ? breakdown.reduce((sum, entry) => sum + clamp01((entry.score || 0) / (Number(scoreData?.total) || 1)), 0) / breakdown.length
            : 0,
        ),
        trace: breakdown.map((entry) => ({
          heuristic: `legacy_${String(entry.layer || '').toLowerCase()}`,
          rawScore: clamp01(entry.score || 0),
          weight: 1,
          contribution: clamp01(entry.score || 0),
          explanation: `${entry.layer} contributed ${(Number(entry.score || 0)).toFixed(3)}.`,
        })),
      };
    });
  }

  isRhymeCandidate(candidate) {
    if (candidate?.isRhyme === true) return true;
    if (candidate?.isRhyme === false) return false;

    const hints = [
      candidate?.reason,
      candidate?.type,
      candidate?.category,
      candidate?.strategy,
      candidate?.source,
    ]
      .filter((value) => typeof value === 'string')
      .map((value) => value.toLowerCase());

    if (hints.some((hint) => hint.includes('rhyme') || hint.includes('phonetic'))) {
      return true;
    }

    return candidate?.layer === 'PHONEME';
  }

  isLikelyContentWord(word) {
    const normalized = String(word || '')
      .toLowerCase()
      .replace(/[^a-z'-]/g, '')
      .replace(/^['-]+|['-]+$/g, '');

    if (!normalized) return false;
    if (FUNCTION_WORDS.has(normalized)) return false;
    return normalized.length >= 3;
  }

  formatResult(word, confidence, breakdown) {
    const breakdownObj = {
      [word]: Array.isArray(breakdown) ? breakdown : [],
    };

    return {
      word,
      confidence: Math.min(1, confidence),
      consensus: confidence >= this.CONSENSUS_THRESHOLD,
      breakdown: breakdownObj,
    };
  }
}

export function createJudiciaryEngine(config) {
  return new JudiciaryEngine(config);
}

export const judiciary = createJudiciaryEngine();

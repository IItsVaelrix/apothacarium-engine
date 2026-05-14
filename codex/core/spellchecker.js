import { phoneticMatcher } from './phonetic_matcher.js';

const DEFAULT_ASYNC_FAILURE_THRESHOLD = 3;
const DEFAULT_ASYNC_RETRY_COOLDOWN_MS = 30000;

/**
 * Enhanced Spellchecker with Phonetic Disambiguation and Contextual Scoring
 */
export class Spellchecker {
  constructor() {
    this.dictionary = new Map(); // Map<word, frequency>
    this.phoneticMap = new Map(); // Map<phoneticKey, Set<word>>
    this.bigramMap = new Map(); // Map<prevWord, Map<nextWord, frequency>>
    this.validationCache = new Map(); // Map<word, boolean>
    this.validationInFlight = new Map(); // Map<word, Promise<boolean>>
    this.asyncValidator = null; // (word: string) => Promise<boolean>
    this.asyncSuggestor = null; // (prefix: string, limit: number) => Promise<string[]>
    this.asyncOnOffline = null;
    this.asyncOnOnline = null;
    this.asyncFailureCount = 0;
    this.asyncFailureThreshold = DEFAULT_ASYNC_FAILURE_THRESHOLD;
    this.asyncRetryCooldownMs = DEFAULT_ASYNC_RETRY_COOLDOWN_MS;
    this.asyncDisabledUntil = 0;
    this.asyncOfflineAnnounced = false;
    this.isLoaded = false;
  }

  normalizeWord(word) {
    return String(word || '').trim().toLowerCase();
  }

  remember(word, weight = 1) {
    const normalized = this.normalizeWord(word);
    if (!normalized) return false;

    this.dictionary.set(normalized, (this.dictionary.get(normalized) || 0) + Math.max(1, Number(weight) || 1));

    const key = phoneticMatcher.encode(normalized);
    if (!this.phoneticMap.has(key)) this.phoneticMap.set(key, new Set());
    this.phoneticMap.get(key).add(normalized);
    return true;
  }

  rememberSequence(prevWord, nextWord, weight = 1) {
    const prev = this.normalizeWord(prevWord);
    const next = this.normalizeWord(nextWord);
    if (!prev || !next) return false;

    if (!this.bigramMap.has(prev)) {
      this.bigramMap.set(prev, new Map());
    }
    const nextMap = this.bigramMap.get(prev);
    nextMap.set(next, (nextMap.get(next) || 0) + Math.max(1, Number(weight) || 1));
    return true;
  }

  primeValidWords(words) {
    if (!Array.isArray(words)) return;
    words.forEach((word) => {
      const normalized = this.normalizeWord(word);
      if (!normalized) return;
      this.validationCache.set(normalized, true);
      this.remember(normalized, 2);
    });
  }

  configureAsync({
    validateWord = null,
    suggestWords = null,
    onAsyncOffline = null,
    onAsyncOnline = null,
    failureThreshold = DEFAULT_ASYNC_FAILURE_THRESHOLD,
    retryCooldownMs = DEFAULT_ASYNC_RETRY_COOLDOWN_MS,
  } = {}) {
    this.asyncValidator = typeof validateWord === 'function' ? validateWord : null;
    this.asyncSuggestor = typeof suggestWords === 'function' ? suggestWords : null;
    this.asyncOnOffline = typeof onAsyncOffline === 'function' ? onAsyncOffline : null;
    this.asyncOnOnline = typeof onAsyncOnline === 'function' ? onAsyncOnline : null;
    this.asyncFailureThreshold = Number.isInteger(Number(failureThreshold))
      ? Math.max(1, Number(failureThreshold))
      : DEFAULT_ASYNC_FAILURE_THRESHOLD;
    this.asyncRetryCooldownMs = Number.isFinite(Number(retryCooldownMs))
      ? Math.max(1000, Number(retryCooldownMs))
      : DEFAULT_ASYNC_RETRY_COOLDOWN_MS;
    this.asyncFailureCount = 0;
    this.asyncDisabledUntil = 0;
    this.asyncOfflineAnnounced = false;
  }

  isAsyncPathAvailable() {
    if (this.asyncDisabledUntil <= 0) return true;
    if (Date.now() >= this.asyncDisabledUntil) { // EXEMPT
      this.asyncDisabledUntil = 0;
      return true;
    }
    return false;
  }

  markAsyncSuccess() {
    const recovered = this.asyncFailureCount > 0 || this.asyncDisabledUntil > 0;
    this.asyncFailureCount = 0;
    this.asyncDisabledUntil = 0;

    if (recovered && this.asyncOfflineAnnounced) {
      this.asyncOfflineAnnounced = false;
      try {
        this.asyncOnOnline?.();
      } catch (_error) {
        // Callback failures should not disrupt spellcheck.
      }
    }
  }

  markAsyncFailure(error, source = 'validate') {
    this.asyncFailureCount += 1;

    if (this.asyncFailureCount < this.asyncFailureThreshold) {
      return;
    }

    this.asyncDisabledUntil = Date.now() + this.asyncRetryCooldownMs; // EXEMPT
    this.asyncFailureCount = 0;

    if (!this.asyncOfflineAnnounced) {
      this.asyncOfflineAnnounced = true;
      const message = '[Spellcheck] Dictionary API unreachable — running in offline mode';
      console.warn(`${message} (${source})`, error);
      try {
        this.asyncOnOffline?.({ error, source, message });
      } catch (_callbackError) {
        // Callback failures should not disrupt spellcheck.
      }
    }
  }

  init(words) {
    if (!Array.isArray(words)) return;
    
    words.forEach((w) => {
      const lower = this.normalizeWord(w);
      if (!lower) return;
      this.remember(lower, 1);
    });

    for (let i = 0; i < words.length - 1; i++) {
      this.rememberSequence(words[i], words[i + 1], 1);
    }
    
    this.isLoaded = true;
  }

  check(word) {
    if (!word) return true;
    return this.dictionary.has(this.normalizeWord(word));
  }

  async checkAsync(word) {
    const normalized = this.normalizeWord(word);
    if (!normalized) return true;

    if (this.dictionary.has(normalized)) return true;

    if (this.validationCache.has(normalized)) {
      const cached = Boolean(this.validationCache.get(normalized));
      if (cached) this.remember(normalized);
      return cached;
    }

    if (!this.asyncValidator || !this.isAsyncPathAvailable()) return false;

    if (this.validationInFlight.has(normalized)) {
      return this.validationInFlight.get(normalized);
    }

    const pending = (async () => {
      try {
        const valid = Boolean(await this.asyncValidator(normalized));
        this.markAsyncSuccess();
        this.validationCache.set(normalized, valid);
        if (valid) this.remember(normalized);
        return valid;
      } catch (error) {
        this.markAsyncFailure(error, 'validate');
        return false;
      } finally {
        this.validationInFlight.delete(normalized);
      }
    })();

    this.validationInFlight.set(normalized, pending);
    return pending;
  }

  /**
   * Suggests corrections using a blend of Edit Distance, Phonetics, and Frequency.
   * @param {string} word 
   * @param {string} contextPrevWord - Optional previous word for Bigram context
   */
  suggest(word, limit = 5, contextPrevWord = null) {
    if (!word) return [];
    const target = this.normalizeWord(word);
    if (!target) return [];
    if (this.dictionary.has(target)) return [];

    const maxDistance = this.getMaxEditDistance(target.length);
    const candidateMap = new Map(); // Map<word, { word, distance, phonetic }>

    const upsertCandidate = (candidateWord, details = {}) => {
      const normalizedCandidate = this.normalizeWord(candidateWord);
      if (!normalizedCandidate || normalizedCandidate === target) return;
      const current = candidateMap.get(normalizedCandidate) || {
        word: normalizedCandidate,
        distance: null,
        phonetic: false,
      };

      if (Number.isInteger(details.distance)) {
        current.distance = current.distance === null
          ? details.distance
          : Math.min(current.distance, details.distance);
      }
      if (details.phonetic) current.phonetic = true;

      candidateMap.set(normalizedCandidate, current);
    };

    // 1. Phonetic neighborhood
    const phoneticKey = phoneticMatcher.encode(target);
    const soundAlikes = this.phoneticMap.get(phoneticKey) || [];
    
    soundAlikes.forEach((candidateWord) => {
      upsertCandidate(candidateWord, { phonetic: true });
    });

    // 2. Edit-distance neighborhood
    for (const [entry, freq] of this.dictionary.entries()) {
      if (freq <= 0) continue;
      if (Math.abs(entry.length - target.length) > (maxDistance + 1)) continue;

      const distance = this.levenshtein(target, entry);
      if (distance <= maxDistance) {
        upsertCandidate(entry, { distance });
      }
    }

    // 3. Rank candidates with composite scoring
    return this.rankCandidates(target, [...candidateMap.values()], limit, contextPrevWord)
      .map((entry) => entry.word);
  }

  getMaxEditDistance(wordLength) {
    if (wordLength <= 4) return 1;
    if (wordLength <= 8) return 2;
    return 3;
  }

  commonPrefixLength(a, b) {
    const limit = Math.min(a.length, b.length);
    let count = 0;
    while (count < limit && a[count] === b[count]) count += 1;
    return count;
  }

  normalizedBigramOverlap(a, b) {
    if (a.length < 2 || b.length < 2) return 0;

    const gramsA = new Set();
    for (let i = 0; i < a.length - 1; i++) {
      gramsA.add(a.slice(i, i + 2));
    }

    const gramsB = new Set();
    for (let i = 0; i < b.length - 1; i++) {
      gramsB.add(b.slice(i, i + 2));
    }

    let intersection = 0;
    gramsA.forEach((gram) => {
      if (gramsB.has(gram)) intersection += 1;
    });

    const union = gramsA.size + gramsB.size - intersection;
    if (union <= 0) return 0;
    return intersection / union;
  }

  isTranspositionAway(a, b) {
    if (a.length !== b.length || a.length < 2) return false;

    let firstMismatch = -1;
    let secondMismatch = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (firstMismatch < 0) {
        firstMismatch = i;
      } else if (secondMismatch < 0) {
        secondMismatch = i;
      } else {
        return false;
      }
    }

    if (firstMismatch < 0 || secondMismatch < 0 || secondMismatch !== firstMismatch + 1) {
      return false;
    }

    return a[firstMismatch] === b[secondMismatch] && a[secondMismatch] === b[firstMismatch];
  }

  getContextScore(prevWord, candidateWord) {
    const prev = this.normalizeWord(prevWord);
    const candidate = this.normalizeWord(candidateWord);
    if (!prev || !candidate) return 0;

    const nextMap = this.bigramMap.get(prev);
    if (!nextMap || nextMap.size === 0) return 0;

    const raw = Number(nextMap.get(candidate) || 0);
    if (raw <= 0) return 0;

    let max = 0;
    for (const value of nextMap.values()) {
      if (value > max) max = value;
    }
    if (max <= 0) return 0;
    return raw / max;
  }

  rankCandidates(target, rawCandidates, limit, contextPrevWord = null) {
    if (!Array.isArray(rawCandidates) || rawCandidates.length === 0) return [];

    let maxFrequency = 0;
    for (const value of this.dictionary.values()) {
      if (value > maxFrequency) maxFrequency = value;
    }
    const safeMaxFrequency = Math.max(maxFrequency, 1);
    const maxDistance = this.getMaxEditDistance(target.length);

    const ranked = rawCandidates
      .map((candidate) => {
        const candidateWord = this.normalizeWord(candidate?.word);
        if (!candidateWord || candidateWord === target) return null;

        const distance = Number.isInteger(candidate?.distance)
          ? candidate.distance
          : this.levenshtein(target, candidateWord);
        const phoneticMatch = Boolean(candidate?.phonetic || phoneticMatcher.isSoundAlike(target, candidateWord));
        const remoteMatch = Boolean(candidate?.remote);

        // Remote suggestions from the authority dictionary bypass distance filter
        const allowedDistance = remoteMatch ? (maxDistance + 4) : (phoneticMatch ? (maxDistance + 1) : maxDistance);
        if (distance > allowedDistance) return null;

        const baseFrequency = Number(this.dictionary.get(candidateWord) || 0);
        const frequencyScore = Math.log10(baseFrequency + 1.1) / Math.log10(safeMaxFrequency + 1.1);
        const prefixScore = this.commonPrefixLength(target, candidateWord) / Math.max(1, target.length);
        const overlapScore = this.normalizedBigramOverlap(target, candidateWord);
        const distanceScore = Math.max(0, 1 - (distance / (maxDistance + 0.5)));
        const transpositionBonus = this.isTranspositionAway(target, candidateWord) ? 0.12 : 0;
        const phoneticScore = phoneticMatch ? 1 : 0;
        const contextScore = this.getContextScore(contextPrevWord, candidateWord);

        const score = (
          (distanceScore * 0.40) +
          (prefixScore * 0.16) +
          (overlapScore * 0.11) +
          (phoneticScore * 0.15) +
          (frequencyScore * 0.10) +
          (contextScore * 0.08) +
          transpositionBonus
        );

        return {
          word: candidateWord,
          score,
          distance,
          contextScore,
          frequency: baseFrequency,
          phonetic: Boolean(phoneticScore),
        };
      })
      .filter(Boolean);

    ranked.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (b.contextScore !== a.contextScore) return b.contextScore - a.contextScore;
      if (b.frequency !== a.frequency) return b.frequency - a.frequency;
      return a.word.localeCompare(b.word);
    });

    return ranked.slice(0, limit);
  }

  buildSuggestQueries(word) {
    const normalized = this.normalizeWord(word);
    if (!normalized) return [];

    const seeds = [
      normalized,
      normalized.slice(0, Math.max(2, Math.min(4, normalized.length - 1))),
      normalized.slice(0, 3),
      normalized.slice(0, 2),
    ];

    const out = [];
    const seen = new Set();
    seeds.forEach((seed) => {
      if (!seed || seed.length < 2 || seen.has(seed)) return;
      seen.add(seed);
      out.push(seed);
    });
    return out;
  }

  async fetchRemoteSuggestions(word, limit) {
    if (!this.asyncSuggestor || !this.isAsyncPathAvailable()) return [];
    const queries = this.buildSuggestQueries(word);
    if (queries.length === 0) return [];

    const merged = [];
    const seen = new Set();
    for (const query of queries) {
      try {
        const remote = await this.asyncSuggestor(query, limit);
        this.markAsyncSuccess();
        (Array.isArray(remote) ? remote : []).forEach((candidate) => {
          const normalizedCandidate = this.normalizeWord(candidate);
          if (!normalizedCandidate || seen.has(normalizedCandidate)) return;
          seen.add(normalizedCandidate);
          merged.push(normalizedCandidate);
        });
      } catch (error) {
        this.markAsyncFailure(error, 'suggest');
        if (!this.isAsyncPathAvailable()) break;
      }
    }
    return merged;
  }

  async suggestAsync(word, limit = 5, contextPrevWord = null) {
    const normalized = this.normalizeWord(word);
    if (!normalized) return [];
    if (this.dictionary.has(normalized)) return [];

    const queryLimit = Math.max(limit * 4, 20);
    const localRanked = this.rankCandidates(
      normalized,
      this.suggest(normalized, queryLimit, contextPrevWord).map((candidateWord) => ({ word: candidateWord })),
      queryLimit,
      contextPrevWord
    );

    const candidateMap = new Map();
    localRanked.forEach((entry) => {
      candidateMap.set(entry.word, {
        word: entry.word,
        distance: entry.distance,
        phonetic: entry.phonetic,
      });
    });

    const remoteCandidates = await this.fetchRemoteSuggestions(normalized, queryLimit);
    remoteCandidates.forEach((candidateWord) => {
      this.validationCache.set(candidateWord, true);
      this.remember(candidateWord, 2);
      if (!candidateMap.has(candidateWord)) {
        candidateMap.set(candidateWord, { word: candidateWord, remote: true });
      } else {
        candidateMap.get(candidateWord).remote = true;
      }
    });

    const reranked = this.rankCandidates(
      normalized,
      [...candidateMap.values()],
      queryLimit,
      contextPrevWord
    );

    return reranked.slice(0, limit).map((entry) => entry.word);
  }

  levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
        // Transposition (Damerau-Levenshtein)
        if (i > 1 && j > 1 && b.charAt(i - 1) === a.charAt(j - 2) && b.charAt(i - 2) === a.charAt(j - 1)) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
    }
    return matrix[b.length][a.length];
  }
}

export const spellchecker = new Spellchecker();


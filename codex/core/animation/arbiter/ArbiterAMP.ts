import { HHM_STAGE_WEIGHTS } from '../../shared/models/harkov.model.js';
import { hashString } from '../../pixelbrain/shared.js';
import { ARBITER_FINGERPRINTS, getFingerprintChecksum } from './ArbiterChecksums.ts';
import { PhonemeEngine } from '../../phonology/phoneme.engine.js';
import { PhoneticSimilarity } from '../../phonology/phoneticSimilarity.js';

/**
 * ArbiterAMP — Ritual Prediction Brain
 * 
 * Authoritative logic for anticipating the next linguistic "move".
 * Resolves the "Tournament of Candidates" using HMM transitions and Oracle resonance.
 */

export interface RitualPredictionCandidate {
  word: string;
  score: number;
  signals: {
    phonetic: number;
    semantic: number;
    syntax: number;
    hhm: number;
  };
  reason: string;
}

export interface PredictionPixelBrainProjection {
  orbSize: number;
  glowIntensity: number;
  pulseFrequency: number;
  resonanceColor: string;
}

export interface RitualPredictionArtifact {
  version: 'PB-PRED-v1';
  timestamp: number;
  sequence_id: number;
  winner: RitualPredictionCandidate | null;
  candidates: RitualPredictionCandidate[];
  projection: PredictionPixelBrainProjection;
  bytecode: string;
  diagnostics: string[];
}

export interface ArbiterOptions {
  maxFanout: number;
  schoolBias: number;
  minConfidence: number;
}

const DEFAULT_OPTIONS: ArbiterOptions = {
  maxFanout: 5,
  schoolBias: 0.25,
  minConfidence: 0.3
};

export class ArbiterAMP {
  private options: ArbiterOptions;

  constructor(options: Partial<ArbiterOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process a prediction request and generate the authoritative artifact.
   */
  async arbitrate(
    prefix: string,
    context: any, // VerseIR snapshot
    oraclePayload: any | null,
    sequence_id: number
  ): Promise<RitualPredictionArtifact> {
    const diagnostics: string[] = [];
    const startTime = Date.now(); // EXEMPT

    await PhonemeEngine.init();

    // 1. Candidate Extraction (From context/trie/spellchecker)
    let rawCandidates = context?.candidates || [];
    const prevWord = context?.prevToken?.normalized?.toLowerCase();
    
    // V12 SPELLCHECK HARDENING: If we have a prefix but no strong candidates, 
    // perform a phonetic search across the high-resonance lexicon.
    if (prefix && prefix.length > 2 && rawCandidates.length === 0) {
      const phoneticMatches = this.findPhoneticMatches(prefix, prevWord);
      rawCandidates = [...rawCandidates, ...phoneticMatches];
      diagnostics.push(`Phonetic recovery found ${phoneticMatches.length} matches for "${prefix}".`);
    }

    diagnostics.push(`Ingested ${rawCandidates.length} potential candidates.`);

    // 2. HMM Traversal & Scoring
    const scoredCandidates = rawCandidates.map((c: any) => {
      return this.scoreCandidate(c, context, oraclePayload);
    });

    // 3. Sorting & Winning (The Judiciary Tournament)
    const sorted = scoredCandidates
      .filter((c: RitualPredictionCandidate) => c.score >= this.options.minConfidence)
      .sort((a: RitualPredictionCandidate, b: RitualPredictionCandidate) => b.score - a.score)
      .slice(0, this.options.maxFanout);

    const winner = sorted[0] || null;

    // 4. PixelBrain Projection (Visual Meta)
    const projection = this.deriveProjection(winner, context.currentSchool);

    // 5. Bytecode Synthesis
    const failureReason = !winner ? (scoredCandidates[0]?.signals.phonetic < 0.2 ? 'NUCLEUS_MISMATCH' : 'PHONEME_VOID') : undefined;
    
    const artifact: RitualPredictionArtifact = {
      version: 'PB-PRED-v1',
      timestamp: startTime,
      sequence_id,
      winner,
      candidates: sorted,
      projection,
      bytecode: this.encodeBytecode(winner, sorted, sequence_id, failureReason),
      diagnostics: [
        ...diagnostics,
        `Path coherence resolved in ${Date.now() - startTime}ms`, // EXEMPT
        winner ? `Winner: ${winner.word} (${winner.score.toFixed(3)})` : 'No valid transition found.'
      ]
    };

    return Object.freeze(artifact);
  }

  private getGraphemeSimilarity(s1: string, s2: string): number {
    const n = s1.length;
    const m = s2.length;
    if (n === 0 || m === 0) return 0;
    
    const matrix = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = 0; i <= n; i++) matrix[i][0] = i;
    for (let j = 0; j <= m; j++) matrix[0][j] = j;
    
    const str1 = s1.toLowerCase();
    const str2 = s2.toLowerCase();

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
      }
    }
    
    const dist = matrix[n][m];
    const maxLen = Math.max(n, m);
    return 1 - (dist / maxLen);
  }

  private findPhoneticMatches(prefix: string, prevWord?: string): any[] {
    const normalizedPrefix = prefix.toLowerCase();
    const prefixPhonemes = PhonemeEngine.analyzeWord(normalizedPrefix).phonemes;
    const candidates: any[] = [];
    
    const corpusData = (PhonemeEngine as any).CORPUS_DATA;
    const corpusLexicon = Array.from(corpusData?.rankMap.keys() || []).slice(0, 15000);
    const dictLexicon = (PhonemeEngine as any).getDictionaryWords() || [];
    const fullLexicon = [...new Set([...corpusLexicon, ...dictLexicon])];
    
    const bigramTransitions = prevWord ? corpusData?.bigrams[prevWord] || {} : {};
    
    for (const word of (fullLexicon as string[])) {
      if (Math.abs(word.length - normalizedPrefix.length) > 5) continue;
      
      const wordPhonemes = PhonemeEngine.analyzeWord(word).phonemes;
      const phoneticSim = PhoneticSimilarity.getArraySimilarity(prefixPhonemes, wordPhonemes);
      const graphemeSim = this.getGraphemeSimilarity(normalizedPrefix, word);
      
      // WEIGHTED SCORE: 40% Phonetic, 60% Grapheme (Standard spellcheck balance)
      const similarity = (phoneticSim * 0.4) + (graphemeSim * 0.6);
      
      // SYNTAX SIGNAL: Check ritual sequence
      const transitionCount = bigramTransitions[word.toLowerCase()] || 0;
      const syntaxBoost = transitionCount > 0 ? 0.35 : 0;
      
      if (similarity + syntaxBoost > 0.42) {
        candidates.push({
          word: word.toUpperCase(),
          baseScore: similarity,
          syntaxBoost
        });
      }
    }
    
    return candidates.sort((a, b) => (b.baseScore + b.syntaxBoost) - (a.baseScore + a.syntaxBoost)).slice(0, 5);
  }

  private scoreCandidate(candidate: any, context: any, oraclePayload: any): RitualPredictionCandidate {
    const { word, baseScore = 0.5, syntaxBoost = 0 } = candidate;
    const weights = HHM_STAGE_WEIGHTS;

    const normalizedWord = word.toLowerCase();
    const prevWord = context?.prevToken?.normalized?.toLowerCase();
    
    // SYNTAX SIGNAL: Use corpus bigrams for ritual transition probability
    const corpusData = (PhonemeEngine as any).CORPUS_DATA;
    const bigramTransitions = prevWord ? corpusData?.bigrams[prevWord] || {} : {};
    const transitionCount = bigramTransitions[normalizedWord] || 0;
    const syntaxScore = transitionCount > 0 ? 0.9 : (context.lastRole === 'function' ? 0.6 : 0.4);
    
    // PHONETIC SIGNAL: Enforce phonetic distance as the primary gate for spellchecked words
    const targetPhonemes = PhonemeEngine.analyzeWord(word)?.phonemes || [];
    const inputPhonemes = context.inputPhonemes || PhonemeEngine.analyzeWord(context.prefix || '')?.phonemes || [];
    const phoneticSimilarity = PhoneticSimilarity.getArraySimilarity(targetPhonemes, inputPhonemes);
    
    const phoneticScore = Math.max(phoneticSimilarity, (context.rhymeMatch && context.rhymeMatch.toLowerCase() === normalizedWord) ? 1.0 : 0.1);
    
    // Oracle Resonance (Mood Biases)
    let semanticScore = baseScore;
    if (oraclePayload?.mood === 'AWE' || oraclePayload?.mood === 'ENLIGHTENED') {
      semanticScore += 0.25;
    }

    // Weighted Synthesis (Law of Coherence)
    // We double-weight the phoneme for this specific tournament
    const hhmScore = (
      (syntaxScore * weights.SYNTAX) +
      (phoneticScore * weights.PHONEME * 2) +
      (semanticScore * weights.PREDICTOR)
    ) / (weights.SYNTAX + (weights.PHONEME * 2) + weights.PREDICTOR);

    // V12 FIX: Enforce authoritative signal dominance
    const finalScore = (hhmScore * 0.90) + (baseScore * 0.05) + (syntaxBoost * 0.05);

    return {
      word,
      score: Math.min(1, finalScore),
      signals: {
        phonetic: phoneticScore,
        semantic: semanticScore,
        syntax: syntaxScore,
        hhm: hhmScore
      },
      reason: this.deriveReason(syntaxScore, phoneticScore, semanticScore)
    };
  }

  private deriveReason(syntax: number, phonetics: number, semantic: number): string {
    if (phonetics > 0.8) return 'Strong phonetic echo detected.';
    if (syntax > 0.7) return 'Follows ritual grammatical flow.';
    if (semantic > 0.6) return 'Aligned with Oracle resonance.';
    return 'General path coherence.';
  }

  private deriveProjection(winner: RitualPredictionCandidate | null, school: string): PredictionPixelBrainProjection {
    if (!winner) {
      return { orbSize: 0, glowIntensity: 0, pulseFrequency: 0, resonanceColor: '#888888' };
    }

    return {
      orbSize: 8 + (winner.score * 12),
      glowIntensity: 0.3 + (winner.score * 0.7),
      pulseFrequency: 1.0 + (winner.score * 2.0),
      resonanceColor: this.getSchoolColor(school)
    };
  }

  private getSchoolColor(school: string): string {
    const colors: Record<string, string> = {
      SONIC: '#67e8f9',
      VOID: '#c084fc',
      PSYCHIC: '#f0d060',
      ALCHEMY: '#4ade80'
    };
    return colors[school] || '#ede8d4';
  }

  private encodeBytecode(winner: RitualPredictionCandidate | null, candidates: RitualPredictionCandidate[], seq: number, failureReason?: string): string {
    if (!winner) {
      const fingerprint = failureReason ? getFingerprintChecksum(failureReason as any) : '0x000';
      return `PB-PRED-v1-FAIL-${seq}-${fingerprint}`;
    }
    
    // Encoded as: VERSION-SEQ-WINNER_HASH-CONFIDENCE-COUNT
    const winnerHash = hashString(winner.word).toString(16).slice(0, 8);
    const confidence = Math.round(winner.score * 100).toString(16).padStart(2, '0');
    const count = candidates.length.toString(16);
    
    return `PB-PRED-v1-${seq}-${winnerHash}-${confidence}-${count}`;
  }
}

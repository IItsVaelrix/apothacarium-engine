/**
 * CODEx Phonetic Hacking Engine
 * Implements principles of psychoacoustics and sound symbolism to measure 
 * the subliminal impact of phonetic choices.
 */

/**
 * Phonetic Hacking Principles:
 * 1. IMPACT (Plosives): P, B, T, D, K, G. 
 *    Effect: Aggression, decisiveness, sharp transitions.
 * 2. FLOW (Liquids/Nasals): L, R, M, N, NG.
 *    Effect: Fluidity, hypnosis, continuity, memory retention.
 * 3. FRICTION (Fricatives): F, V, S, Z, SH, ZH, TH, DH, HH.
 *    Effect: Tension, speed, breathiness, unease.
 * 4. RESONANCE (Vowels): 
 *    - Close/Tense (IY, UW): Intimacy, precision, piercing.
 *    - Open/Lax (AA, AO, AE): Grandeur, depth, expansiveness.
 */

const PRINCIPLES = {
  IMPACT: new Set(['P', 'B', 'T', 'D', 'K', 'G']),
  FLOW: new Set(['L', 'R', 'M', 'N', 'NG', 'W', 'Y']),
  FRICTION: new Set(['F', 'V', 'S', 'Z', 'SH', 'ZH', 'TH', 'DH', 'HH', 'CH', 'JH']),
};

const VOWEL_RESONANCE = {
  // Intimate/Piercing/Tense (Close)
  'IY': 'CLOSE', 'UW': 'CLOSE', 'IH': 'CLOSE', 'EY': 'CLOSE', 'OW': 'CLOSE',
  // Expansive/Deep/Lax (Open)
  'AA': 'OPEN', 'AO': 'OPEN', 'AE': 'OPEN', 'AW': 'OPEN', 'AY': 'OPEN', 'OY': 'OPEN',
  // Neutral/Balanced/Central
  'AH': 'NEUTRAL', 'EH': 'NEUTRAL', 'UH': 'NEUTRAL', 'ER': 'NEUTRAL', 'UR': 'NEUTRAL', 'AX': 'NEUTRAL'
};

export const PhoneticHackingEngine = {
  /**
   * Analyzes a sequence of phonemes and returns hacking principle intensities.
   * @param {string[]} phonemes 
   */
  analyzePhonemes(phonemes) {
    const stats = {
      IMPACT: 0,
      FLOW: 0,
      FRICTION: 0,
      RESONANCE_OPEN: 0,
      RESONANCE_CLOSE: 0,
      totalCount: 0
    };

    if (!phonemes || phonemes.length === 0) return stats;

    phonemes.forEach(p => {
      const base = p.replace(/[0-9]/g, '');
      stats.totalCount++;

      if (PRINCIPLES.IMPACT.has(base)) stats.IMPACT++;
      else if (PRINCIPLES.FLOW.has(base)) stats.FLOW++;
      else if (PRINCIPLES.FRICTION.has(base)) stats.FRICTION++;
      
      const resonance = VOWEL_RESONANCE[base];
      if (resonance === 'OPEN') stats.RESONANCE_OPEN++;
      else if (resonance === 'CLOSE') stats.RESONANCE_CLOSE++;
    });

    return stats;
  },

  /**
   * Computes the dominant hacking principle for a set of words.
   * @param {Object[]} words - Array of analyzed word objects.
   */
  analyzeText(words) {
    const aggregate = {
      IMPACT: 0,
      FLOW: 0,
      FRICTION: 0,
      RESONANCE_OPEN: 0,
      RESONANCE_CLOSE: 0,
      totalPhonemes: 0
    };

    words.forEach(word => {
      const phonetics = word?.phonetics || word?.analysis;
      if (phonetics?.phonemes) {
        const wordStats = this.analyzePhonemes(phonetics.phonemes);
        aggregate.IMPACT += wordStats.IMPACT;
        aggregate.FLOW += wordStats.FLOW;
        aggregate.FRICTION += wordStats.FRICTION;
        aggregate.RESONANCE_OPEN += wordStats.RESONANCE_OPEN;
        aggregate.RESONANCE_CLOSE += wordStats.RESONANCE_CLOSE;
        aggregate.totalPhonemes += wordStats.totalCount;
      }
    });

    if (aggregate.totalPhonemes === 0) return null;

    const intensities = {
      impact: aggregate.IMPACT / aggregate.totalPhonemes,
      flow: aggregate.FLOW / aggregate.totalPhonemes,
      friction: aggregate.FRICTION / aggregate.totalPhonemes,
      resonance: (aggregate.RESONANCE_OPEN - aggregate.RESONANCE_CLOSE) / aggregate.totalPhonemes
    };

    // Determine dominant principle
    const entries = [
      { id: 'IMPACT', val: intensities.impact, label: 'Crushing Impact', color: 'var(--school-will, #FF8A00)' },
      { id: 'FLOW', val: intensities.flow, label: 'Lyrical Flow', color: 'var(--school-psychic, #00E5FF)' },
      { id: 'FRICTION', val: intensities.friction, label: 'Static Friction', color: 'var(--school-void, #a1a1aa)' }
    ];

    entries.sort((a, b) => b.val - a.val);
    const dominant = entries[0];

    return {
      intensities,
      dominant,
      resonanceType: intensities.resonance > 0.05 ? 'EXPANSIVE' : (intensities.resonance < -0.05 ? 'INTIMATE' : 'BALANCED')
    };
  }
};

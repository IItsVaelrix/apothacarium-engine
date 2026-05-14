/**
 * CODEx Literary Classifier
 * Distinguishes between major literary/music styles to tune heuristics.
 */

export const GENRES = {
  RAP: "Rap",
  POETRY: "Poetry",
  SONG: "Song",
  PROSE: "Prose",
  POP: "Pop",
  EMO: "Emo",
  ROCK: "Rock",
  PUNK: "Punk",
  FOLK: "Folk",
  SINGER_SONGWRITER: "Singer/Songwriter",
  METAL: "Metal",
  LYRIC: "Lyric",
};

const MIN_END_RHYME_SAMPLE_FOR_MULTI = 6;
const MIN_LINE_SAMPLE_FOR_CADENCE = 4;
const FIRST_PERSON_WORDS = new Set([
  "i", "me", "my", "mine", "myself",
  "we", "us", "our", "ours", "ourselves",
]);
const DARK_WORDS = new Set([
  "alone", "anger", "ash", "blood", "broke", "broken", "cold", "cut", "cuts", "dark",
  "dead", "death", "despair", "empty", "fear", "grief", "hate", "heartbreak", "hurt",
  "knife", "lonely", "loss", "misery", "night", "pain", "regret", "sad", "scar", "scream",
  "shadows", "sorrow", "tears", "void", "wound", "wreck",
]);
const POP_WORDS = new Set([
  "baby", "dance", "dream", "feel", "forever", "heart", "kiss", "light", "love", "party",
  "radio", "shine", "smile", "tonight", "touch", "young",
]);
const METAL_WORDS = new Set([
  "blade", "burn", "chaos", "fire", "fury", "hammer", "iron", "rage", "storm", "thunder",
  "war", "wolf", "wrath", "skull", "grave", "venom", "steel",
]);

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeRatio(numerator, denominator) {
  const safeDenominator = safeNumber(denominator, 0);
  if (safeDenominator <= 0) return 0;
  return safeNumber(numerator, 0) / safeDenominator;
}

function inRange(value, min, max) {
  return value >= min && value <= max;
}

function getLexicalSignals(rawText) {
  const words = String(rawText || "").toLowerCase().match(/[a-z']+/g) || [];
  const totalWordCount = words.length;
  if (totalWordCount === 0) {
    return {
      darkRatio: 0,
      firstPersonRatio: 0,
      exclamationCount: 0,
      popRatio: 0,
      metalWordRatio: 0,
    };
  }

  let darkCount = 0;
  let firstPersonCount = 0;
  let popCount = 0;
  let metalWordCount = 0;

  for (const word of words) {
    if (DARK_WORDS.has(word)) darkCount += 1;
    if (FIRST_PERSON_WORDS.has(word)) firstPersonCount += 1;
    if (POP_WORDS.has(word)) popCount += 1;
    if (METAL_WORDS.has(word)) metalWordCount += 1;
  }

  const exclamationCount = (String(rawText || "").match(/!/g) || []).length;
  return {
    darkRatio: darkCount / totalWordCount,
    firstPersonRatio: firstPersonCount / totalWordCount,
    exclamationCount,
    popRatio: popCount / totalWordCount,
    metalWordRatio: metalWordCount / totalWordCount,
  };
}

function getLyricPressure(scores) {
  const lyricalBuckets = [
    GENRES.RAP,
    GENRES.POETRY,
    GENRES.SONG,
    GENRES.POP,
    GENRES.EMO,
    GENRES.ROCK,
    GENRES.PUNK,
    GENRES.FOLK,
    GENRES.SINGER_SONGWRITER,
    GENRES.METAL,
    GENRES.LYRIC,
  ];
  const total = lyricalBuckets.reduce((sum, genre) => sum + (Number(scores[genre]) || 0), 0);
  return total / lyricalBuckets.length;
}

export class LiteraryClassifier {
  /**
   * Classifies a document based on its linguistic and structural signatures.
   * @param {object} analyzedDoc - From analysis.pipeline
   * @param {object} rhymeAnalysis - From deepRhyme.engine
   * @returns {{ genre: string, confidence: number, scores: Record<string, number> }}
   */
  static classify(analyzedDoc, rhymeAnalysis) {
    const stats = analyzedDoc?.stats || {};
    const rhymeStats = rhymeAnalysis?.statistics || {};
    const stressProfile = analyzedDoc?.parsed?.stressProfile || rhymeAnalysis?.stressProfile || { coherence: 0 };
    const rawText = analyzedDoc?.raw || "";

    const scores = {
      [GENRES.RAP]: 0,
      [GENRES.POETRY]: 0,
      [GENRES.SONG]: 0,
      [GENRES.PROSE]: 0,
      [GENRES.POP]: 0,
      [GENRES.EMO]: 0,
      [GENRES.ROCK]: 0,
      [GENRES.PUNK]: 0,
      [GENRES.FOLK]: 0,
      [GENRES.SINGER_SONGWRITER]: 0,
      [GENRES.METAL]: 0,
      [GENRES.LYRIC]: 0,
    };

    const lineCount = safeNumber(stats.lineCount, 0);
    const avgLineLen = safeRatio(stats.wordCount, lineCount);
    const avgSyllablesPerLine = safeRatio(stats.totalSyllables, lineCount);
    const avgSentenceLength = safeNumber(stats.avgSentenceLength, avgLineLen);
    const lexicalDiversity = safeRatio(stats.uniqueWordCount, stats.wordCount);
    const repetitionRatio = lexicalDiversity;

    const internalRhymeRatio = safeRatio(rhymeStats.internalCount, stats.wordCount);
    const endRhymeCount = safeNumber(rhymeStats.endRhymeCount, 0);
    const endRhymeDensity = safeRatio(endRhymeCount, lineCount);
    const multiSyllableRatio = safeRatio(rhymeStats.multiSyllableCount, endRhymeCount);

    const meter = stressProfile;
    const {
      darkRatio,
      firstPersonRatio,
      exclamationCount,
      popRatio,
      metalWordRatio,
    } = getLexicalSignals(rawText);
    const exclamationRatio = safeRatio(exclamationCount, lineCount);
    const longWordRatio = safeNumber(stats.longWordRatio, 0);

    // 1. Rhyme + cadence signals
    if (internalRhymeRatio > 0.14) scores[GENRES.RAP] += 12;
    if (internalRhymeRatio > 0.22) scores[GENRES.RAP] += 8;
    if (endRhymeCount >= MIN_END_RHYME_SAMPLE_FOR_MULTI && multiSyllableRatio > 0.3) {
      scores[GENRES.RAP] += 18;
    }
    if (lineCount >= MIN_LINE_SAMPLE_FOR_CADENCE && avgSyllablesPerLine >= 10.5) {
      scores[GENRES.RAP] += 12;
    }
    if (lineCount >= MIN_LINE_SAMPLE_FOR_CADENCE && avgSyllablesPerLine >= 12.5) {
      scores[GENRES.RAP] += 8;
    }
    if (internalRhymeRatio > 0.14 && avgSyllablesPerLine >= 10.5) {
      scores[GENRES.RAP] += 8;
    }

    // 2. Meter & rhythmic regularity
    if (meter.coherence > 0.82) {
      scores[GENRES.POETRY] += 26;
      scores[GENRES.LYRIC] += 6;
    } else if (meter.coherence > 0.65) {
      scores[GENRES.SONG] += 14;
      scores[GENRES.POP] += 8;
      scores[GENRES.LYRIC] += 6;
    }

    // 3. Repetition and line structure
    if (repetitionRatio < 0.52) {
      scores[GENRES.SONG] += 20;
      scores[GENRES.POP] += 14;
      scores[GENRES.PUNK] += 4;
    }
    if (repetitionRatio < 0.42 && avgSyllablesPerLine <= 9.2) {
      scores[GENRES.POP] += 8;
    }

    // 4. Cadence bands (short-form lyric vs high-density forms)
    if (lineCount >= MIN_LINE_SAMPLE_FOR_CADENCE) {
      if (avgSyllablesPerLine <= 8) {
        scores[GENRES.SONG] += 12;
        scores[GENRES.POP] += 14;
        scores[GENRES.PUNK] += 10;
      } else if (avgSyllablesPerLine >= 8 && avgSyllablesPerLine <= 11) {
        scores[GENRES.ROCK] += 10;
        scores[GENRES.FOLK] += 8;
        scores[GENRES.SINGER_SONGWRITER] += 8;
        scores[GENRES.LYRIC] += 8;
      }

      if (inRange(avgSyllablesPerLine, 7, 9.5) && meter.coherence >= 0.55 && (repetitionRatio < 0.65 || popRatio > 0.03)) {
        scores[GENRES.POP] += 8;
      }
    }

    // 5. Lexical and emotional signals
    if (longWordRatio > 0.15) {
      scores[GENRES.POETRY] += 16;
      scores[GENRES.METAL] += 8;
    }
    if (darkRatio > 0.08) {
      scores[GENRES.EMO] += 18;
      scores[GENRES.METAL] += 10;
    }
    if (firstPersonRatio > 0.08) {
      scores[GENRES.EMO] += 10;
      scores[GENRES.SINGER_SONGWRITER] += 12;
      scores[GENRES.FOLK] += 5;
    }
    if (exclamationRatio > 0.15) {
      scores[GENRES.PUNK] += 10;
      scores[GENRES.ROCK] += 5;
    }

    if (popRatio > 0.035) {
      scores[GENRES.POP] += 10;
      scores[GENRES.SONG] += 6;
    }
    if (metalWordRatio > 0.028) {
      scores[GENRES.METAL] += 12;
      scores[GENRES.ROCK] += 4;
    }
    if (popRatio > metalWordRatio && darkRatio < 0.09 && firstPersonRatio > 0.05) {
      scores[GENRES.POP] += 6;
    }
    if (metalWordRatio > popRatio && darkRatio > 0.06) {
      scores[GENRES.METAL] += 6;
    }

    // 6. Genre-specific structural blends
    if (inRange(endRhymeDensity, 0.18, 0.6)) {
      scores[GENRES.ROCK] += 8;
      scores[GENRES.SONG] += 6;
      scores[GENRES.LYRIC] += 6;
    }
    if (endRhymeDensity > 0.2 && avgSyllablesPerLine < 10) {
      scores[GENRES.EMO] += 8;
      scores[GENRES.POP] += 6;
    }
    if (internalRhymeRatio < 0.08 && lexicalDiversity > 0.5) {
      scores[GENRES.FOLK] += 6;
      scores[GENRES.SINGER_SONGWRITER] += 6;
    }
    if (lineCount >= MIN_LINE_SAMPLE_FOR_CADENCE && avgSyllablesPerLine >= 10 && darkRatio > 0.08) {
      scores[GENRES.METAL] += 10;
    }
    if (
      lineCount >= MIN_LINE_SAMPLE_FOR_CADENCE &&
      avgSyllablesPerLine >= 9.2 &&
      darkRatio > 0.06 &&
      (exclamationRatio > 0.07 || metalWordRatio > 0.025)
    ) {
      scores[GENRES.METAL] += 10;
    }
    if (endRhymeDensity > 0.22 && repetitionRatio < 0.5 && avgSyllablesPerLine <= 9) {
      scores[GENRES.POP] += 8;
    }

    // 7. Prose gating (only when lyric signals are weak)
    const proseCandidate =
      avgLineLen > 12 &&
      avgSentenceLength > 10 &&
      meter.coherence < 0.72 &&
      internalRhymeRatio < 0.1 &&
      endRhymeDensity < 0.2;

    if (proseCandidate) {
      scores[GENRES.PROSE] += 26;
    }
    if (avgLineLen > 16 && avgSentenceLength > 14 && exclamationRatio < 0.08) {
      scores[GENRES.PROSE] += 14;
    }
    if (lineCount <= 2 && avgLineLen > 10) {
      scores[GENRES.PROSE] += 12;
    }

    const lyricPressure = getLyricPressure(scores);
    if (
      lyricPressure >= 14 ||
      endRhymeDensity >= 0.22 ||
      internalRhymeRatio >= 0.12 ||
      meter.coherence >= 0.72
    ) {
      scores[GENRES.PROSE] = Math.max(0, scores[GENRES.PROSE] - 24);
    }

    // Normalize and pick top
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topGenre = sorted[0]?.[0] || GENRES.LYRIC;
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScore > 0 ? scores[topGenre] / totalScore : 0;

    return {
      genre: totalScore > 0 ? topGenre : GENRES.LYRIC,
      confidence,
      scores,
    };
  }
}


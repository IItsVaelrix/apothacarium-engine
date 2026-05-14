/**
 * Heuristic: Phoneme Density
 * Measures phonemic richness using algorithmic parsing signals:
 * - average phoneme density per word,
 * - vowel-family entropy,
 * - stress pattern variety,
 * - multisyllabic concentration.
 *
 * @see ARCH.md section 3 - Fix 1
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

const MAX_VOWEL_FAMILIES = 14;

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function entropyScoreFromCounts(counts, total) {
  const values = Object.values(counts);
  if (values.length === 0 || total <= 0) return 0;

  let entropy = 0;
  for (const count of values) {
    const p = count / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(Math.min(MAX_VOWEL_FAMILIES, total));
  if (maxEntropy <= 0) return 0;
  return clamp01(entropy / maxEntropy);
}

function getWords(doc) {
  return Array.isArray(doc?.allWords) ? doc.allWords : [];
}

function scorePhonemeDensity(doc) {
  const words = getWords(doc);
  if (words.length === 0) {
    return {
      heuristic: 'phoneme_density',
      rawScore: 0,
      weight: 0.20,
      contribution: 0,
      explanation: 'No words found.',
      diagnostics: []
    };
  }

  let analyzedWords = 0;
  let totalPhonemes = 0;
  let multisyllabicCount = 0;
  const vowelFamilyCounts = {};
  const stressPatterns = new Set();
  const highDensityWords = [];
  const diagnostics = [];

  for (const word of words) {
    const phonetics = word?.phonetics;
    if (!phonetics || !Array.isArray(phonetics.phonemes) || phonetics.phonemes.length === 0) {
      continue;
    }

    analyzedWords += 1;

    const phonemeCount = phonetics.phonemes.length;
    totalPhonemes += phonemeCount;

    const vowelFamily = String(phonetics.vowelFamily || '').toUpperCase();
    if (vowelFamily) {
      vowelFamilyCounts[vowelFamily] = (vowelFamilyCounts[vowelFamily] || 0) + 1;
    }

    const syllableCount =
      word?.deepPhonetics?.syllableCount ||
      word?.syllableCount ||
      phonetics.syllableCount ||
      1;
    if (syllableCount >= 3) {
      multisyllabicCount += 1;
    }

    const stressPattern = word?.deepPhonetics?.stressPattern || word?.stressPattern || '';
    if (stressPattern) {
      stressPatterns.add(stressPattern);
    }

    if (phonemeCount >= 8) {
      highDensityWords.push({
        word: word.text,
        start: word.start,
        end: word.end,
        phonemeCount,
        phonemes: phonetics.phonemes,
      });
    }
  }

  if (analyzedWords === 0) {
    return {
      heuristic: 'phoneme_density',
      rawScore: 0,
      weight: 0.20,
      contribution: 0,
      explanation: 'No phoneme data available.',
      diagnostics: []
    };
  }

  const avgPhonemesPerWord = totalPhonemes / analyzedWords;
  const uniqueVowelFamilies = Object.keys(vowelFamilyCounts).length;
  const varietyScore = clamp01(uniqueVowelFamilies / 7);
  const densityScore = clamp01(avgPhonemesPerWord / 7);
  const vowelEntropyScore = entropyScoreFromCounts(vowelFamilyCounts, analyzedWords);
  const stressVarietyScore = clamp01(
    stressPatterns.size / Math.max(2, Math.min(8, analyzedWords))
  );
  const multisyllabicRatio = multisyllabicCount / analyzedWords;

  const rawScore = clamp01(
    densityScore * 0.35 +
    varietyScore * 0.22 +
    vowelEntropyScore * 0.18 +
    stressVarietyScore * 0.10 +
    multisyllabicRatio * 0.15
  );

  highDensityWords
    .sort((a, b) => b.phonemeCount - a.phonemeCount)
    .slice(0, 3)
    .forEach((item) => {
      diagnostics.push({
        start: item.start,
        end: item.end,
        severity: 'info',
        message: `High phoneme density (${item.phonemeCount})`,
        metadata: {
          word: item.word,
          phonemes: item.phonemes,
          phonemeCount: item.phonemeCount,
        },
      });
    });

  if (uniqueVowelFamilies >= 5 && words.length > 0) {
    diagnostics.push({
      start: words[0].start,
      end: words[words.length - 1].end,
      severity: 'success',
      message: 'Strong vowel-family spread',
      metadata: {
        families: Object.keys(vowelFamilyCounts),
      },
    });
  }

  return {
    heuristic: 'phoneme_density',
    rawScore,
    explanation: [
      `${avgPhonemesPerWord.toFixed(1)} phonemes/word`,
      `${uniqueVowelFamilies} vowel families`,
      `entropy ${toPercent(vowelEntropyScore)}`,
      `${toPercent(multisyllabicRatio)} multisyllabic`,
      `stress variety ${toPercent(stressVarietyScore)}`,
    ].join(', ') + ` across ${analyzedWords} analyzed words.`,
    diagnostics
  };
}

export const phonemeDensityHeuristic = {
  name: 'phoneme_density',
  scorer: scorePhonemeDensity,
  weight: 0.20,
};

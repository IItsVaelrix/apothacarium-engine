/**
 * Heuristic: Alliteration Density
 * Scores algorithmic alliteration chains using phonetic onsets and coverage.
 *
 * @see ARCH.md section 3 - Fix 2
 * @param {import('../schemas').AnalyzedDocument} doc - The analyzed document.
 * @returns {import('../schemas').ScoreTrace}
 */

const VOWEL_SOUNDS = new Set([
  'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'EH', 'ER', 'EY', 'IH', 'IY', 'OW', 'OY', 'UH', 'UW',
  'A', 'E', 'I', 'O', 'U'
]);

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than',
  'i', 'me', 'my', 'you', 'your', 'we', 'our', 'he', 'his', 'she', 'her',
  'they', 'their', 'it', 'its', 'to', 'of', 'in', 'on', 'at', 'for', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did'
]);

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function normalizeWord(wordText) {
  return String(wordText || '').toLowerCase().replace(/[^a-z]/g, '');
}

function getInitialSound(word) {
  if (word?.leadingSound) {
    return String(word.leadingSound).replace(/[0-9]/g, '').toUpperCase();
  }

  const phoneme = Array.isArray(word?.phonetics?.phonemes)
    ? word.phonetics.phonemes[0]
    : null;
  if (typeof phoneme === 'string' && phoneme) {
    return phoneme.replace(/[0-9]/g, '').toUpperCase();
  }

  const normalized = word?.normalized || normalizeWord(word?.text);
  return normalized ? normalized[0].toUpperCase() : '';
}

function isConsonantSound(sound) {
  if (!sound) return false;
  const normalized = String(sound).replace(/[0-9]/g, '').toUpperCase();
  if (VOWEL_SOUNDS.has(normalized)) return false;
  return !'AEIOU'.includes(normalized[0]);
}

function isIgnorable(word) {
  if (typeof word?.isStopWord === 'boolean') return word.isStopWord;
  const token = word?.normalized || normalizeWord(word?.text);
  return FUNCTION_WORDS.has(token);
}

function getLineWordGroups(doc) {
  const lines = Array.isArray(doc?.lines) ? doc.lines : [];
  const lineWordGroups = lines
    .map((line) => (Array.isArray(line?.words) ? line.words : []))
    .filter((words) => words.length > 0);

  if (lineWordGroups.length > 0) return lineWordGroups;

  const allWords = Array.isArray(doc?.allWords) ? doc.allWords : [];
  return allWords.length > 0 ? [allWords] : [];
}

function scoreAlliterationDensity(doc) {
  const lineWordGroups = getLineWordGroups(doc);
  if (lineWordGroups.length === 0) {
    return {
      heuristic: 'alliteration_density',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'Too few words for alliteration.',
      diagnostics: []
    };
  }

  let alliterationPairs = 0;
  let chainCount = 0;
  let longestChain = 0;
  let wordsInChains = 0;
  let eligibleWordCount = 0;
  let chainStrength = 0;
  const groups = [];
  const onsetHistogram = {};
  const diagnostics = [];

  for (const lineWords of lineWordGroups) {
    let currentChain = null;

    const finalizeCurrentChain = () => {
      if (!currentChain || currentChain.words.length < 2) return;

      const chainWords = currentChain.words;
      const chainLength = chainWords.length;
      const startWord = chainWords[0];
      const endWord = chainWords[chainWords.length - 1];

      chainCount += 1;
      alliterationPairs += chainLength - 1;
      longestChain = Math.max(longestChain, chainLength);
      wordsInChains += chainLength;
      chainStrength += Math.pow(chainLength - 1, 1.15);
      onsetHistogram[currentChain.sound] = (onsetHistogram[currentChain.sound] || 0) + chainLength;

      groups.push(chainWords.map((word) => word.text).join(' '));

      diagnostics.push({
        start: startWord.start,
        end: endWord.end,
        severity: chainLength >= 3 ? 'success' : 'info',
        message: 'Alliteration chain',
        metadata: {
          onset: currentChain.sound,
          words: chainWords.map((word) => word.text),
          length: chainLength,
        }
      });
    };

    for (let i = 0; i < lineWords.length; i++) {
      const word = lineWords[i];
      if (!word?.text || isIgnorable(word)) continue;

      const sound = getInitialSound(word);
      if (!isConsonantSound(sound)) continue;

      eligibleWordCount += 1;

      if (currentChain && currentChain.sound === sound && (i - currentChain.lastIndex) <= 2) {
        currentChain.words.push(word);
        currentChain.lastIndex = i;
        continue;
      }

      finalizeCurrentChain();
      currentChain = {
        sound,
        words: [word],
        lastIndex: i,
      };
    }

    finalizeCurrentChain();
  }

  if (eligibleWordCount < 2) {
    return {
      heuristic: 'alliteration_density',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'Not enough consonant-onset content words for alliteration.',
      diagnostics: []
    };
  }

  const transitionSlots = Math.max(1, eligibleWordCount - 1);
  const densityScore = clamp01(chainStrength / (transitionSlots * 1.25));
  const coverageScore = clamp01(wordsInChains / eligibleWordCount);
  const rawScore = clamp01(densityScore * 0.70 + coverageScore * 0.30);

  const dominantOnset = Object.entries(onsetHistogram)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const exampleStr = groups.length > 0 ? ` (${groups.slice(0, 2).join('; ')})` : '';

  return {
    heuristic: 'alliteration_density',
    rawScore,
    explanation: [
      `${chainCount} chain${chainCount !== 1 ? 's' : ''}`,
      `${alliterationPairs} alliterative links`,
      `longest chain ${longestChain || 0}`,
      `coverage ${toPercent(coverageScore)}`,
      dominantOnset ? `dominant onset ${dominantOnset}` : null,
    ].filter(Boolean).join(', ') + exampleStr + '.',
    diagnostics
  };
}

export const alliterationDensityHeuristic = {
  name: 'alliteration_density',
  scorer: scoreAlliterationDensity,
  weight: 0.15,
};

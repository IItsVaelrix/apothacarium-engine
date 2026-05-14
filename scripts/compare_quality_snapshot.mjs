import { analyzeText } from "../codex/core/analysis.pipeline.js";
import { phonemeDensityHeuristic } from "../codex/core/heuristics/phoneme_density.js";
import { alliterationDensityHeuristic } from "../codex/core/heuristics/alliteration_density.js";
import { rhymeQualityHeuristic } from "../codex/core/heuristics/rhyme_quality.js";
import { meterRegularityHeuristic } from "../codex/core/heuristics/meter_regularity.js";
import { literaryDeviceRichnessHeuristic } from "../codex/core/heuristics/literary_device_richness.js";
import { vocabularyRichnessHeuristic } from "../codex/core/heuristics/vocabulary_richness.js";
import { PhonemeEngine } from "../codex/core/phonology/phoneme.engine.js";
import { DeepRhymeEngine } from "../codex/core/rhyme-astrology/deepRhyme.engine.js";
import { analyzeLiteraryDevices } from "../src/lib/literaryDevices.detector.js";

function legacyAnalyzeText(text) {
  if (!text) {
    return {
      raw: "",
      lines: [],
      allWords: [],
      stats: { wordCount: 0, lineCount: 0, totalSyllables: 0 }
    };
  }

  const lines = [];
  const allWords = [];
  let charIndex = 0;
  let wordCount = 0;
  let totalSyllables = 0;

  const rawLines = text.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const lineText = rawLines[i];
    const lineStart = charIndex;
    const lineEnd = lineStart + lineText.length;
    const analyzedLine = {
      text: lineText,
      number: i,
      start: lineStart,
      end: lineEnd,
      words: [],
      syllableCount: 0
    };

    const wordRegex = /\b[A-Za-z]+\b/g;
    let match;
    while ((match = wordRegex.exec(lineText)) !== null) {
      const wordText = match[0];
      const wordStart = lineStart + match.index;
      const wordEnd = wordStart + wordText.length;
      const phonetics = PhonemeEngine.analyzeWord(wordText);

      const analyzedWord = {
        text: wordText,
        start: wordStart,
        end: wordEnd,
        phonetics
      };

      analyzedLine.words.push(analyzedWord);
      allWords.push(analyzedWord);

      const syllables = phonetics?.syllableCount || 1;
      analyzedLine.syllableCount += syllables;
      totalSyllables += syllables;
      wordCount += 1;
    }

    lines.push(analyzedLine);
    charIndex = lineEnd + 1;
  }

  return {
    raw: text,
    lines,
    allWords,
    stats: {
      wordCount,
      lineCount: lines.length,
      totalSyllables
    }
  };
}

function oldPhonemeDensity(doc) {
  if (!doc || doc.allWords.length === 0) {
    return { rawScore: 0, explanation: "No words found.", diagnostics: [] };
  }

  let totalPhonemes = 0;
  let analyzedWords = 0;
  const uniqueVowelFamilies = new Set();

  for (const word of doc.allWords) {
    if (word.phonetics) {
      const pCount = word.phonetics.phonemes.length;
      totalPhonemes += pCount;
      uniqueVowelFamilies.add(word.phonetics.vowelFamily);
      analyzedWords += 1;
    }
  }

  if (analyzedWords === 0) {
    return { rawScore: 0, explanation: "No phoneme data available.", diagnostics: [] };
  }

  const avgPhonemesPerWord = totalPhonemes / analyzedWords;
  const varietyScore = Math.min(1, uniqueVowelFamilies.size / 5);
  const densityScore = Math.min(1, avgPhonemesPerWord / 8);
  const rawScore = Math.min(1, (varietyScore * 0.6 + densityScore * 0.4));

  return {
    rawScore,
    explanation: `${uniqueVowelFamilies.size} vowel families, ${avgPhonemesPerWord.toFixed(1)} phonemes/word across ${analyzedWords} words.`,
    diagnostics: []
  };
}

function oldAlliterationDensity(doc) {
  if (!doc || doc.allWords.length < 2) {
    return { rawScore: 0, explanation: "Too few words for alliteration.", diagnostics: [] };
  }

  const VOWELS = new Set("aeiou".split(""));
  const words = doc.allWords;
  let alliterationPairs = 0;
  const groups = [];
  let currentGroupIndices = [0];

  for (let i = 1; i < words.length; i++) {
    const prevInitial = words[i - 1].text[0].toLowerCase();
    const currInitial = words[i].text[0].toLowerCase();

    if (prevInitial === currInitial && !VOWELS.has(prevInitial)) {
      currentGroupIndices.push(i);
    } else {
      if (currentGroupIndices.length >= 2) {
        alliterationPairs += currentGroupIndices.length - 1;
        groups.push(currentGroupIndices.map((idx) => words[idx].text).join(" "));
      }
      currentGroupIndices = [i];
    }
  }
  if (currentGroupIndices.length >= 2) {
    alliterationPairs += currentGroupIndices.length - 1;
    groups.push(currentGroupIndices.map((idx) => words[idx].text).join(" "));
  }

  const rawScore = Math.min(1, alliterationPairs / 3);
  const exampleStr = groups.length > 0 ? ` (${groups.slice(0, 2).join("; ")})` : "";
  return {
    rawScore,
    explanation: `${alliterationPairs} alliterative pair${alliterationPairs !== 1 ? "s" : ""}${exampleStr}.`,
    diagnostics: []
  };
}

const oldRhymeEngine = new DeepRhymeEngine();
function oldRhymeQuality(doc) {
  if (!doc || !doc.raw || !doc.raw.trim()) {
    return { rawScore: 0, explanation: "No text to analyze.", diagnostics: [] };
  }

  const analysis = oldRhymeEngine.analyzeDocument(doc.raw);
  const endRhymes = analysis.endRhymeConnections?.length || 0;
  const internalRhymes = analysis.internalRhymeConnections?.length || 0;
  const lineCount = analysis.lines?.length || 1;

  const rhymeScore = (endRhymes * 1.0 + internalRhymes * 0.5);
  const rawScore = Math.min(1, rhymeScore / (lineCount * 2));

  const parts = [];
  if (endRhymes > 0) parts.push(`${endRhymes} end rhyme${endRhymes !== 1 ? "s" : ""}`);
  if (internalRhymes > 0) parts.push(`${internalRhymes} internal rhyme${internalRhymes !== 1 ? "s" : ""}`);

  return {
    rawScore,
    explanation: parts.length > 0
      ? `${parts.join(", ")} across ${lineCount} line${lineCount !== 1 ? "s" : ""}.`
      : `No rhymes detected in ${lineCount} line${lineCount !== 1 ? "s" : ""}.`,
    diagnostics: []
  };
}

function oldMeterRegularity(doc) {
  if (!doc || doc.lines.length === 0) {
    return { rawScore: 0, explanation: "No lines found.", diagnostics: [] };
  }

  const syllableCounts = doc.lines.map((line) => line.syllableCount);
  if (syllableCounts.length < 2) {
    const count = syllableCounts[0];
    const rawScore = count >= 7 && count <= 12 ? 0.7 : count >= 4 && count <= 16 ? 0.4 : 0.2;
    return {
      rawScore,
      explanation: `Single line with ${count} syllable${count !== 1 ? "s" : ""}.`,
      diagnostics: []
    };
  }

  const mean = syllableCounts.reduce((a, b) => a + b, 0) / syllableCounts.length;
  const variance = syllableCounts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / syllableCounts.length;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 1;
  const rawScore = Math.max(0, Math.min(1, 1 - cv * 2));

  return {
    rawScore,
    explanation: `${doc.lines.length} lines averaging ${mean.toFixed(1)} syllables/line (variation: ${(cv * 100).toFixed(0)}%).`,
    diagnostics: []
  };
}

function oldLiteraryDeviceRichness(doc) {
  if (!doc || !doc.raw || !doc.raw.trim()) {
    return { rawScore: 0, explanation: "No text to analyze.", diagnostics: [] };
  }

  const devices = analyzeLiteraryDevices(doc.raw);
  const deviceCount = devices.length;
  const totalInstances = devices.reduce((sum, device) => sum + device.count, 0);
  const varietyScore = Math.min(1, deviceCount / 3);
  const intensityScore = Math.min(1, totalInstances / 5);
  const rawScore = Math.min(1, varietyScore * 0.6 + intensityScore * 0.4);
  const deviceNames = devices.map((device) => `${device.name} (${device.count})`).join(", ");

  return {
    rawScore,
    explanation: deviceCount > 0
      ? `${deviceCount} device type${deviceCount !== 1 ? "s" : ""}: ${deviceNames}.`
      : "No literary devices detected.",
    diagnostics: []
  };
}

function oldVocabularyRichness(doc) {
  if (!doc || doc.allWords.length === 0) {
    return { rawScore: 0, explanation: "No words found.", diagnostics: [] };
  }

  const words = doc.allWords.map((word) => word.text.toLowerCase()).filter((word) => word.length >= 2);
  if (words.length === 0) {
    return { rawScore: 0, explanation: "No suitable words found.", diagnostics: [] };
  }

  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / words.length;
  const lengthAdjustedThreshold = words.length < 10 ? 0.8 : words.length < 30 ? 0.7 : 0.6;
  const rawScore = Math.min(1, ttr / lengthAdjustedThreshold);

  return {
    rawScore,
    explanation: `${uniqueWords.size} unique words out of ${words.length} total (TTR: ${(ttr * 100).toFixed(0)}%).`,
    diagnostics: []
  };
}

const text = `Don't break the spell-bound oath.
Re-form, re-cast, re-ignite!
Flame folds the night
Flame forms the rite
Name storms through light`;

const legacyDoc = legacyAnalyzeText(text);
const upgradedDoc = await analyzeText(text);

const oldScores = {
  phoneme_density: oldPhonemeDensity(legacyDoc),
  alliteration_density: oldAlliterationDensity(legacyDoc),
  rhyme_quality: oldRhymeQuality(legacyDoc),
  meter_regularity: oldMeterRegularity(legacyDoc),
  literary_device_richness: oldLiteraryDeviceRichness(legacyDoc),
  vocabulary_richness: oldVocabularyRichness(legacyDoc),
};

const newScores = {
  phoneme_density: phonemeDensityHeuristic.scorer(upgradedDoc),
  alliteration_density: alliterationDensityHeuristic.scorer(upgradedDoc),
  rhyme_quality: rhymeQualityHeuristic.scorer(upgradedDoc),
  meter_regularity: meterRegularityHeuristic.scorer(upgradedDoc),
  literary_device_richness: literaryDeviceRichnessHeuristic.scorer(upgradedDoc),
  vocabulary_richness: vocabularyRichnessHeuristic.scorer(upgradedDoc),
};

const snapshot = {
  text,
  tokenization: {
    legacy_word_count: legacyDoc.stats.wordCount,
    upgraded_word_count: upgradedDoc.stats.wordCount,
    legacy_tokens: legacyDoc.allWords.map((word) => word.text),
    upgraded_tokens: upgradedDoc.allWords.map((word) => word.text),
  },
  data_surface: {
    legacy_stats_keys: Object.keys(legacyDoc.stats),
    upgraded_stats_keys: Object.keys(upgradedDoc.stats),
    upgraded_parsed_keys: Object.keys(upgradedDoc.parsed || {}),
    sample_line_legacy: legacyDoc.lines[0],
    sample_line_upgraded: upgradedDoc.lines[0],
    sample_word_legacy: legacyDoc.allWords[0],
    sample_word_upgraded: upgradedDoc.allWords[0],
  },
  heuristics: {
    old: Object.fromEntries(Object.entries(oldScores).map(([key, value]) => [
      key,
      {
        rawScore: Number(value.rawScore.toFixed(4)),
        explanation: value.explanation,
        diagnosticsCount: Array.isArray(value.diagnostics) ? value.diagnostics.length : 0,
      }
    ])),
    new: Object.fromEntries(Object.entries(newScores).map(([key, value]) => [
      key,
      {
        rawScore: Number(value.rawScore.toFixed(4)),
        explanation: value.explanation,
        diagnosticsCount: Array.isArray(value.diagnostics) ? value.diagnostics.length : 0,
      }
    ])),
  }
};

console.log(JSON.stringify(snapshot, null, 2));

import { WORD_REGEX_GLOBAL } from '../constants/regex.js';
import { analyzeAffect } from './affect.js';
import { analyzeProsody } from './prosody.js';
import { analyzeSeverityLexicon, analyzeSpeechActs } from './speechActs.js';
import {
  computeVoiceResonance,
  createSpeakerVoiceProfile,
  getVoiceProfileSnapshot,
  normalizeVoiceProfile,
  updateVoiceProfile,
} from './voiceProfile.js';

const VOWEL_ALIASES = Object.freeze({
  AA: 'A',
  AH: 'A',
  AX: 'A',
  AW: 'A',
  EH: 'AE',
  AY: 'EY',
  OY: 'OW',
  OH: 'OW',
  UH: 'UW',
  OO: 'UW',
  YOO: 'UW',
  YUW: 'UW',
  ER: 'IH',
  UR: 'IH',
  EE: 'IY',
  IN: 'IH',
});

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeToken(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function normalizeVowelFamily(value) {
  const family = String(value || '').trim().toUpperCase();
  if (!family) return '';
  return VOWEL_ALIASES[family] || family;
}

function extractTokens(text, analyzedDoc) {
  const docTokens = Array.isArray(analyzedDoc?.allWords)
    ? analyzedDoc.allWords.map((word) => normalizeToken(word?.normalized || word?.text))
    : [];
  if (docTokens.length > 0) {
    return docTokens.filter(Boolean);
  }
  return String(text || '')
    .match(WORD_REGEX_GLOBAL)
    ?.map((token) => normalizeToken(token))
    .filter(Boolean)
    || [];
}

function buildLineVowelSkeleton(line) {
  const words = Array.isArray(line?.words) ? line.words : [];
  const skeleton = [];

  for (const word of words) {
    const syllables = Array.isArray(word?.deepPhonetics?.syllables)
      ? word.deepPhonetics.syllables
      : [];
    if (syllables.length > 0) {
      const stressed = syllables.filter((syllable) => Number(syllable?.stress) > 0);
      const source = stressed.length > 0 ? stressed : syllables;
      for (const syllable of source) {
        const family = normalizeVowelFamily(syllable?.vowelFamily);
        if (family) skeleton.push(family);
      }
      continue;
    }

    const fallbackFamily = normalizeVowelFamily(word?.phonetics?.vowelFamily);
    if (fallbackFamily) skeleton.push(fallbackFamily);
  }

  return skeleton;
}

function sequenceSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
    return 0;
  }

  const minLength = Math.min(left.length, right.length);
  let suffixMatches = 0;
  for (let index = 1; index <= minLength; index += 1) {
    if (left[left.length - index] === right[right.length - index]) {
      suffixMatches += 1;
    } else {
      break;
    }
  }

  const suffixScore = suffixMatches / minLength;
  const setLeft = new Set(left);
  const setRight = new Set(right);
  const overlapCount = [...setLeft].filter((value) => setRight.has(value)).length;
  const unionCount = new Set([...setLeft, ...setRight]).size || 1;
  const overlapScore = overlapCount / unionCount;
  const terminalScore = left[left.length - 1] && left[left.length - 1] === right[right.length - 1] ? 1 : 0;

  return clamp01((suffixScore * 0.45) + (overlapScore * 0.25) + (terminalScore * 0.3));
}

function alliterationWeave(lines) {
  const weaveScores = [];
  for (const line of lines) {
    const words = Array.isArray(line?.words) ? line.words : [];
    const sounds = words
      .map((word) => String(word?.leadingSound || '').replace(/[0-9]/g, '').toUpperCase())
      .filter(Boolean);
    if (sounds.length <= 1) continue;

    let longestChain = 1;
    let currentChain = 1;
    for (let index = 1; index < sounds.length; index += 1) {
      if (sounds[index] === sounds[index - 1]) {
        currentChain += 1;
        longestChain = Math.max(longestChain, currentChain);
      } else {
        currentChain = 1;
      }
    }
    weaveScores.push(clamp01((longestChain - 1) / Math.max(1, sounds.length - 1)));
  }
  return average(weaveScores);
}

function analyzeHarmony(analyzedDoc) {
  const lines = Array.isArray(analyzedDoc?.lines)
    ? analyzedDoc.lines.filter((line) => String(line?.text || '').trim().length > 0)
    : [];

  if (lines.length === 0) {
    return {
      score: 0,
      adjacentLineScore: 0,
      coupletScore: 0,
      stanzaScore: 0,
      alliterationScore: 0,
      dominantVowel: null,
    };
  }

  const skeletons = lines.map(buildLineVowelSkeleton);
  const weightedFamilies = {};
  for (const skeleton of skeletons) {
    for (const family of skeleton) {
      weightedFamilies[family] = (weightedFamilies[family] || 0) + 1;
    }
  }
  const dominantVowel = Object.entries(weightedFamilies)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || null;

  const adjacentPairs = [];
  for (let index = 1; index < skeletons.length; index += 1) {
    adjacentPairs.push(sequenceSimilarity(skeletons[index - 1], skeletons[index]));
  }

  const coupletPairs = [];
  for (let index = 1; index < skeletons.length; index += 2) {
    coupletPairs.push(sequenceSimilarity(skeletons[index - 1], skeletons[index]));
  }

  const stanzaScores = [];
  for (let start = 0; start < skeletons.length; start += 4) {
    const stanza = skeletons.slice(start, start + 4);
    if (stanza.length <= 1) continue;
    const pairScores = [];
    for (let leftIndex = 0; leftIndex < stanza.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < stanza.length; rightIndex += 1) {
        pairScores.push(sequenceSimilarity(stanza[leftIndex], stanza[rightIndex]));
      }
    }
    stanzaScores.push(average(pairScores));
  }

  const adjacentLineScore = average(adjacentPairs);
  const coupletScore = average(coupletPairs);
  const stanzaScore = average(stanzaScores);
  const alliterationScore = alliterationWeave(lines);
  const score = clamp01(
    (adjacentLineScore * 0.36)
    + (coupletScore * 0.3)
    + (stanzaScore * 0.2)
    + (alliterationScore * 0.14)
  );

  return {
    score: Number(score.toFixed(3)),
    adjacentLineScore: Number(adjacentLineScore.toFixed(3)),
    coupletScore: Number(coupletScore.toFixed(3)),
    stanzaScore: Number(stanzaScore.toFixed(3)),
    alliterationScore: Number(alliterationScore.toFixed(3)),
    dominantVowel,
  };
}

function analyzeIntonation({
  text = '',
  school = '',
  speechAct = null,
  prosody = null,
  severity = null,
} = {}) {
  const normalizedText = String(text || '');
  const questionCount = (normalizedText.match(/\?/g) || []).length;
  const exclamationCount = (normalizedText.match(/!/g) || []).length;
  const commaCount = (normalizedText.match(/[,;:]/g) || []).length;
  const speechTag = String(speechAct?.primary || 'DECLARATION');
  const cadenceTag = String(prosody?.cadence?.dominantTag || 'LEVEL');
  const potency = Number(severity?.potency) || 0;

  let mode = 'DECLARATIVE';
  if (speechTag === 'QUESTION') mode = 'INTERROGATIVE';
  else if (speechTag === 'COMMAND' || speechTag === 'THREAT' || speechTag === 'BANISHMENT') mode = 'IMPERATIVE';
  else if (speechTag === 'INVOCATION') mode = 'INVOCATORY';
  else if (speechTag === 'PLEA') mode = 'SUPPLICATORY';

  const opening = clamp01(0.42 + (commaCount * 0.06) + (mode === 'INVOCATORY' ? 0.12 : 0));
  const crest = clamp01(0.46 + (exclamationCount * 0.16) + (potency * 0.18));
  let closure = 0.5;
  if (cadenceTag === 'RISING' || mode === 'INTERROGATIVE' || mode === 'SUPPLICATORY') closure = 0.76;
  else if (cadenceTag === 'SURGING') closure = 0.68;
  else if (cadenceTag === 'RESOLVED' || cadenceTag === 'FALLING' || mode === 'IMPERATIVE') closure = 0.26;
  else if (cadenceTag === 'WITHHELD' || cadenceTag === 'SUSPENDED') closure = 0.61;

  const schoolVolatilityBonus = String(school || '').toUpperCase() === 'SONIC'
    ? 0.08
    : String(school || '').toUpperCase() === 'VOID'
      ? 0.05
      : 0;
  const volatility = clamp01((Number(prosody?.controlledVariance) || 0) * 0.55 + (exclamationCount * 0.12) + schoolVolatilityBonus);

  return {
    mode,
    primaryTag: speechTag,
    contour: {
      opening: Number(opening.toFixed(3)),
      crest: Number(crest.toFixed(3)),
      closure: Number(closure.toFixed(3)),
      volatility: Number(volatility.toFixed(3)),
    },
    punctuation: {
      questionCount,
      exclamationCount,
      commaCount,
    },
  };
}

export function analyzeSpeaking({
  text = '',
  analyzedDoc = null,
  school = '',
  corpusRanks = null,
  rarityScore = 0,
  speakerId = 'speaker:unknown',
  speakerType = 'PLAYER',
  speakerProfile = null,
} = {}) {
  const tokens = extractTokens(text, analyzedDoc);
  const prosody = analyzeProsody(analyzedDoc);
  const speechAct = analyzeSpeechActs({
    text,
    tokens,
    school,
  });
  const severity = analyzeSeverityLexicon({
    tokens,
    school,
    corpusRanks,
    rarityScore,
  });
  const intonation = analyzeIntonation({
    text,
    school,
    speechAct,
    prosody,
    severity,
  });
  const affect = analyzeAffect({
    tokens,
    school,
    speechAct,
    severity,
  });
  const harmony = analyzeHarmony(analyzedDoc);
  const profile = speakerProfile
    ? normalizeVoiceProfile(speakerProfile, { speakerId, speakerType, school })
    : createSpeakerVoiceProfile({ speakerId, speakerType, school });
  const baseAnalysis = {
    school: String(school || '').toUpperCase() || null,
    speechAct,
    prosody,
    intonation,
    affect,
    harmony,
    severity,
    voice: {
      speakerId: String(speakerId || 'speaker:unknown'),
      speakerType: String(speakerType || 'PLAYER').toUpperCase(),
    },
  };
  const resonance = computeVoiceResonance(profile, baseAnalysis);
  const nextProfile = updateVoiceProfile(profile, baseAnalysis);

  return {
    ...baseAnalysis,
    voice: {
      ...baseAnalysis.voice,
      resonance: Number(resonance.toFixed(3)),
      profile: getVoiceProfileSnapshot(nextProfile),
      nextProfile,
    },
  };
}

export function buildSpeakingTraces(speaking) {
  if (!speaking || typeof speaking !== 'object') {
    return [];
  }

  const primaryAct = String(speaking?.speechAct?.primary || 'DECLARATION');
  const actConfidence = Number(speaking?.speechAct?.confidence) || 0;
  const prosodyScore = clamp01(
    ((Number(speaking?.prosody?.beatAlignment) || 0) * 0.56)
    + ((Number(speaking?.prosody?.controlledVariance) || 0) * 0.24)
    + ((Number(speaking?.prosody?.closureScore) || 0) * 0.2)
  );
  const harmonyScore = clamp01(Number(speaking?.harmony?.score) || 0);
  const voiceResonance = clamp01(Number(speaking?.voice?.resonance) || 0);

  return [
    {
      heuristic: 'speaking_prosody',
      rawScore: Number(prosodyScore.toFixed(3)),
      weight: 1,
      contribution: Number((prosodyScore * 8).toFixed(2)),
      explanation: `${String(speaking?.prosody?.meterName || 'Free Verse')} with ${Math.round((Number(speaking?.prosody?.beatAlignment) || 0) * 100)}% beat alignment and ${String(speaking?.prosody?.cadence?.dominantTag || 'LEVEL').toLowerCase()} cadence.`,
    },
    {
      heuristic: 'speaking_pragmatics',
      rawScore: Number(clamp01((actConfidence * 0.65) + ((Number(speaking?.severity?.potency) || 0) * 0.35)).toFixed(3)),
      weight: 1,
      contribution: Number((((actConfidence * 0.65) + ((Number(speaking?.severity?.potency) || 0) * 0.35)) * 8).toFixed(2)),
      explanation: `${primaryAct.toLowerCase()} delivery carries ${String(speaking?.severity?.label || 'low').toLowerCase()} severity through the weave.`,
    },
    {
      heuristic: 'speaking_harmony',
      rawScore: Number(harmonyScore.toFixed(3)),
      weight: 1,
      contribution: Number((harmonyScore * 8).toFixed(2)),
      explanation: `Harmony holds at ${Math.round(harmonyScore * 100)}% across adjacent lines, couplets, and stanzas.`,
    },
    {
      heuristic: 'voice_resonance',
      rawScore: Number(voiceResonance.toFixed(3)),
      weight: 1,
      contribution: Number((voiceResonance * 8).toFixed(2)),
      explanation: `Speaker voice resonance sits at ${Math.round(voiceResonance * 100)}% against the current delivery.`,
    },
  ];
}

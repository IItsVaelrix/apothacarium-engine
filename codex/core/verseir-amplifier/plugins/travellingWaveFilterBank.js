import {
  clamp01,
  roundTo,
  createAmplifierDiagnostic,
  createAmplifierResult,
} from '../shared.js';

const ID = 'travelling_wave_filter_bank';
const LABEL = 'TrueVision Travelling Wave';
const TIER = 'RARE';
const CLAIMED_WEIGHT = 0.12;
const VERSION = '1.0.0';
const MAX_SALIENT_WINDOWS = 10;

const FAMILY_ALIASES = Object.freeze({
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

const FAMILY_TO_BASE = Object.freeze({
  A: 'AA',
  AE: 'AE',
  AO: 'AO',
  EY: 'EY',
  IH: 'IH',
  IY: 'IY',
  OW: 'OW',
  UW: 'UW',
});

const BASE_HZ = Object.freeze({
  AA: 760,
  AE: 1720,
  AH: 1180,
  AO: 540,
  AW: 1040,
  AY: 2140,
  EH: 1840,
  ER: 1460,
  EY: 2260,
  IH: 1980,
  IY: 2480,
  OW: 980,
  OY: 1880,
  UH: 1240,
  UW: 1380,
});

const CHANNELS = Object.freeze([
  Object.freeze({ id: 'apex_drift', label: 'Apex Drift', centerHz: 280, position: 0.08 }),
  Object.freeze({ id: 'grave_formant', label: 'Grave Formant', centerHz: 520, position: 0.22 }),
  Object.freeze({ id: 'mid_resonance', label: 'Mid Resonance', centerHz: 860, position: 0.4 }),
  Object.freeze({ id: 'bridge_lattice', label: 'Bridge Lattice', centerHz: 1360, position: 0.58 }),
  Object.freeze({ id: 'clarion_edge', label: 'Clarion Edge', centerHz: 2200, position: 0.76 }),
  Object.freeze({ id: 'auric_shimmer', label: 'Auric Shimmer', centerHz: 3200, position: 0.92 }),
]);

const STOPS = new Set(['P', 'B', 'T', 'D', 'K', 'G']);
const AFFRICATES = new Set(['CH', 'JH']);
const FRICATIVES = new Set(['F', 'V', 'TH', 'DH', 'S', 'Z', 'SH', 'ZH']);
const NASALS = new Set(['M', 'N', 'NG']);
const LIQUIDS = new Set(['L', 'R']);
const GLIDES = new Set(['W', 'Y']);
const ASPIRATES = new Set(['HH']);

function normalizeFamily(value) {
  const family = String(value || '').trim().toUpperCase();
  return FAMILY_ALIASES[family] || family;
}

function stripStress(value) {
  return String(value || '').replace(/[0-9]/g, '').trim().toUpperCase();
}

function mean(values) {
  const safe = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  return safe.length > 0 ? safe.reduce((sum, value) => sum + value, 0) / safe.length : 0;
}

function transition(values) {
  const safe = (Array.isArray(values) ? values : []).filter(Number.isFinite);
  if (safe.length <= 1) return 0;
  let delta = 0;
  for (let index = 1; index < safe.length; index += 1) {
    delta += Math.abs(safe[index] - safe[index - 1]);
  }
  return clamp01(delta / (safe.length - 1));
}

function consonantWeight(value) {
  const phoneme = stripStress(value);
  if (!phoneme) return 0.4;
  if (STOPS.has(phoneme)) return 0.86;
  if (AFFRICATES.has(phoneme)) return 0.94;
  if (FRICATIVES.has(phoneme)) return 0.72;
  if (NASALS.has(phoneme)) return 0.46;
  if (LIQUIDS.has(phoneme)) return 0.34;
  if (GLIDES.has(phoneme)) return 0.22;
  if (ASPIRATES.has(phoneme)) return 0.28;
  return 0.4;
}

function scoreCluster(phonemes) {
  return clamp01(mean((Array.isArray(phonemes) ? phonemes : []).map(consonantWeight)));
}

function resolveBaseVowel(syllable, token, index) {
  const explicit = stripStress(syllable?.vowel);
  if (explicit) return explicit;
  const nucleus = stripStress(token?.nucleus?.[index] || token?.nucleus?.[0]);
  if (nucleus) return nucleus;
  return FAMILY_TO_BASE[normalizeFamily(
    syllable?.vowelFamily
      || token?.primaryStressedVowelFamily
      || token?.terminalVowelFamily
      || token?.vowelFamily?.[0]
  )] || 'AA';
}

function resolveVowelHz(baseVowel, family) {
  return BASE_HZ[stripStress(baseVowel)] || BASE_HZ[FAMILY_TO_BASE[normalizeFamily(family)] || 'AA'] || 1200;
}

function normalizeEnergies(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.freeze(total > 0 ? values.map((value) => roundTo(value / total)) : values.map(() => 0));
}

function dominantBand(energies) {
  let index = 0;
  let value = -1;
  energies.forEach((energy, bandIndex) => {
    if (energy > value) {
      value = energy;
      index = bandIndex;
    }
  });
  return {
    band: CHANNELS[index],
    energy: roundTo(Math.max(0, value)),
  };
}

function spectralTilt(energies) {
  return roundTo(clamp01(
    energies.reduce((sum, energy, index) => sum + ((Number(energy) || 0) * CHANNELS[index].position), 0)
  ));
}

function buildTokenProfile(token) {
  const syllables = Array.isArray(token?.analysis?.syllables) && token.analysis.syllables.length > 0
    ? token.analysis.syllables
    : [{
      vowel: token?.nucleus?.[0] || FAMILY_TO_BASE[normalizeFamily(token?.primaryStressedVowelFamily)] || 'AA',
      vowelFamily: token?.primaryStressedVowelFamily || token?.terminalVowelFamily || token?.vowelFamily?.[0] || null,
      onsetPhonemes: Array.isArray(token?.onset) ? token.onset : [],
      codaPhonemes: Array.isArray(token?.coda) ? token.coda : [],
      stress: Number(token?.stressPattern?.[0]) > 0 ? 1 : 0,
    }];

  const energies = CHANNELS.map(() => 0);
  const onsetScores = [];
  const codaScores = [];
  let baseVowel = '';

  syllables.forEach((syllable, index) => {
    const vowel = resolveBaseVowel(syllable, token, index);
    const hz = resolveVowelHz(vowel, syllable?.vowelFamily || token?.primaryStressedVowelFamily);
    const onset = scoreCluster(syllable?.onsetPhonemes);
    const coda = scoreCluster(syllable?.codaPhonemes);
    const weight = Math.max(0.4, (Number(syllable?.stress) > 0 ? 1.28 : 0.92) + (onset * 0.18) - (coda * 0.06));

    CHANNELS.forEach((channel, bandIndex) => {
      const distance = Math.abs(Math.log2(Math.max(1, hz) / channel.centerHz));
      energies[bandIndex] += weight * (1 / (1 + (distance * distance * 3.2)));
    });

    if (!baseVowel) baseVowel = vowel;
    onsetScores.push(onset);
    codaScores.push(coda);
  });

  const normalized = normalizeEnergies(energies);
  const lead = dominantBand(normalized);
  return Object.freeze({
    tokenId: token.id,
    token,
    baseVowel: baseVowel || 'AA',
    energies: normalized,
    lead,
    focus: lead.energy,
    onsetSharpness: roundTo(mean(onsetScores)),
    codaDamping: roundTo(mean(codaScores)),
    internalSweep: roundTo(transition(syllables.map((syllable, index) => dominantBand(normalizeEnergies(
      CHANNELS.map((channel) => 1 / (1 + Math.abs(Math.log2(resolveVowelHz(resolveBaseVowel(syllable, token, index), syllable?.vowelFamily) / channel.centerHz))))
    )).band.position))),
    spectralTilt: spectralTilt(normalized),
  });
}

function tokenIdsForWindow(window) {
  if (!Array.isArray(window?.tokenSpan) || window.tokenSpan.length < 2) return [];
  const start = Math.max(0, Math.trunc(Number(window.tokenSpan[0]) || 0));
  const end = Math.max(start, Math.trunc(Number(window.tokenSpan[1]) || start));
  return Array.from({ length: (end - start) + 1 }, (_, index) => start + index);
}

function topTokens(tokenIds, tokens) {
  const seen = new Set();
  const values = [];
  tokenIds.forEach((tokenId) => {
    const label = String(tokens[tokenId]?.normalized || tokens[tokenId]?.text || '').trim().toLowerCase();
    if (!label || seen.has(label)) return;
    seen.add(label);
    values.push(label);
  });
  return Object.freeze(values.slice(0, 5));
}

function lineSpread(tokenIds, tokens, lineCount) {
  const lines = new Set(tokenIds.map((tokenId) => Number(tokens[tokenId]?.lineIndex)).filter(Number.isInteger));
  return roundTo(clamp01(lines.size / Math.max(1, lineCount)));
}

function indexSize(indexMap, key) {
  const values = indexMap instanceof Map ? indexMap.get(key) : null;
  return Array.isArray(values) ? values.length : 0;
}

function lockState(confidence, sync, noiseFloor) {
  if (confidence >= 0.76 && sync >= 0.58) return 'LOCKED';
  if (confidence >= 0.54) return 'TRACKED';
  if (noiseFloor >= 0.48) return 'OCCLUDED';
  return 'GLANCING';
}

export const travellingWaveFilterBankAmplifier = {
  id: ID,
  label: LABEL,
  tier: TIER,
  claimedWeight: CLAIMED_WEIGHT,

  route(context = {}) {
    const tokens = Array.isArray(context?.verseIR?.tokens) ? context.verseIR.tokens : [];
    if (tokens.length === 0) return { score: 0, shouldRun: false, reason: 'no_tokens' };
    const coverage = tokens.filter((token) => Array.isArray(token?.phonemes) && token.phonemes.length > 0).length / tokens.length;
    return {
      score: roundTo(clamp01(0.45 + (coverage * 0.55))),
      shouldRun: true,
      reason: coverage > 0 ? 'phonetic_substrate_available' : 'token_substrate_only',
    };
  },

  async analyze(context = {}) {
    const verseIR = context?.verseIR || {};
    const tokens = Array.isArray(verseIR?.tokens) ? verseIR.tokens : [];
    const windows = Array.isArray(verseIR?.syllableWindows) ? verseIR.syllableWindows : [];
    const indexes = verseIR?.indexes || {};
    const lineCount = Math.max(1, Number(verseIR?.metadata?.lineCount) || 1);

    if (tokens.length === 0) {
      return createAmplifierResult({ id: ID, label: LABEL, tier: TIER, claimedWeight: CLAIMED_WEIGHT, commentary: 'TrueVision found no phonetic substrate.' });
    }

    const rawProfiles = tokens.map(buildTokenProfile);
    const byId = new Map(rawProfiles.map((profile) => [profile.tokenId, profile]));
    const tokenIdsByBand = new Map();
    rawProfiles.forEach((profile) => {
      const bandId = profile.lead.band.id;
      if (!tokenIdsByBand.has(bandId)) tokenIdsByBand.set(bandId, []);
      tokenIdsByBand.get(bandId).push(profile.tokenId);
    });

    const windowProfiles = [];
    const tokenWindowCoupling = new Map();

    windows.forEach((window) => {
      const windowTokenIds = tokenIdsForWindow(window).filter((tokenId) => byId.has(tokenId));
      if (windowTokenIds.length === 0) return;

      const energies = CHANNELS.map(() => 0);
      const tilts = [];
      windowTokenIds.forEach((tokenId) => {
        const profile = byId.get(tokenId);
        profile.energies.forEach((energy, bandIndex) => {
          energies[bandIndex] += Number(energy) || 0;
        });
        tilts.push(profile.spectralTilt);
      });

      const normalized = normalizeEnergies(energies);
      const lead = dominantBand(normalized);
      const repeatSignal = clamp01(Math.max(0, indexSize(indexes.windowIdsBySignature, window?.signature) - 1) / 3);
      const modulationDepth = clamp01((transition(tilts) * 0.45) + ((new Set(Array.isArray(window?.vowelSequence) ? window.vowelSequence : []).size / Math.max(1, Number(window?.syllableLength) || 1)) * 0.2) + (repeatSignal * 0.15) + (lead.energy * 0.2));
      const synchronousLock = clamp01((repeatSignal * 0.5) + (lead.energy * 0.25) + ((windowTokenIds.length > 1 ? 1 : 0) * 0.1) + ((Number(window?.syllableLength) || 0) > 2 ? 0.15 : 0));
      const confidence = clamp01((lead.energy * 0.4) + (modulationDepth * 0.3) + (synchronousLock * 0.3));

      const profile = Object.freeze({
        windowId: Number(window?.id) || 0,
        signature: String(window?.signature || ''),
        dominantBand: lead.band.id,
        tokenSpan: Object.freeze(Array.isArray(window?.tokenSpan) ? [...window.tokenSpan] : []),
        lineSpan: Object.freeze(Array.isArray(window?.lineSpan) ? [...window.lineSpan] : []),
        modulationDepth: roundTo(modulationDepth),
        synchronousLock: roundTo(synchronousLock),
        confidence: roundTo(confidence),
      });

      windowProfiles.push(profile);
      const coupling = clamp01((confidence * 0.65) + (synchronousLock * 0.35));
      windowTokenIds.forEach((tokenId) => {
        const current = tokenWindowCoupling.get(tokenId) || [];
        current.push(coupling);
        tokenWindowCoupling.set(tokenId, current);
      });
    });

    const tokenBytecodes = {};
    const finalProfiles = rawProfiles.map((profile, tokenIndex) => {
      const token = profile.token;
      const neighbors = [rawProfiles[tokenIndex - 1]?.spectralTilt, rawProfiles[tokenIndex + 1]?.spectralTilt].filter(Number.isFinite);
      const contrast = neighbors.length > 0 ? clamp01(Math.abs(profile.spectralTilt - mean(neighbors))) : 0;
      const bandPeers = Math.max(0, (tokenIdsByBand.get(profile.lead.band.id)?.length || 1) - 1);
      const rhymePeers = Math.max(0, indexSize(indexes.tokenIdsByRhymeTail, token?.rhymeTailSignature) - 1);
      const stressPeers = Math.max(0, indexSize(indexes.tokenIdsByStressContour, token?.stressPattern || '0') - 1);
      const windowCoupling = clamp01(mean(tokenWindowCoupling.get(token.id)));
      const modulationDepth = clamp01((profile.internalSweep * 0.42) + (contrast * 0.22) + (windowCoupling * 0.18) + (profile.onsetSharpness * 0.1) + (Math.abs(0.5 - profile.spectralTilt) * 0.08));
      const synchronousLock = clamp01((profile.focus * 0.22) + (clamp01(rhymePeers / 3) * 0.26) + (clamp01(stressPeers / 4) * 0.14) + (clamp01(bandPeers / 4) * 0.1) + (windowCoupling * 0.18) + ((token?.flags?.isLineEnd ? 1 : 0) * 0.1));
      const noiseFloor = clamp01(((token?.flags?.unknownPhonetics ? 1 : 0) * 0.55) + ((token?.flags?.isStopWordLike ? 1 : 0) * 0.22) + ((1 - profile.focus) * 0.18) + (profile.codaDamping * 0.08) - (synchronousLock * 0.18) - (modulationDepth * 0.1));
      const confidence = clamp01((profile.focus * 0.28) + (modulationDepth * 0.26) + (synchronousLock * 0.3) + ((1 - noiseFloor) * 0.16));
      const bytecode = Object.freeze({
        symbol: `${profile.lead.band.id}:${profile.baseVowel}:${lockState(confidence, synchronousLock, noiseFloor)}`,
        dominantBand: profile.lead.band.id,
        bandEnergy: roundTo(profile.focus),
        modulationDepth: roundTo(modulationDepth),
        synchronousLock: roundTo(synchronousLock),
        noiseFloor: roundTo(noiseFloor),
        noiseSuppression: roundTo(clamp01(1 - noiseFloor)),
        confidence: roundTo(confidence),
        onsetSharpness: profile.onsetSharpness,
        codaDamping: profile.codaDamping,
        spectralTilt: profile.spectralTilt,
        windowCoupling: roundTo(windowCoupling),
      });
      tokenBytecodes[token.id] = bytecode;
      return Object.freeze({ tokenId: token.id, token, bytecode, dominantBand: profile.lead.band.id });
    });

    const distribution = Object.freeze(
      CHANNELS
        .map((band, index) => Object.freeze({
          id: band.id,
          label: band.label,
          centerHz: band.centerHz,
          energy: roundTo(mean(rawProfiles.map((profile) => Number(profile.energies[index]) || 0))),
        }))
        .sort((left, right) => right.energy - left.energy)
    );
    const dominant = distribution[0] || null;
    const meanSync = roundTo(mean(finalProfiles.map((profile) => profile.bytecode.synchronousLock)));
    const meanMod = roundTo(mean(finalProfiles.map((profile) => profile.bytecode.modulationDepth)));
    const meanNoise = roundTo(mean(finalProfiles.map((profile) => profile.bytecode.noiseFloor)));
    const meanConfidence = roundTo(mean(finalProfiles.map((profile) => profile.bytecode.confidence)));
    const trackedTokenCount = finalProfiles.filter((profile) => profile.bytecode.confidence >= 0.4).length;

    const matches = Object.freeze([
      ...distribution.filter((band) => band.energy >= 0.12).slice(0, 3).map((band) => {
        const tokenIds = tokenIdsByBand.get(band.id) || [];
        return Object.freeze({
          id: `truevision_band_${band.id}`,
          label: band.label,
          hits: tokenIds.length,
          score: roundTo(clamp01((band.energy * 0.65) + (meanConfidence * 0.2) + (meanSync * 0.15))),
          coverage: roundTo(tokenIds.length / Math.max(1, tokens.length)),
          lineSpread: lineSpread(tokenIds, tokens, lineCount),
          tokens: topTokens(tokenIds, tokens),
        });
      }),
      ...(['synchronousLock', 'modulationDepth', 'noiseSuppression']).map((metric) => {
        const tokenIds = finalProfiles.filter((profile) => {
          const value = profile.bytecode[metric];
          return metric === 'noiseSuppression' ? value >= 0.64 : value >= 0.56;
        }).map((profile) => profile.tokenId);
        if (tokenIds.length === 0) return null;
        const score = metric === 'synchronousLock' ? meanSync : metric === 'modulationDepth' ? meanMod : roundTo(clamp01(1 - meanNoise));
        const label = metric === 'synchronousLock' ? 'Synchronous Lock' : metric === 'modulationDepth' ? 'Modulation Tracking' : 'Noise Rejection';
        return Object.freeze({
          id: `truevision_${metric}`,
          label,
          hits: tokenIds.length,
          score,
          coverage: roundTo(tokenIds.length / Math.max(1, tokens.length)),
          lineSpread: lineSpread(tokenIds, tokens, lineCount),
          tokens: topTokens(tokenIds, tokens),
        });
      }).filter(Boolean),
    ].sort((left, right) => right.score - left.score).slice(0, 6));

    const archetypes = Object.freeze([
      ...(dominant ? [{ id: `truevision_${dominant.id}`, label: dominant.label, score: dominant.energy }] : []),
      ...(meanSync >= 0.55 ? [{ id: 'truevision_synchronous_lattice', label: 'Synchronous Lattice', score: meanSync }] : []),
      ...(meanMod >= 0.52 ? [{ id: 'truevision_modulation_lens', label: 'Modulation Lens', score: meanMod }] : []),
      ...(meanNoise <= 0.4 ? [{ id: 'truevision_noise_ward', label: 'Noise Ward', score: roundTo(clamp01(1 - meanNoise)) }] : []),
    ].sort((left, right) => right.score - left.score).slice(0, 4));

    const diagnostics = [
      createAmplifierDiagnostic({
        severity: 'info',
        source: ID,
        message: dominant
          ? `TrueVision locked onto ${dominant.label} with ${(meanConfidence * 100).toFixed(0)}% confidence across ${trackedTokenCount} tracked tokens.`
          : 'TrueVision established a travelling-wave substrate without a dominant band.',
        metadata: { trackedTokenCount, tokenCount: tokens.length, dominantBand: dominant?.id || null },
      }),
    ];

    const unknownPhonetics = tokens.filter((token) => token?.flags?.unknownPhonetics).length;
    if (unknownPhonetics > 0) {
      diagnostics.push(createAmplifierDiagnostic({
        severity: unknownPhonetics / Math.max(1, tokens.length) >= 0.3 ? 'warning' : 'info',
        source: ID,
        message: `${unknownPhonetics} tokens entered TrueVision without authoritative phonetics, reducing cochlear certainty.`,
        metadata: { unknownPhoneticCount: unknownPhonetics },
      }));
    }

    return Object.freeze({
      ...createAmplifierResult({
        id: ID,
        label: LABEL,
        tier: TIER,
        claimedWeight: CLAIMED_WEIGHT,
        signal: meanConfidence,
        semanticDepth: clamp01((meanMod * 0.62) + (meanSync * 0.38)),
        raritySignal: clamp01(((dominant?.energy || 0) * 0.4) + (meanSync * 0.35) + (meanMod * 0.25)),
        matches,
        archetypes,
        diagnostics,
        commentary: dominant
          ? `${dominant.label} now governs the cochlear front-end. TrueVision is tracking phonetic motion with ${(meanConfidence * 100).toFixed(0)}% confidence.`
          : 'TrueVision established a travelling-wave front-end, but no stable cochlear band dominated the verse.',
      }),
      payload: Object.freeze({
        version: VERSION,
        tokenCount: tokens.length,
        trackedTokenCount,
        dominantBand: dominant,
        bandDistribution: distribution,
        synchronousLock: meanSync,
        modulationDepth: meanMod,
        noiseFloor: meanNoise,
        noiseSuppression: roundTo(clamp01(1 - meanNoise)),
        confidence: meanConfidence,
        salientWindows: Object.freeze(
          windowProfiles
            .slice()
            .sort((left, right) => (right.confidence - left.confidence) || (right.synchronousLock - left.synchronousLock))
            .slice(0, MAX_SALIENT_WINDOWS)
        ),
      }),
      tokenBytecodes: Object.freeze({ ...tokenBytecodes }),
    });
  },
};

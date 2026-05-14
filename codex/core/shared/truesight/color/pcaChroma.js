import { SCHOOLS, VOWEL_FAMILY_TO_SCHOOL } from '../../../constants/schools.js';
import { normalizeVowelFamily } from '../../../phonology/vowelFamily.js';
import { mapFormantsToMetrics, getVisemeStyles } from './visemeMapping.js';
import { FAMILY_IDENTITY } from '../../../phonology/vowelWheel.js';
import { oklchToHex } from './oklch.js';

import { resolveSonicChroma } from '../../../phonology/chroma.resolver.js';
import { hslToHex as coreHslToHex } from '../../../pixelbrain/shared.js';

export const hslToHex = coreHslToHex;

export function resolveSonicColor(phonemes = []) {
  const { h, s, l, bytecode } = resolveSonicChroma(phonemes);
  return {
    h, s, l,
    hex: hslToHex(h, s, l),
    bytecode,
  };
}

export const VERSE_IR_PALETTE_FAMILIES = Object.freeze([
  'IY', 'IH', 'EY', 'EH', 'AE',
  'AA', 'AH', 'AO', 'OW', 'UH',
  'UW', 'ER', 'AX', 'AY', 'AW',
  'OY', 'UR', 'OH', 'OO', 'YUW',
]);

const PCA_VOWEL_FORMANTS = Object.freeze({
  IY: Object.freeze([270, 2290]),
  IH: Object.freeze([390, 1990]),
  EY: Object.freeze([530, 1840]),
  EH: Object.freeze([610, 1720]),
  AE: Object.freeze([860, 1550]),
  AA: Object.freeze([730, 1090]),
  AH: Object.freeze([640, 1190]),
  AO: Object.freeze([570, 840]),
  OW: Object.freeze([460, 1100]),
  UH: Object.freeze([440, 1020]),
  UW: Object.freeze([300, 870]),
  ER: Object.freeze([490, 1350]),
  AX: Object.freeze([500, 1500]),
  AY: Object.freeze([660, 1720]),
  AW: Object.freeze([760, 1320]),
  OY: Object.freeze([500, 1000]),
  A: Object.freeze([730, 1090]),
  OH: Object.freeze([550, 950]),
  OO: Object.freeze([400, 900]),
  UR: Object.freeze([450, 1200]),
  YUW: Object.freeze([350, 1800]),
});

const PCA_FAMILY_ALIASES = Object.freeze({
  YOO: 'YUW',
  EE: 'IY',
  IN: 'IH',
});

const SCHOOL_COLOR_ANCHORS = Object.freeze({
  SONIC: 'AE',
  PSYCHIC: 'IY',
  VOID: 'AX',
  ALCHEMY: 'EY',
  WILL: 'AH',
  NECROMANCY: 'AA',
  ABJURATION: 'UW',
  DIVINATION: 'AO',
});

const DEFAULT_SCHOOL_HSL = Object.freeze({ h: 174, s: 68, l: 52 });

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapHue(value) {
  return ((value % 360) + 360) % 360;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function resolveProjectionFamily(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';

  const explicit = FAMILY_IDENTITY[raw] || raw;
  if (PCA_VOWEL_FORMANTS[explicit]) return explicit;

  const normalized = FAMILY_IDENTITY[normalizeVowelFamily(raw)] || normalizeVowelFamily(raw);
  return PCA_VOWEL_FORMANTS[normalized] ? normalized : '';
}

function buildPcaBasis() {
  const families = Object.keys(PCA_VOWEL_FORMANTS);
  const sampleCount = Math.max(1, families.length);

  const mean = [0, 0];
  families.forEach((family) => {
    const [f1, f2] = PCA_VOWEL_FORMANTS[family];
    mean[0] += f1;
    mean[1] += f2;
  });
  mean[0] /= sampleCount;
  mean[1] /= sampleCount;

  const std = [0, 0];
  families.forEach((family) => {
    const [f1, f2] = PCA_VOWEL_FORMANTS[family];
    std[0] += (f1 - mean[0]) ** 2;
    std[1] += (f2 - mean[1]) ** 2;
  });
  std[0] = Math.sqrt(std[0] / sampleCount) || 1;
  std[1] = Math.sqrt(std[1] / sampleCount) || 1;

  const zScores = new Map();
  families.forEach((family) => {
    const [f1, f2] = PCA_VOWEL_FORMANTS[family];
    zScores.set(family, [
      (f1 - mean[0]) / std[0],
      (f2 - mean[1]) / std[1],
    ]);
  });

  let covariance11 = 0;
  let covariance12 = 0;
  let covariance22 = 0;
  zScores.forEach(([z1, z2]) => {
    covariance11 += z1 * z1;
    covariance12 += z1 * z2;
    covariance22 += z2 * z2;
  });
  covariance11 /= sampleCount;
  covariance12 /= sampleCount;
  covariance22 /= sampleCount;

  const trace = covariance11 + covariance22;
  const determinant = (covariance11 * covariance22) - (covariance12 ** 2);
  const root = Math.sqrt(Math.max(0, ((trace ** 2) / 4) - determinant));
  const lambda1 = (trace / 2) + root;
  const lambda2 = (trace / 2) - root;

  const buildEigenvector = (lambda) => {
    if (Math.abs(covariance12) <= 1e-9) {
      return covariance11 >= covariance22 ? [1, 0] : [0, 1];
    }

    const vector = [lambda - covariance22, covariance12];
    const length = Math.hypot(vector[0], vector[1]) || 1;
    return [vector[0] / length, vector[1] / length];
  };

  let principalAxis = buildEigenvector(lambda1);
  let secondaryAxis = buildEigenvector(lambda2);

  if (principalAxis[1] < 0) {
    principalAxis = [-principalAxis[0], -principalAxis[1]];
  }
  if (secondaryAxis[0] < 0) {
    secondaryAxis = [-secondaryAxis[0], -secondaryAxis[1]];
  }

  const rawProjectionEntries = families.map((family) => {
    const [z1, z2] = zScores.get(family);
    return [
      family,
      {
        family,
        pc1Raw: (z1 * principalAxis[0]) + (z2 * principalAxis[1]),
        pc2Raw: (z1 * secondaryAxis[0]) + (z2 * secondaryAxis[1]),
      },
    ];
  });

  const maxAbsPc1 = rawProjectionEntries.reduce((max, [, value]) => Math.max(max, Math.abs(value.pc1Raw)), 1);
  const maxAbsPc2 = rawProjectionEntries.reduce((max, [, value]) => Math.max(max, Math.abs(value.pc2Raw)), 1);

  const projections = Object.freeze(Object.fromEntries(
    rawProjectionEntries.map(([family, value]) => {
      const pc1 = value.pc1Raw / maxAbsPc1;
      const pc2 = value.pc2Raw / maxAbsPc2;
      return [
        family,
        Object.freeze({
          family,
          pc1: round(pc1),
          pc2: round(pc2),
          radius: round(clamp(Math.hypot(pc1, pc2) / Math.sqrt(2), 0, 1)),
        }),
      ];
    })
  ));

  return Object.freeze({
    mean: Object.freeze(mean.map((value) => round(value))),
    std: Object.freeze(std.map((value) => round(value))),
    eigenvalues: Object.freeze([round(lambda1), round(lambda2)]),
    principalAxis: Object.freeze(principalAxis.map((value) => round(value))),
    secondaryAxis: Object.freeze(secondaryAxis.map((value) => round(value))),
    projections,
  });
}

let _pcaBasis = null;
function getPCABasis() {
  if (!_pcaBasis) {
    _pcaBasis = buildPcaBasis();
  }
  return _pcaBasis;
}

function resolveSchoolKey(schoolId, family) {
  const requested = String(schoolId || '').trim().toUpperCase();
  if (requested && requested !== 'DEFAULT' && SCHOOLS[requested]) {
    return requested;
  }

  const familySchool = VOWEL_FAMILY_TO_SCHOOL[family] || null;
  return familySchool && SCHOOLS[familySchool] ? familySchool : null;
}

function resolveBaseHsl(schoolKey, options = {}) {
  if (options.baseHsl) {
    return options.baseHsl;
  }
  const school = schoolKey ? SCHOOLS[schoolKey] : null;
  if (school?.colorHsl) {
    return school.colorHsl;
  }
  return DEFAULT_SCHOOL_HSL;
}

/**
 * Computes a weighted average HSL base from school weights.
 * Uses circular averaging for the hue component to handle 0/360 wrap.
 * 
 * @param {Record<string, number>} schoolWeights - Normalized school weights.
 * @param {object} schools - The SCHOOLS registry.
 * @returns {object} Blended { h, s, l }.
 */
export function computeBlendedHsl(schoolWeights, schools = SCHOOLS) {
  const entries = Object.entries(schoolWeights)
    .filter(([id]) => schools[id]?.colorHsl)
    .map(([id, weight]) => ({ hsl: schools[id].colorHsl, weight }));

  if (!entries.length) return DEFAULT_SCHOOL_HSL;

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0) || 1;

  // Circular mean for hue (angular mean)
  let sinSum = 0, cosSum = 0;
  let s = 0, l = 0;
  
  for (const { hsl, weight } of entries) {
    const norm = weight / totalWeight;
    const rad = (hsl.h * Math.PI) / 180;
    sinSum += Math.sin(rad) * norm;
    cosSum += Math.cos(rad) * norm;
    s += hsl.s * norm;
    l += hsl.l * norm;
  }

  const h = ((Math.atan2(sinSum, cosSum) * 180) / Math.PI + 360) % 360;
  
  return { 
    h: Math.round(h), 
    s: Math.round(s), 
    l: Math.round(l) 
  };
}

/**
 * Resolves the perceptually-validated color for a phoneme family.
 *
 * Pipeline (PhD-worthy color):
 *   1. Project phoneme into PCA space derived from F1/F2 formants.
 *   2. Anchor on the school's color (or family's natural school) — atan2(pc2, pc1)
 *      gives the angle in PCA space; the delta from the anchor family's angle
 *      becomes the hue offset from the school's hue.
 *   3. Lightness ← PC1 (open/close axis). Open vowels lighter, close vowels darker.
 *   4. Chroma ← projection radius. Edge vowels saturated, central (schwa) muted.
 *   5. Phase modulates lightness ±5% for resonance ticking.
 *   6. Final emit in OKLCh (perceptually uniform) → sRGB hex for CSS.
 */
export function resolveVerseIrColor(family, schoolId = null, options = {}) {
  const resolvedFamily = resolveProjectionFamily(family);
  const { phase = 0 } = options;

  if (!resolvedFamily) {
    return Object.freeze({
      family: '',
      school: null,
      hex: null,
      oklch: Object.freeze({ l: 0.5, c: 0, h: 0 }),
      projection: null,
    });
  }

  const projection = getVerseIrColorProjection(resolvedFamily);
  const schoolKey = resolveSchoolKey(schoolId, resolvedFamily);
  const baseHsl = resolveBaseHsl(schoolKey, options);
  const anchorFamily = SCHOOL_COLOR_ANCHORS[schoolKey] || resolvedFamily;
  const anchorProjection = getVerseIrColorProjection(anchorFamily) || projection;

  // 1. Hue: school anchor + PCA angular delta (front/back rotation in vowel space).
  const baseAngle = Math.atan2(projection.pc2, projection.pc1) * (180 / Math.PI);
  const anchorAngle = Math.atan2(anchorProjection.pc2, anchorProjection.pc1) * (180 / Math.PI);
  const hue = wrapHue(baseHsl.h + (baseAngle - anchorAngle));

  // 2. Lightness: PC1 (open/close) maps to ±20% around school baseline (0..1 OKLCh L).
  // School baseHsl.l is in 0..100 — scale to OKLCh L space.
  const lAnchor = clamp(baseHsl.l / 100, 0.3, 0.85);
  const lBase = lAnchor + (projection.pc1 * 0.18);
  const lightness = clamp(lBase + (Math.sin(phase * Math.PI * 2) * 0.05), 0.25, 0.92);

  // 3. Chroma: radius from PCA centroid → distance from "schwa-like" center.
  // School baseHsl.s drives the floor; PCA radius adds eccentricity.
  const cBase = 0.08 + (baseHsl.s / 100) * 0.12;
  const chroma = clamp(cBase + (projection.radius * 0.10), 0.04, 0.32);

  return Object.freeze({
    family: resolvedFamily,
    school: schoolKey,
    hex: oklchToHex(lightness, chroma, hue),
    oklch: Object.freeze({
      l: round(lightness, 3),
      c: round(chroma, 3),
      h: round(hue, 3),
    }),
    projection,
    viseme: getVisemeStyles(
      mapFormantsToMetrics(PCA_VOWEL_FORMANTS[resolvedFamily]),
      Object.values(SCHOOL_COLOR_ANCHORS).includes(resolvedFamily)
    ),
  });
}

function buildVerseIrPalette(schoolId = 'DEFAULT') {
  const palette = {};
  VERSE_IR_PALETTE_FAMILIES.forEach((family) => {
    palette[family] = resolveVerseIrColor(family, schoolId).hex;
  });
  return Object.freeze(palette);
}

function getVerseIrColorProjection(family) {
  const resolvedFamily = resolveProjectionFamily(family);
  if (!resolvedFamily) return null;
  return getPCABasis().projections[resolvedFamily] || null;
}

const VERSE_IR_PCA_CHROMA_BASIS = getPCABasis();

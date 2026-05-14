/**
 * Rhyme Scheme Detector
 * Detects and classifies rhyme scheme patterns.
 */

import { RHYME_SCHEMES, SCHEME_LORE, METRICAL_FEET, METER_NAMES } from "../constants/data/rhymeScheme.patterns.js";

/**
 * @typedef {object} SchemeDetection
 * @property {string} id - Scheme identifier (e.g., "ALTERNATE").
 * @property {string} name - Human-readable name.
 * @property {string} pattern - Detected pattern string (e.g., "ABAB").
 * @property {string} description - Scheme description.
 * @property {string} lore - Thematic lore text.
 * @property {number} confidence - Detection confidence (0-1).
 * @property {Map<string, number[]>} groups - Rhyme groups to line indices.
 */

/**
 * @typedef {object} MeterDetection
 * @property {string} footType - Dominant foot type (e.g., "IAMB").
 * @property {string} footName - Foot name (e.g., "Iamb").
 * @property {number} feetPerLine - Average feet per line.
 * @property {string} meterName - Full meter name (e.g., "Iambic Pentameter").
 * @property {number} consistency - How consistent the meter is (0-1).
 * @property {string} stressPattern - Representative stress pattern.
 */

/**
 * Detects the rhyme scheme from a pattern string.
 * @param {string} pattern - The rhyme pattern (e.g., "ABAB").
 * @param {Map<string, number[]>} groups - Rhyme groups mapping.
 * @returns {SchemeDetection}
 */
export function detectScheme(pattern, groups = new Map()) {
  if (!pattern || pattern.length === 0) {
    return createSchemeResult('FREE_VERSE', '', groups, 1.0);
  }

  // Try to match known schemes (in order of specificity)
  const schemeOrder = [
    'SHAKESPEAREAN_SONNET',
    'PETRARCHAN_OCTAVE',
    'OTTAVA_RIMA',
    'RHYME_ROYAL',
    'TERZA_RIMA',
    'LIMERICK',
    'ENCLOSED',
    'ALTERNATE',
    'BALLAD',
    'TRIPLET',
    'COUPLET',
    'MONORHYME',
  ];

  for (const schemeId of schemeOrder) {
    const scheme = RHYME_SCHEMES[schemeId];
    if (!scheme.pattern) continue;

    if (scheme.pattern.test(pattern)) {
      // Calculate confidence based on how well it matches
      const confidence = calculateConfidence(pattern, scheme);
      return createSchemeResult(schemeId, pattern, groups, confidence);
    }
  }

  // Check for partial matches
  const partialMatch = findPartialMatch(pattern);
  if (partialMatch) {
    return createSchemeResult(partialMatch.id, pattern, groups, partialMatch.confidence);
  }

  // Default to free verse
  return createSchemeResult('FREE_VERSE', pattern, groups, 1.0);
}

/**
 * Creates a scheme detection result object.
 * @param {string} schemeId
 * @param {string} pattern
 * @param {Map} groups
 * @param {number} confidence
 * @returns {SchemeDetection}
 */
function createSchemeResult(schemeId, pattern, groups, confidence) {
  const scheme = RHYME_SCHEMES[schemeId] || RHYME_SCHEMES.FREE_VERSE;
  return {
    id: schemeId,
    name: scheme.name,
    pattern,
    description: scheme.description,
    lore: SCHEME_LORE[schemeId] || '',
    confidence,
    groups,
  };
}

/**
 * Calculates confidence score for a scheme match.
 * @param {string} pattern
 * @param {object} scheme
 * @returns {number}
 */
function calculateConfidence(pattern, scheme) {
  if (!scheme.pattern) return 0.5;

  // Perfect match gets high confidence
  if (scheme.pattern.test(pattern)) {
    // Longer patterns that match get higher confidence
    const lengthBonus = Math.min(0.2, pattern.length / 50);
    return Math.min(1.0, 0.8 + lengthBonus);
  }

  return 0.5;
}

/**
 * Finds partial matches for incomplete patterns.
 * @param {string} pattern
 * @returns {{ id: string, confidence: number } | null}
 */
function findPartialMatch(pattern) {
  if (pattern.length < 2) return null;

  // Check for repeating structures
  if (/^(AB)+A?$/.test(pattern)) {
    return { id: 'ALTERNATE', confidence: 0.6 };
  }

  if (/^(AA)+A?$/.test(pattern)) {
    return { id: 'COUPLET', confidence: 0.7 };
  }

  if (/^(ABBA)+/.test(pattern)) {
    return { id: 'ENCLOSED', confidence: 0.7 };
  }

  // Check for mostly same rhyme (monorhyme tendency)
  const uniqueLetters = new Set(pattern.split(''));
  if (uniqueLetters.size === 1 && pattern.length >= 3) {
    return { id: 'MONORHYME', confidence: 0.8 };
  }

  return null;
}

/**
 * Analyzes meter/stress patterns in a document.
 * @param {Array} lines - Lines with stress patterns.
 * @returns {MeterDetection}
 */
export function analyzeMeter(lines) {
  if (!lines || lines.length === 0) {
    return {
      footType: null,
      footName: 'Unknown',
      feetPerLine: 0,
      meterName: 'Free Verse',
      consistency: 0,
      stressPattern: '',
    };
  }

  // Collect all stress patterns
  const patterns = lines
    .map(l => l.stressPattern?.replace(/\s/g, '') || '')
    .filter(p => p.length >= 2);

  if (patterns.length === 0) {
    return {
      footType: null,
      footName: 'Unknown',
      feetPerLine: 0,
      meterName: 'Free Verse',
      consistency: 0,
      stressPattern: '',
    };
  }

  // Count foot type occurrences
  const footCounts = {};

  for (const pattern of patterns) {
    const feet = detectFeet(pattern);
    for (const foot of feet) {
      footCounts[foot] = (footCounts[foot] || 0) + 1;
    }
  }

  // Find dominant foot type
  let dominantFoot = null;
  let maxCount = 0;
  let totalFeet = 0;

  for (const [foot, count] of Object.entries(footCounts)) {
    totalFeet += count;
    if (count > maxCount) {
      maxCount = count;
      dominantFoot = foot;
    }
  }

  // Calculate consistency (how much the dominant foot dominates)
  const consistency = totalFeet > 0 ? maxCount / totalFeet : 0;

  // Calculate average feet per line
  const avgFeetPerLine = patterns.length > 0
    ? Math.round(totalFeet / patterns.length)
    : 0;

  // Get meter name
  const meterName = getMeterName(dominantFoot, avgFeetPerLine);

  // Get representative pattern
  const representativePattern = patterns.length > 0 ? patterns[0] : '';

  return {
    footType: dominantFoot,
    footName: METRICAL_FEET[dominantFoot]?.name || 'Unknown',
    feetPerLine: avgFeetPerLine,
    meterName,
    consistency,
    stressPattern: representativePattern,
  };
}

/**
 * Detects metrical feet in a stress pattern.
 * @param {string} pattern - Binary stress pattern (e.g., "01010101").
 * @returns {string[]} Array of foot types found.
 */
function detectFeet(pattern) {
  const feet = [];
  let i = 0;

  while (i < pattern.length) {
    let matched = false;

    // Try longer patterns first
    for (const [footType, footDef] of Object.entries(METRICAL_FEET)) {
      const footPattern = footDef.pattern;
      if (pattern.slice(i, i + footPattern.length) === footPattern) {
        feet.push(footType);
        i += footPattern.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      i++; // Skip unmatched character
    }
  }

  return feet;
}

/**
 * Gets the full meter name.
 * @param {string} footType
 * @param {number} feetCount
 * @returns {string}
 */
function getMeterName(footType, feetCount) {
  if (!footType) return 'Free Verse';

  const meterNames = METER_NAMES[footType];
  if (meterNames && meterNames[feetCount]) {
    return meterNames[feetCount];
  }

  // Generic name
  const footName = METRICAL_FEET[footType]?.name || footType;
  const countNames = {
    1: 'Monometer',
    2: 'Dimeter',
    3: 'Trimeter',
    4: 'Tetrameter',
    5: 'Pentameter',
    6: 'Hexameter',
    7: 'Heptameter',
    8: 'Octameter',
  };

  const countName = countNames[feetCount] || `${feetCount}-foot`;
  return `${footName}ic ${countName}`;
}

/**
 * Checks if a scheme is considered complex (for XP bonuses).
 * @param {string} schemeId
 * @returns {boolean}
 */
export function isComplexScheme(schemeId) {
  const complexSchemes = new Set([
    'SHAKESPEAREAN_SONNET',
    'PETRARCHAN_OCTAVE',
    'TERZA_RIMA',
    'RHYME_ROYAL',
    'OTTAVA_RIMA',
  ]);
  return complexSchemes.has(schemeId);
}

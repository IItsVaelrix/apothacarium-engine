/**
 * Viseme-to-CSS Mapping Algorithm
 * 
 * Translates phonetic biophysical metrics (from VerseIRChromaEngine) 
 * into visual CSS properties. This creates a "visual mouth shape" (viseme)
 * for every resonant word in TrueSight mode.
 * 
 * Architecture: Void Echo — Neural Transmutation
 */

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Translates phonetic formants (F1, F2) into normalized viseme metrics.
 * 
 * @param {number[]} formants - [F1, F2] frequencies
 * @returns {object} Normalized metrics
 */
export function mapFormantsToMetrics(formants) {
  if (!formants || formants.length < 2) return null;

  const [f1, f2] = formants;

  // Normalization ranges based on human vocal tract limits
  // F1 (Openness): 200 - 1000 Hz
  // F2 (Place): 600 - 2500 Hz
  const spreadNorm = clamp((f1 - 200) / 800, 0, 1);
  const centroidNorm = clamp((f2 - 600) / 1900, 0, 1);

  // Sharpness/Distinctness derived from distance from neutral center (schwa-like)
  // Schwa is roughly F1: 500, F2: 1500
  const dx = (f2 - 1500) / 900;
  const dy = (f1 - 500) / 300;
  const distinctNorm = clamp(Math.sqrt(dx*dx + dy*dy) / 1.4, 0, 1);

  return {
    centroidNorm,
    spreadNorm,
    skewNorm: (centroidNorm - 0.5) * 2, // Front vowels skew right, back vowels left
    sharpnessNorm: clamp(0.3 + (distinctNorm * 0.5), 0, 1),
    distinctNorm
  };
}

/**
 * Generates CSS custom properties based on biophysical vowel metrics.
...
 * @param {object} metrics - Biophysical metrics from VisualBytecode
 * @param {boolean} isAnchor - Whether this word is a phonetic anchor
 * @returns {object} CSS variable mapping
 */
export function getVisemeStyles(metrics, isAnchor = false) {
  if (!metrics) return {};

  const {
    centroidNorm = 0.5, // Cochlear Place (Front vs Back)
    spreadNorm = 0.5,   // Vowel Space (Open vs Closed)
    skewNorm = 0,       // Spectral Tilt
    sharpnessNorm = 0.4,// Purity (Vowel vs Schwa)
    distinctNorm = 0.5  // Eccentricity from center
  } = metrics;

  // 1. Structural Lattice (Radius/Roundness)
  // Front vowels (high centroid) are sharp, back vowels are round.
  const radius = Math.round((1 - centroidNorm) * 12);
  
  // 2. Chromatic Spread (Tracking/Padding)
  // Open vowels (high spread) get more visual breathing room.
  const tracking = (spreadNorm - 0.5) * 0.15;
  const paddingX = 0.1 + (spreadNorm * 0.2);

  // 3. Neural Transmutation (Skew/Tilt)
  // Represents the spectral lean of the phoneme.
  const skew = Math.round(skewNorm * 8);

  // 4. Landmark Intensity (Contrast/Weight)
  // Distinct, sharp vowels pop more.
  const contrast = 1 + (sharpnessNorm - 0.4);
  const weight = 400 + Math.round(distinctNorm * 400);

  // 5. Edge Hardening (For Anchors)
  // Anchors get a "quantized" visual weight.
  const shadowBlur = isAnchor ? 0 : 2 + (1 - sharpnessNorm) * 4;

  return {
    '--vb-viseme-radius': `${radius}px`,
    '--vb-viseme-tracking': `${tracking}em`,
    '--vb-viseme-padding-x': `${paddingX}em`,
    '--vb-viseme-skew': `${skew}deg`,
    '--vb-viseme-contrast': contrast.toFixed(2),
    '--vb-viseme-weight': weight,
    '--vb-viseme-shadow-blur': `${shadowBlur}px`,
    '--vb-viseme-brightness': (1.0 + (distinctNorm * 0.35)).toFixed(2),
  };
}

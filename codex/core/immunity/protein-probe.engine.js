import { similarity, quantizeVectorJS } from '../quantization/turboquant.js';
import { generatePhonosemanticVector } from '../semantic/vector.utils.js';

const SEED = 42;

/**
 * PROTEIN PROBE ENGINE
 * 
 * Vectorizes bug hypotheses and scans a collection of files for structural resonance.
 */

/**
 * Vectorizes a natural language hypothesis into a search protein.
 * 
 * @param {string} hypothesis 
 * @returns {{ data: Uint8Array, norm: number }}
 */
export function vectorizeHypothesis(hypothesis) {
  const vec = generatePhonosemanticVector(hypothesis);
  const sig = quantizeVectorJS(vec, SEED);
  console.log(`[debug] searchProtein norm: ${sig.norm}`);
  return sig;
}

/**
 * Scans a list of files for resonance with a search protein.
 * 
 * @param {Array<{path: string, content: string}>} files 
 * @param {{ data: Uint8Array, norm: number }} searchProtein 
 * @param {object} options
 * @returns {Array<{path: string, resonance: number}>}
 */
export function scanSubstrate(files, searchProtein, options = { minResonance: 0.7 }) {
  const heatmap = [];

  for (const file of files) {
    const content = file.content;
    if (!content || content.length < 50) continue;

    // Chunking logic similar to adaptive scanner but optimized for probe
    const CHUNK_SIZE = 500;
    let maxResonance = 0;

    for (let i = 0; i < content.length; i += CHUNK_SIZE / 2) {
      const chunk = content.slice(i, i + CHUNK_SIZE);
      const chunkVec = generatePhonosemanticVector(chunk);
      const chunkSig = quantizeVectorJS(chunkVec, SEED);

      // Pass 1.0 for norms because quantized buffers are already unit vectors.
      // This returns the cosine similarity (-1 to 1).
      const res = similarity(chunkSig.data, searchProtein.data, 1.0, 1.0);
      if (res > maxResonance) maxResonance = res;
    }

    // Map -1..1 to 0..1 for percentage display
    const normalizedResonance = Math.max(0, (maxResonance + 1) / 2);

    if (normalizedResonance >= options.minResonance) {
      heatmap.push({
        path: file.path,
        resonance: normalizedResonance
      });
    }
  }

  return heatmap.sort((a, b) => b.resonance - a.resonance);
}

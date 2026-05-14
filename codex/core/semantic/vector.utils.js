/**
 * SEMANTIC VECTOR UTILITIES
 * 
 * Deterministic vector generation for the Scholomance V12 core.
 */

/**
 * Generate a deterministic "Phonosemantic" vector for raw text or code.
 * 
 * V12 Logic:
 * - Dims 0-63: Vowel/Consonant or Syntactic pattern hash
 * - Dims 64-127: Structural resonance (Suffixes/Keywords)
 * - Dims 128-191: Mass and Complexity approximation
 * - Dims 192-255: N-gram distribution
 */
export function generatePhonosemanticVector(input, dim = 256) {
  const vec = new Float32Array(dim);
  const text = String(input || "").toLowerCase().trim();
  if (!text) return vec;

  // 1. Structural Resonance (Suffixes / Keywords)
  const suffix = text.slice(-5);
  for (let i = 0; i < suffix.length; i++) {
    const h = (suffix.charCodeAt(i) * 13) % 64;
    vec[64 + h] += 2.0;
  }

  // 2. Syntactic Pattern (Vowels for text, Operators/Keywords for code)
  const pattern = text.replace(/[^aeiouy=><!&|]/g, '');
  for (let i = 0; i < pattern.length; i++) {
    const h = (pattern.charCodeAt(i) * 17) % 64;
    vec[i % 64] += 1.5;
  }

  // 3. N-grams (Local context)
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    const h = ((gram.charCodeAt(0) << 5) + gram.charCodeAt(1)) % 64;
    vec[192 + h] += 1.0;
  }

  // 4. Complexity / Mass
  const lenBucket = Math.min(text.length, 30);
  vec[128 + (lenBucket % 64)] = 5.0;

  return vec;
}

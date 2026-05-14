/**
 * Pure JavaScript TurboQuant kernel.
 *
 * Core-owned so ritual prediction can use quantized vectors without importing
 * from src/. The functions are deterministic for a fixed input vector and seed.
 */

export function fastHadamardTransform(vec) {
  const n = vec.length;
  for (let h = 1; h < n; h <<= 1) {
    for (let i = 0; i < n; i += (h << 1)) {
      for (let j = i; j < i + h; j += 1) {
        const x = vec[j];
        const y = vec[j + h];
        vec[j] = x + y;
        vec[j + h] = x - y;
      }
    }
  }

  const invSqrtN = 1.0 / Math.sqrt(n);
  for (let i = 0; i < n; i += 1) {
    vec[i] *= invSqrtN;
  }
}

// Precomputed 4-bit dequantization map for O(1) inner-product estimation
const DEQUANT_MAP = new Float32Array(16);
for (let i = 0; i < 16; i++) {
  DEQUANT_MAP[i] = (i / 7.5) - 1.0;
}

export function quantizeF32To4Bit(value) {
  const clamped = Math.max(-1.0, Math.min(1.0, value));
  const mapped = Math.round((clamped + 1.0) * 7.5);
  return Math.min(15, Math.max(0, mapped));
}

export function dequantize4BitToF32(value) {
  return DEQUANT_MAP[value & 0x0F];
}

/**
 * Estimates the inner product between two TurboQuant-compressed buffers.
 *
 * @param {Uint8Array} b1
 * @param {Uint8Array} b2
 * @param {number} n1
 * @param {number} n2
 * @returns {number}
 */
export function estimateInnerProduct(b1, b2, n1, n2) {
  let sum = 0;
  const len = b1.length;

  for (let i = 0; i < len; i += 1) {
    const byte1 = b1[i];
    const byte2 = b2[i];

    // Direct lookup from precomputed float map
    sum += (DEQUANT_MAP[byte1 >> 4] * DEQUANT_MAP[byte2 >> 4]) + 
           (DEQUANT_MAP[byte1 & 0x0f] * DEQUANT_MAP[byte2 & 0x0f]);
  }

  return sum * n1 * n2;
}

export { estimateInnerProduct as similarity };

/**
 * Initialization stub for core-level TurboQuant.
 * Always resolves immediately as the JS kernel is statically loaded.
 */
export async function initializeTurboQuant() {
  return Promise.resolve();
}

/**
 * Alias for quantizeVectorJS to match the standard TQ interface.
 */
export async function quantizeVector(vector, seed = 42) {
  return Promise.resolve(quantizeVectorJS(vector, seed));
}

/**
 * Deterministic JavaScript quantization pipeline.
...
 * @param {Float32Array | number[]} vector
 * @param {number} seed
 * @returns {{ data: Uint8Array, norm: number }}
 */
export function quantizeVectorJS(vector, seed = 42) {
  const dim = vector.length;
  const vec = new Float32Array(vector);

  let sumSq = 0;
  for (let i = 0; i < dim; i += 1) {
    sumSq += vec[i] * vec[i];
  }

  const norm = Math.sqrt(sumSq);
  if (norm > 0) {
    for (let i = 0; i < dim; i += 1) {
      vec[i] /= norm;
    }
  }

  for (let i = 0; i < dim; i += 1) {
    let value = seed ^ i;
    let setBits = 0;
    while (value > 0) {
      value &= value - 1;
      setBits += 1;
    }
    if (setBits % 2 === 1) vec[i] *= -1.0;
  }

  fastHadamardTransform(vec);

  const packedData = new Uint8Array(Math.ceil(dim / 2));
  for (let i = 0; i < dim; i += 2) {
    const q1 = quantizeF32To4Bit(vec[i]);
    const q2 = i + 1 < dim ? quantizeF32To4Bit(vec[i + 1]) : 0;
    packedData[i / 2] = (q1 << 4) | (q2 & 0x0f);
  }

  return { data: packedData, norm };
}

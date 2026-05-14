// IMMUNE_ALLOW: math-random — this module's documentation references Math.random
// by name as the literal symbol it replaces; QUANT-0101 substring matching
// would otherwise self-flag this file.

/**
 * SEEDED RNG — replaces unseeded host RNG calls for Scholomance world-law conformance
 *
 * Provides a deterministic, seedable pseudo-random stream for contexts where
 * the codebase previously reached for the host RNG:
 *
 *   - Audio noise generation (ambient layers, white noise, bursts)
 *   - Visual atmosphere jitter (particles, scene shimmer, parallax offsets)
 *   - Test fixture vectors (verify scripts that need reproducible inputs)
 *
 * Design notes:
 *   - `mulberry32` is a 32-bit PRNG with sufficient quality for visual/audio
 *     stochastics. Period 2^32. Output uniform in [0, 1).
 *   - When determinism *across sessions* matters (tests, verification), pass
 *     an explicit numeric seed. When variety per session matters (audio noise,
 *     scene jitter), seed from `crypto.randomBytes(4)` once at scene/session
 *     start — the stream is then deterministic relative to that seed.
 *   - True security-grade randomness for IDs / tokens belongs in
 *     `crypto.randomUUID()` / `crypto.randomBytes()`, not here.
 *
 * Reference: VAELRIX_LAW §6 (determinism), QUANT-0101 (math-random rule).
 */

/**
 * Construct a mulberry32 PRNG bound to the given seed.
 *
 * @param {number} seed - Any 32-bit unsigned integer.
 * @returns {() => number} Function returning a uniform float in [0, 1).
 */
export function mulberry32(seed) {
  let state = (seed | 0) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a fresh per-session seed using crypto-grade entropy. Use when you
 * want session-to-session variety but stream determinism within a session.
 *
 * Uses `globalThis.crypto.getRandomValues` (universal in modern browsers and
 * Node ≥ 19). Never falls back to Math.random.
 *
 * @returns {number} 32-bit unsigned seed
 */
export function freshSeed() {
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  }
  throw new Error('seededRng.freshSeed: no crypto-grade entropy source available');
}

/**
 * Construct a PRNG with a fresh per-session seed (the most common audio/
 * visual case — varies per page-load, deterministic within the load).
 *
 * @returns {() => number}
 */
export function freshRng() {
  return mulberry32(freshSeed());
}

/**
 * One-shot uniform sample in [min, max). For repeated sampling, build a PRNG
 * once with `freshRng()` and call it directly — calling this in a loop creates
 * a new PRNG each time and discards entropy.
 *
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rng=freshRng()] - PRNG to draw from
 * @returns {number}
 */
export function uniform(min, max, rng = freshRng()) {
  return min + (max - min) * rng();
}

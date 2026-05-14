/**
 * SafeMath — Mathematical Stasis Primitives
 * Prevents NaN and Infinity propagation in the PixelBrain substrate.
 */

/**
 * Performs a guarded division.
 * @param {number} n - Numerator
 * @param {number} d - Denominator
 * @param {number} fallback - Value to return if division is unsafe (default: 0)
 * @returns {number}
 */
export const safeDivide = (n, d, fallback = 0) => {
  if (d === 0 || !Number.isFinite(d)) return fallback;
  const result = n / d;
  return Number.isFinite(result) ? result : fallback;
};

/**
 * Clamps a value to the finite range.
 * @param {number} val
 * @param {number} fallback
 * @returns {number}
 */
export const toFinite = (val, fallback = 0) => {
  return Number.isFinite(val) ? val : fallback;
};

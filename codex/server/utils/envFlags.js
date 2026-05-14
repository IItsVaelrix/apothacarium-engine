const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes']);
const FALSE_VALUES = new Set(['0', 'false', 'off', 'no']);

/**
 * Parses a boolean-like environment variable by name.
 * Accepts: "true", "1", "on", "yes" → true
 *          "false", "0", "off", "no" → false
 * Falls back to defaultValue for missing or unrecognized values.
 *
 * @param {string} name - Environment variable name
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function parseBooleanEnv(name, defaultValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

/**
 * Parses a raw boolean-like string value.
 * Same logic as parseBooleanEnv but takes the value directly.
 *
 * @param {string|undefined|null} rawValue
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function parseBooleanFlag(rawValue, defaultValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }
  const normalized = String(rawValue).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return defaultValue;
}

/**
 * Parses a positive integer environment variable by name.
 * Falls back to defaultValue for missing, non-integer, or non-positive values.
 *
 * @param {string} name - Environment variable name
 * @param {number} defaultValue
 * @returns {number}
 */
export function parsePositiveIntegerEnv(name, defaultValue) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return defaultValue;
}

/**
 * A client-side rate limiter to prevent spamming actions.
 *
 * @see AI_Architecture_V2.md section 3.3 and 5.2
 */

const timestamps = new Map();

/**
 * Checks if an action is allowed based on a rate limit.
 * @param {string} actionKey A unique key for the action being rate-limited (e.g., "combat_submit").
 * @param {number} limitMs The time window in milliseconds (e.g., 3000 for 1 action per 3 seconds).
 * @returns {boolean} `true` if the action is allowed, `false` if it is rate-limited.
 */
export function isActionAllowed(actionKey, limitMs) {
  const now = Date.now();
  const lastActionTime = timestamps.get(actionKey);

  if (lastActionTime && (now - lastActionTime < limitMs)) {
    // Action is too soon, deny.
    return false;
  }

  // Action is allowed, update the timestamp.
  timestamps.set(actionKey, now);
  return true;
}

/**
 * Resets the rate limit for a specific action.
 * @param {string} actionKey The key for the action to reset.
 */
export function resetRateLimit(actionKey) {
    timestamps.delete(actionKey);
}
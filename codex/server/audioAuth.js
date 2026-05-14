// @ts-check

import crypto from 'crypto';

export const AUDIO_ADMIN_HEADER = 'x-audio-admin-token';

/**
 * @typedef {'missing_admin_token' | 'invalid_admin_token'} AudioAuthFailureReason
 */

/**
 * @typedef {{ authorized: true } | { authorized: false; reason: AudioAuthFailureReason }} AudioAuthResult
 */

/**
 * @typedef {{ isProduction: boolean; configuredAdminToken: string | null }} AudioAuthConfig
 */

/**
 * @param {unknown} headerValue
 * @returns {string | null}
 */
export function readHeaderAsString(headerValue) {
  if (typeof headerValue === 'string') return headerValue;
  if (Array.isArray(headerValue) && typeof headerValue[0] === 'string') return headerValue[0];
  return null;
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {boolean}
 */
export function secureTokenEquals(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * @param {{ headers?: Record<string, unknown> }} requestLike
 * @param {AudioAuthConfig} config
 * @returns {AudioAuthResult}
 */
export function authorizeAudioRequest(requestLike, config) {
  if (!config.isProduction) {
    return { authorized: true };
  }

  const configuredToken = typeof config.configuredAdminToken === 'string'
    ? config.configuredAdminToken.trim()
    : '';
  const headerToken = readHeaderAsString(requestLike.headers?.[AUDIO_ADMIN_HEADER]);

  if (!headerToken || !configuredToken) {
    return { authorized: false, reason: 'missing_admin_token' };
  }

  if (!secureTokenEquals(headerToken, configuredToken)) {
    return { authorized: false, reason: 'invalid_admin_token' };
  }

  return { authorized: true };
}

/**
 * @param {AudioAuthFailureReason} reason
 * @returns {{ message: string; reason: AudioAuthFailureReason }}
 */
export function buildAudioUnauthorizedPayload(reason) {
  if (reason === 'invalid_admin_token') {
    return {
      message: 'Unauthorized: invalid audio admin token.',
      reason,
    };
  }

  return {
    message: 'Unauthorized: missing audio admin token.',
    reason: 'missing_admin_token',
  };
}

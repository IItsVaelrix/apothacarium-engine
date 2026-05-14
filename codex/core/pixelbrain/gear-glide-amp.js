/**
 * GEAR-GLIDE AMP — BPM-Synced Clock Rotation System
 *
 * Provides seamless, continuous clock-like rotation for PixelBrain assets.
 * When music plays: syncs to detected BPM.
 * When idle: uses default tempo.
 *
 * CRITICAL: Time-based, not frame-based for smooth continuous rotation.
 * Uses absolute time (elapsed since start) rather than delta accumulation.
 * Like a clock: perfectly smooth, no wobble, no mechanical imperfection.
 *
 * Core Formula:
 *   rotation(t) = (degreesPerBeat * (BPM / 60) * t) in radians
 *   where t = time in seconds since animation start
 */

/**
 * Clamp value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Gear-glide configuration defaults
 * Clock-like rotation: no wobble, no mechanical imperfection
 */
export const GEAR_GLIDE_CONFIG = Object.freeze({
  // Default BPM when no music playing
  DEFAULT_BPM: 90,

  // Minimum/Maximum BPM for valid rotation speeds
  MIN_BPM: 40,
  MAX_BPM: 220,

  // Degrees per beat (90 = quarter turn, 45 = eighth turn)
  DEFAULT_DEGREES_PER_BEAT: 90,

  // Beat pulse for visual feedback (optional, doesn't affect rotation)
  BEAT_PULSE_AMOUNT: 0.05, // 5% scale pulse on beat
});

/**
 * Gear-glide state object (for legacy compatibility)
 * Use getRotationAtTime() for smooth, time-based rotation instead.
 */
export function createGearGlideState(overrides = {}) {
  return {
    // Current rotation state
    rotation: 0,              // Radians
    rotationVelocity: 0,      // Radians per second

    // BPM tracking
    currentBPM: GEAR_GLIDE_CONFIG.DEFAULT_BPM,
    lastBeatTime: 0,
    beatPhase: 0,

    // Mechanical simulation
    torque: 1.0,
    wobblePhase: 0,

    // Beat snap
    lastBeatRotation: 0,
    beatSnapAccumulator: 0,

    ...overrides,
  };
}

// Legacy function - use getRotationAtTime() instead
export function updateGearGlide(state, deltaTime, currentBPM, config = {}) {
  console.warn('updateGearGlide is deprecated. Use getRotationAtTime() for smooth rotation.');
  const timeMs = performance.now(); // EXEMPT
  state.rotation = getRotationAtTime(timeMs, currentBPM, 90, config);
  return state;
}

/**
 * Get smooth, continuous clock-like rotation at absolute time
 *
 * CRITICAL: This uses absolute time, not delta accumulation.
 * This guarantees perfectly smooth rotation regardless of frame rate.
 * Like a clock: seamless, quantized to BPM, no wobble.
 *
 * @param {number} absoluteTimeMs - Absolute time since animation start (ms)
 * @param {number} bpm - Beats per minute
 * @param {number} degreesPerBeat - Rotation per beat (default: 90)
 * @param {Object} config - Optional config
 * @returns {number} Rotation in radians (smooth, continuous, clock-like)
 */
export function getRotationAtTime(absoluteTimeMs, bpm, degreesPerBeat = 90, config = {}) {
  const cfg = { ...GEAR_GLIDE_CONFIG, ...config };

  // Clamp BPM to valid range
  const safeBPM = clamp(bpm, cfg.MIN_BPM, cfg.MAX_BPM);

  // Convert to radians per second
  // Formula: radiansPerSecond = (degreesPerBeat * π / 180) * (BPM / 60)
  const radiansPerBeat = degreesPerBeat * Math.PI / 180;
  const beatsPerSecond = safeBPM / 60;
  const radiansPerSecond = radiansPerBeat * beatsPerSecond;

  // Convert time to seconds
  const timeSeconds = absoluteTimeMs * 0.001;

  // Calculate rotation: linear, continuous, clock-like
  // No wobble, no imperfection, just pure time * speed
  const rotation = radiansPerSecond * timeSeconds;

  return normalizeRotation(rotation);
}

/**
 * Normalize rotation to 0-2π range
 */
function normalizeRotation(rotation) {
  const twoPi = Math.PI * 2;
  let normalized = rotation % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

/**
 * Convert formula rotation to Phaser sprite rotation
 * Uses absolute time for smooth, continuous rotation.
 */
export function formulaToPhaserRotation(formula, time, bpm) {
  return getRotationAtTime(time, bpm || GEAR_GLIDE_CONFIG.DEFAULT_BPM);
}

/**
 * BPM-synced rotation formula (direct calculation, time-based)
 *
 * CRITICAL: Uses absolute time for smooth, continuous rotation.
 *
 * @param {number} bpm - Beats per minute
 * @param {number} degreesPerBeat - Rotation per beat (default: 90)
 * @param {number} timeMs - Absolute time in milliseconds
 * @returns {number} Rotation in radians
 */
export function getBPMRotation(bpm, degreesPerBeat = 90, timeMs) {
  return getRotationAtTime(timeMs, bpm, degreesPerBeat);
}

/**
 * BPM-synced rotation with optional beat pulse
 *
 * @param {number} bpm - Beats per minute
 * @param {number} degreesPerBeat - Rotation per beat
 * @param {number} timeMs - Absolute time in milliseconds
 * @param {Object} config - Config
 * @returns {Object} { rotation, pulse }
 */
export function getBPMRotationWithPulse(bpm, degreesPerBeat = 90, timeMs, config = {}) {
  const cfg = { ...GEAR_GLIDE_CONFIG, ...config };
  const safeBPM = clamp(bpm, cfg.MIN_BPM, cfg.MAX_BPM);

  // Base rotation (smooth, continuous, clock-like)
  const rotation = getRotationAtTime(timeMs, safeBPM, degreesPerBeat, cfg);

  // Beat pulse (for scale/glow effects, doesn't affect rotation)
  const pulse = getBeatPulse(timeMs, safeBPM, cfg);

  return {
    rotation,
    pulse,
  };
}

/**
 * Get beat pulse at absolute time
 * (For scale/glow effects on beat hits)
 */
function getBeatPulse(absoluteTimeMs, bpm, config) {
  const beatsPerSecond = bpm / 60;
  const beatDuration = 1 / beatsPerSecond;
  const timeSeconds = absoluteTimeMs * 0.001;

  // Position within current beat (0 to 1)
  const beatPosition = (timeSeconds % beatDuration) / beatDuration;

  // Subtle pulse in first 25% of beat
  if (beatPosition < 0.25) {
    return 1 + (beatPosition / 0.25) * config.BEAT_PULSE_AMOUNT;
  } else {
    return 1;
  }
}

/**
 * Multi-element synchronization
 * Rotates multiple elements with phase offsets (all clock-smooth)
 *
 * @param {number} bpm - Beats per minute
 * @param {Array} elements - [{ degreesPerBeat, phaseOffset }]
 * @param {number} timeMs - Absolute time in milliseconds
 * @returns {Array} [{ rotation, pulse }]
 */
export function syncMultipleElements(bpm, elements, timeMs) {
  return elements.map(element => {
    const { degreesPerBeat = 90, phaseOffset = 0 } = element;
    const baseRotation = getRotationAtTime(timeMs, bpm, degreesPerBeat);

    return {
      rotation: normalizeRotation(baseRotation + phaseOffset),
      pulse: 1, // Same pulse for all
    };
  });
}

/**
 * Calculate time for specific rotation angle
 * (Useful for animation timing)
 *
 * @param {number} targetAngle - Target rotation in radians
 * @param {number} bpm - Beats per minute
 * @param {number} degreesPerBeat - Rotation per beat
 * @returns {number} Time in milliseconds
 */
export function getTimeForRotation(targetAngle, bpm, degreesPerBeat = 90) {
  const radiansPerBeat = degreesPerBeat * Math.PI / 180;
  const beatsPerSecond = bpm / 60;
  const radiansPerSecond = radiansPerBeat * beatsPerSecond;

  return (targetAngle / radiansPerSecond) * 1000;
}

/**
 * Generate rotation keyframes for animation
 *
 * @param {number} bpm - Beats per minute
 * @param {number} duration - Animation duration (beats)
 * @param {number} degreesPerBeat - Rotation per beat
 * @returns {Array} [{ beat, rotation, timeMs }]
 */
export function generateRotationKeyframes(bpm, duration = 4, degreesPerBeat = 90) {
  const keyframes = [];
  const beatsPerSecond = bpm / 60;

  for (let beat = 0; beat <= duration; beat++) {
    const rotation = beat * degreesPerBeat * Math.PI / 180;
    const timeMs = (beat / beatsPerSecond) * 1000;

    keyframes.push({
      beat,
      rotation: normalizeRotation(rotation),
      timeMs,
    });
  }

  return keyframes;
}

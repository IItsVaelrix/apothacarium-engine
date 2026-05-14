/**
 * bytecodeAMP.js — Deterministic Procedural Signal System
 *
 * Provides synchronized, non-linear signals for visuals and audio processing.
 * Inspired by VerseIR Bytecode architecture.
 */

export const AMP_CHANNELS = {
  FLICKER: 'flicker', // High-frequency electronic jolt
  PULSE:   'pulse',   // Rhythmic breathing/ritual pulse
  GLOW:    'glow',    // Deep atmospheric fluctuation
  TORQUE:  'torque',   // Mechanical resistance/vibration
  NOISE:   'noise',   // High-order stochastic drift
};

/**
 * Returns a deterministic signal value [0, 1] for a given time and channel.
 */
export function getBytecodeAMP(timeMs, channel = AMP_CHANNELS.FLICKER) {
  const t = timeMs * 0.001; // Time in seconds

  switch (channel) {
    case AMP_CHANNELS.FLICKER: {
      // Compound high-frequency waves for 'tasteful' randomness
      const f1 = Math.sin(t * 41.3) * 0.4;
      const f2 = Math.sin(t * 17.7 + 2.1) * 0.4;
      const f3 = Math.sin(t * 83.1 + 0.9) * 0.2;
      return (f1 + f2 + f3 + 1) / 2;
    }

    case AMP_CHANNELS.PULSE:
      // Rhythmic ritual breathing (1.2 Hz)
      return Math.sin(t * 1.2 * Math.PI) * 0.5 + 0.5;

    case AMP_CHANNELS.GLOW:
      // Low-frequency atmospheric shift (0.12 Hz)
      return Math.sin(t * 0.12 * Math.PI) * 0.15 + 0.85;

    case AMP_CHANNELS.TORQUE:
      // High-order mechanical vibration
      return Math.sin(t * 2.7 * Math.PI) * 0.05 + 0.95;

    case AMP_CHANNELS.NOISE:
      // Deterministic fractal-like noise
      return (Math.sin(t * 113.7) * 0.3 + Math.sin(t * 227.1) * 0.2 + Math.sin(t * 454.3) * 0.5 + 1) / 2;

    default:
      return 0.5;
  }
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
 * @returns {number} Rotation in radians (smooth, continuous, clock-like)
 */
export function getRotationAtTime(absoluteTimeMs, bpm, degreesPerBeat = 90) {
  const safeBPM = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;

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

  const twoPi = Math.PI * 2;
  let normalized = rotation % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

/**
 * Bytecode-driven interpolation between two values using an AMP channel.
 */
export function lerpBytecodeAMP(min, max, timeMs, channel) {
  const amp = getBytecodeAMP(timeMs, channel);
  return min + (max - min) * amp;
}

/**
 * BPM-Synced Rotation Formula
 * Converts musical tempo to angular rotation for synchronized visuals.
 *
 * @param {number} bpm - Beats per minute (typically 60-180)
 * @param {number} baseSpeed - Rotations per beat (positive=CW, negative=CCW)
 * @param {number} timeMs - Current time in milliseconds
 * @returns {number} Rotation angle in radians
 */
export function getBPMRotationSpeed(bpm, baseSpeed, timeMs) {
  const safeBPM = Number.isFinite(bpm) && bpm > 0 ? bpm : 90;
  const safeBaseSpeed = Number.isFinite(baseSpeed) ? baseSpeed : 1;
  const safeTime = Number.isFinite(timeMs) ? timeMs : 0;

  // Convert BPM to beats per second
  const beatsPerSecond = safeBPM / 60;

  // Convert baseSpeed (rotations per beat) to radians per beat
  const radiansPerBeat = safeBaseSpeed * Math.PI * 2;

  // Calculate total rotation: time * beats/sec * radians/beat
  const totalSeconds = safeTime * 0.001;
  return totalSeconds * beatsPerSecond * radiansPerBeat;
}

/**
 * BPM-synced rotation with phase offset for layered elements.
 * @param {number} bpm - Beats per minute
 * @param {number} baseSpeed - Rotations per beat
 * @param {number} timeMs - Current time in milliseconds
 * @param {number} phaseOffset - Phase offset in radians (default: 0)
 * @returns {number} Rotation angle in radians
 */
export function getBPMRotationWithPhase(bpm, baseSpeed, timeMs, phaseOffset = 0) {
  const baseRotation = getBPMRotationSpeed(bpm, baseSpeed, timeMs);
  return baseRotation + phaseOffset;
}

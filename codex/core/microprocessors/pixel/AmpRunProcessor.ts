/**
 * Animation AMP Microprocessor
 * 
 * Bridges the Codex Animation AMP system with the Microprocessor Factory.
 * Allows animation intent resolution to be offloaded to WebWorkers.
 */

import { runAnimationAmp } from '../../animation/amp/runAnimationAmp.ts';
import { AnimationIntent } from '../../animation/contracts/animation.types.ts';

/**
 * Run Animation AMP in the microprocessor pipeline
 * 
 * @param {AnimationIntent} payload - The animation intent to process
 * @returns {Promise<Object>} Resolved motion output
 */
export async function runAmpProcessor(payload: AnimationIntent) {
  if (!payload) {
    throw new Error('AnimationIntent payload is required');
  }

  // Authoritative execution of the AMP runner
  return await runAnimationAmp(payload);
}

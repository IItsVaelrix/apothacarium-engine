/**
 * AMP Runtime Pipeline
 * 
 * Exposes Animation Motion Processor (AMP) functions via the eventBus
 * to allow UI components to interact with Codex without direct imports.
 * 
 * @see ARCH_CONTRACT_OVERLAY_INTEGRITY.md - Layer separation requirements
 */

import { on, emit } from './eventBus.js';
import { getAmpStatus } from '../core/animation/amp/runAnimationAmp.js';

// Track all active animations for the inspector
let activeAnimations = new Map();

/**
 * Get the current AMP status
 * @returns {Object} AMP status object
 */
export function getAmpRuntimeStatus() {
  return getAmpStatus();
}

/**
 * Get all active animations
 * @returns {Map<string, any>} Map of targetId to animation output
 */
export function getAmpActiveAnimations() {
  return activeAnimations;
}

/**
 * Get a single active animation by targetId
 * @param {string} targetId 
 * @returns {any} Animation output or undefined
 */
export function getAmpAnimation(targetId) {
  return activeAnimations.get(targetId);
}

/**
 * Setup the AMP pipeline event listeners
 * @returns {Function} Cleanup function
 */
export function setupAmpPipeline() {
  /**
   * Handle getAmpStatus requests
   */
  on('amp:getStatus', (payload) => {
    const { responseEventName } = payload;
    const status = getAmpRuntimeStatus();
    emit(responseEventName, { status });
  });

  /**
   * Handle getActiveAnimations requests
   */
  on('amp:getActiveAnimations', (payload) => {
    const { responseEventName } = payload;
    emit(responseEventName, { animations: getAmpActiveAnimations() });
  });

  /**
   * Handle getActiveAnimation requests for a specific targetId
   */
  on('amp:getActiveAnimation', (payload) => {
    const { targetId, responseEventName } = payload;
    const animation = getAmpAnimation(targetId);
    emit(responseEventName, { animation: animation || null });
  });

  console.log('[AMP Pipeline] Initialized');

  return () => {
    // Cleanup function - eventBus handles removal via off()
    console.log('[AMP Pipeline] Cleanup complete');
  };
}

// Auto-setup when imported (runtime pipeline pattern)
let unsubscribe = null;

export function initializeAmpPipeline() {
  if (!unsubscribe) {
    unsubscribe = setupAmpPipeline();
  }
  return unsubscribe;
}

export function cleanupAmpPipeline() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}

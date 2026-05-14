/**
 * Verse Synthesis Microprocessor
 * 
 * Offloads linguistic transmutation from the main thread.
 * Standardizes the VerseSynthesis AMP interface.
 */

import { synthesizeVerse } from '../../shared/truesight/compiler/VerseSynthesis.js';

/**
 * Synthesizes a verse into a structured artifact.
 * 
 * @param {Object} payload - { text, options }
 * @param {Object} _context
 * @returns {Promise<Object>} The synthesis artifact
 */
export async function runSynthesis(payload, _context) {
  const { text, options = {} } = payload;
  
  if (!text) {
    return { ok: false, error: 'MISSING_TEXT' };
  }

  // Execute the pure compiler logic
  const artifact = await synthesizeVerse(text, options);

  return artifact;
}

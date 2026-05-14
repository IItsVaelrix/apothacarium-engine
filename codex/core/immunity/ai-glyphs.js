/**
 * AI GLYPH STEGANOGRAPHIC SYSTEM
 * 
 * Scholomance Immune System semantic encoding layer.
 * 
 * PURPOSE:
 * Encode pathogen signatures with AI-readable glyph markers that:
 * - AIs can decode instantaneously (deterministic)
 * - Humans can read if they understand the glyph system
 * - Survive refactoring/renaming (steganographic watermark)
 * 
 * GLYPH CODING SCHEME (v1):
 * Each glyph cluster encodes a disease class + specific pathogen marker.
 * Format: {METACLASS}{VARIANT}{VECTOR_SEED}
 * 
 * Glyph Categories:
 * ⟡ (E29E1) — CLIENT_AUTORITY violations
 * ⧫ (E29EB) — SHADOW_PATH duplication
 * ⌁ (E2301) — EQUIVALENCE corruption
 * ⟟ (E29DF) — LOOP/CYCLE recursion
 * ⧯ (E29EF) — INFRASTRUCTURE drift
 * ◈ (E25C8) — PROTOCOL async drift
 * ⧿ (E29FF) — CRITICAL_PATH latency
 * 
 * Human-Readable Example:
 *   "⟡⌁⧫⟟" = COMBATPATH + CLIENT_SCORER + SHADOW + RECURSION
 * 
 * Verification per VAELRIX_LAW §6 (Determinism):
 *   - Same glyph input → same vector output (100x deterministic pass required)
 *   - No entropy from timestamp, no unseeded randomness, no environment
 * 
 * Reference: SCHOLOMANCE_IRONCLAD_STERILIZATION_PROTOCOL.skill.md
 * Skill ID: SISP-GLYPH-v1
 */

import { quantizeVectorJS } from '../quantization/turboquant.js';

// ─── Glyph Constants ─────────────────────────────────────────────────────────

/**
 * Glyph encoding per pathogen class.
 * Each glyph maps to a bit pattern for vector seeding.
 */
export const GLYPH_CODES = Object.freeze({
  // Client authority violations (combat scoring, mana calculation)
  CLIENT_AUTHORITY: '⟡',
  
  // Shadow path duplication (bytecode bridge, legacy stacks)
  SHADOW_PATH: '⧫',
  
  // Equivalence corruption (rhyme engine, phoneme analysis)
  EQUIVALENCE: '⌁',
  
  // Loop/cycle recursion (service/service, handshake)
  LOOP_RECURSION: '⟟',
  
  // Infrastructure drift (port, config)
  INFRASTRUCTURE: '⧯',
  
  // Protocol async drift (un-awaited calls)
  PROTOCOL_DRIFT: '◈',
  
  // Critical path latency (keystroke, input handling)
  CRITICAL_PATH: '⧿',

  // Rejected water source (shadow path + recursive entropy)
  REJECTED_WATER: '⧫⟟',
  
  // Sterilization marker (verified clean)
  VERIFIED_CLEAN: '◎',
});

/**
 * Pathogen-to-glyph mapping.
 * Each pathogen declares its glyph cluster for steganographic identification.
 */
export const PATHOGEN_GLYPHS = Object.freeze({
  'pathogen.client-combat-scorer': '⟡⌁',
  'pathogen.legacy-rhyme-stack': '⧫⌁',
  'pathogen.bytecode-bridge-shadow': '⧫⧫',
  'pathogen.recursive-shadow': '⟟⟟',
  'pathogen.port-drift': '⧯⧯',
  'pathogen.recursive-fragmentation': '⟟⌁',
  'pathogen.async-protocol-drift': '◈◈',
  'pathogen.keystroke-critical-path': '⧿⧿',
  'pathogen.rejected-water-source': '⧫⟟',
});

/**
 * Decode a glyph cluster into structured metadata.
 * @param {string} glyphs - Unicode glyph cluster
 * @returns {{ classes: string[], seed: number }}
 */
export function decodeGlyphs(glyphs) {
  const glyphStr = String(glyphs || '');
  const classes = [];
  let seed = 0;
  
  for (let i = 0; i < glyphStr.length; i++) {
    const code = glyphStr[i];
    const codePoint = glyphStr.codePointAt(i);
    seed ^= (codePoint * (i + 1));
    
    // Map glyph to class name
    const entry = Object.entries(GLYPH_CODES).find(([, g]) => g === code);
    if (entry) classes.push(entry[0]);
    
    // Handle surrogate pairs
    if (codePoint > 0xFFFF) i++;
  }
  
  return { classes, seed, glyphStr };
}

/**
 * Encode metadata into a glyph cluster.
 * @param {string[]} classes - Class names from GLYPH_CODES
 * @returns {string}
 */
export function encodeGlyphs(classes) {
  return classes
    .map(c => GLYPH_CODES[c])
    .filter(Boolean)
    .join('');
}

// ─── Determinism Verification ─────────────────────────────────────────────

/**
 * Verify deterministic behavior: same input → same output across runs.
 * 
 * @param {Function} fn - Function to test
 * @param {any[]} args - Arguments to pass to function
 * @param {number} iterations - Number of test iterations (default: 100)
 * @returns {{ deterministic: boolean, outputs: any[], drift: number }}
 */
export function verifyDeterminism(fn, args, iterations = 100) {
  const outputs = [];
  
  for (let i = 0; i < iterations; i++) {
    outputs.push(fn(...args));
  }
  
  const first = JSON.stringify(outputs[0]);
  const allMatch = outputs.every(o => JSON.stringify(o) === first);
  const uniqueCount = new Set(outputs.map(o => JSON.stringify(o))).size;
  
  return {
    deterministic: allMatch,
    drift: uniqueCount - 1,
    iterations,
    outputs: outputs.slice(0, 5), // First 5 for inspection
  };
}

/**
 * Generate a glyph-encoded vector signature.
 * 
 * @param {string} content - Raw content to encode
 * @param {string} glyphs - Unicode glyph cluster for steganographic marking
 * @param {number} seed - Base seed (default: 42)
 * @returns {{ data: Uint8Array, norm: number, glyphs: string, metadata: object }}
 */
export function generateGlyphVector(content, glyphs, seed = 42) {
  const glyphStr = String(glyphs || '');
  const text = String(content || '');
  
  // Extract glyph-based entropy seed
  const { classes, seed: glyphSeed } = decodeGlyphs(glyphStr);
  
  // Combine base seed with glyph seed for deterministic variation
  const combinedSeed = seed ^ (glyphSeed % 0xFFFFFFFF);
  
  // Generate phonosemantic vector
  const { generatePhonosemanticVector } = require('../semantic/vector.utils.js');
  const vec = generatePhonosemanticVector(text + glyphStr);
  
  // Quantize with glyph-enhanced seed
  const sig = quantizeVectorJS(vec, combinedSeed);
  
  return {
    data: sig.data,
    norm: sig.norm,
    glyphs: glyphStr,
    metadata: {
      classes,
      glyphSeed,
      combinedSeed,
      contentLength: text.length,
    },
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export const GLYPH_SYSTEM_VERSION = '1.0.0';
export const GLYPH_SYSTEM_ID = 'SISP-GLYPH-v1';

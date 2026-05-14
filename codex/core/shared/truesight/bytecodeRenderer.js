/**
 * Visual Bytecode Renderer
 *
 * Decodes per-token VisualBytecode into CSS classes and custom properties.
 * The bytecode is produced by Codex VerseIR amplifier (phoneticColor.js).
 *
 * ─── BYTECODE SCHEMA ─────────────────────────────────────────────────────
 *
 * VisualBytecode {
 *   version: 2,
 *   school: "SONIC" | "PSYCHIC" | "VOID" | "ALCHEMY" | "WILL" | null,
 *   color: string,                    // authoritative HSL color from backend
 *   glowIntensity: 0.0–1.0,           // earned from connection count × anchor status
 *   saturationBoost: 0.0–1.0,         // phonetic weight + stress + rarity
 *   syllableDepth: integer,           // syllables in token
 *   isAnchor: boolean,                // anchors a rhyme cluster (2+ connections)
 *   isStopWord: boolean,
 *   effectClass: "INERT" | "RESONANT" | "HARMONIC" | "TRANSCENDENT"
 * }
 *
 * Effect class derivation:
 *   INERT:         stop words or no resonance signal
 *   RESONANT:      has proximity peer within 3 tokens
 *   HARMONIC:      2+ syllables OR glowIntensity > 0.5
 *   TRANSCENDENT:  isAnchor OR (3+ syllables + glowIntensity > 0.7)
 *
 * Producer: codex/core/verseir-amplifier/plugins/phoneticColor.js
 * Attachment point: VerseTokenIR.visualBytecode
 * ──────────────────────────────────────────────────────────────────────────
 */

import { getVisemeStyles } from "./color/visemeMapping.js";

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * Decode a VisualBytecode object into inline style (CSS custom properties)
 * and a className string for the word element.
 *
 * @param {object} bytecode - VisualBytecode object
 * @param {object} options
 * @param {boolean} options.reducedMotion - halve glow intensity, suppress transitions
 * @param {string}  options.theme - "dark" | "light"
 * @returns {{ style: object, className: string, color: string | null }}
 */
export function decodeBytecode(bytecode, { reducedMotion = false, theme = "dark" } = {}) {
  const {
    effectClass,
    school,
    color,
    glowIntensity,
    saturationBoost,
    syllableDepth,
    isAnchor,
    biophysical // Biophysical metrics from VerseIRChromaEngine
  } = bytecode;

  if (effectClass === "INERT") {
    return { style: {}, className: "", color: color || null };
  }

  const intensityScale = theme === "light" ? 0.7 : 1;
  const finalGlow = clamp01((reducedMotion ? glowIntensity * 0.5 : glowIntensity) * intensityScale);
  const finalSaturation = clamp01(saturationBoost);

  // Viseme-to-CSS Mapping (for TrueSight rhymes only)
  const visemeStyles = getVisemeStyles(biophysical, isAnchor);

  const style = {
    "--vb-glow-intensity": finalGlow,
    "--vb-saturation-boost": finalSaturation,
    "--vb-syllable-depth": syllableDepth,
    ...visemeStyles
  };

  const classes = [`vb-effect--${effectClass.toLowerCase()}`];
  if (school) classes.push(`vb-school--${school.toLowerCase()}`);
  if (isAnchor) classes.push("vb-anchor");

  return { style, className: classes.join(" "), color: color || null };
}

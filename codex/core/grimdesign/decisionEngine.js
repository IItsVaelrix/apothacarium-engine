/**
 * GrimDesign Decision Engine
 *
 * Pure function. Maps a GrimSignal to a GrimDesignDecisions object using
 * deterministic mapping tables keyed on effectClass, dominantSchool, and rarity.
 *
 * No side effects, no I/O, no imports beyond the signal shape.
 * Every visual decision has a traceable source in the signal.
 */

// ─── Mapping tables ───────────────────────────────────────────────────────────

const EFFECT_DECISIONS = Object.freeze({
  INERT: Object.freeze({
    borderAlpha: 0.15,
    glowRadius: 0,
    animationClass: null,
    animationDurationMs: 0,
    atmosphereLevel: 'none',
    scanlines: false,
  }),
  RESONANT: Object.freeze({
    borderAlpha: 0.35,
    glowRadius: 8,
    animationClass: 'grim-pulse',
    animationDurationMs: 2400,
    atmosphereLevel: 'faint',
    scanlines: false,
  }),
  HARMONIC: Object.freeze({
    borderAlpha: 0.55,
    glowRadius: 16,
    animationClass: 'grim-breathe',
    animationDurationMs: 1600,
    atmosphereLevel: 'present',
    scanlines: false,
  }),
  TRANSCENDENT: Object.freeze({
    borderAlpha: 0.85,
    glowRadius: 28,
    animationClass: 'grim-shimmer',
    animationDurationMs: 800,
    atmosphereLevel: 'full',
    scanlines: true,
  }),
});

const SCHOOL_CHARACTER = Object.freeze({
  SONIC:       Object.freeze({ transitionMs: 210, fontWeight: 700 }),
  PSYCHIC:     Object.freeze({ transitionMs: 280, fontWeight: 400 }),
  ALCHEMY:     Object.freeze({ transitionMs: 300, fontWeight: 400 }),
  WILL:        Object.freeze({ transitionMs: 360, fontWeight: 400 }),
  VOID:        Object.freeze({ transitionMs: 520, fontWeight: 300 }),
  NECROMANCY:  Object.freeze({ transitionMs: 400, fontWeight: 400 }),
  ABJURATION:  Object.freeze({ transitionMs: 320, fontWeight: 400 }),
  DIVINATION:  Object.freeze({ transitionMs: 350, fontWeight: 400 }),
});

const DEFAULT_SCHOOL_CHARACTER = Object.freeze({ transitionMs: 320, fontWeight: 400 });

const RARITY_VISUAL = Object.freeze({
  COMMON:      Object.freeze({ fontSizeRem: 0.78, paddingScale: 'tight',     ornament: false }),
  RARE:        Object.freeze({ fontSizeRem: 0.85, paddingScale: 'standard',  ornament: true  }),
  INEXPLICABLE:Object.freeze({ fontSizeRem: 0.95, paddingScale: 'generous',  ornament: true  }),
});

// ─── glowRadius from raw intensity (PDR §6.2) ─────────────────────────────────

function glowRadiusFromIntensity(glowIntensity) {
  const g = Number(glowIntensity) || 0;
  if (g === 0) return 0;
  if (g <= 0.3) return 4;
  if (g <= 0.6) return 12;
  if (g <= 0.8) return 20;
  return 32;
}

// ─── componentComplexity from syllableDepth (PDR §6.2) ────────────────────────

function complexityFromSyllableDepth(syllableDepth) {
  return Math.max(1, Math.min(4, Math.round(Number(syllableDepth) || 1)));
}

// ─── World-law reason sentence ─────────────────────────────────────────────────

function buildWorldLawReason(dominantSchool, effectClass, blendedHsl) {
  const school = dominantSchool && dominantSchool !== 'DEFAULT' ? dominantSchool : 'neutral';
  const { h, s, l } = blendedHsl;
  return `${school}-school phonemic character (effectClass ${effectClass}) at hsl(${h}, ${s}%, ${l}%)`;
}

// ─── CSS custom properties ─────────────────────────────────────────────────────

function buildCssVars(h, s, l, effect, schoolChar, rarityVisual) {
  const colorMutedL = Math.min(75, l + 15);
  const glowL      = Math.min(75, l + 20);
  return Object.freeze({
    '--grim-color':       `hsl(${h}, ${s}%, ${l}%)`,
    '--grim-color-muted': `hsl(${h}, ${s}%, ${colorMutedL}%)`,
    '--grim-glow':        effect.glowRadius > 0
      ? `0 0 ${effect.glowRadius}px hsla(${h}, ${s}%, ${glowL}%, 0.5)`
      : 'none',
    '--grim-border':      `1px solid hsla(${h}, ${s}%, ${colorMutedL}%, ${effect.borderAlpha})`,
    '--grim-transition':  `${schoolChar.transitionMs}ms ease-in-out`,
    '--grim-font-size':   `${rarityVisual.fontSizeRem}rem`,
    '--grim-font-weight': String(schoolChar.fontWeight),
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Maps a GrimSignal to a complete set of design decisions.
 *
 * @param {import('./signalExtractor').GrimSignal} signal
 * @returns {GrimDesignDecisions}
 */
export function resolveDesignDecisions(signal) {
  const {
    dominantSchool = 'VOID',
    effectClass = 'INERT',
    glowIntensity = 0,
    blendedHsl = { h: 174, s: 42, l: 46 },
    syllableDepth = 1,
    rarity = 'COMMON',
    provenance = [],
  } = signal || {};

  const effect      = EFFECT_DECISIONS[effectClass]      || EFFECT_DECISIONS.INERT;
  const schoolChar  = SCHOOL_CHARACTER[dominantSchool]   || DEFAULT_SCHOOL_CHARACTER;
  const rarityVisual = RARITY_VISUAL[rarity]             || RARITY_VISUAL.COMMON;

  const { h, s, l } = blendedHsl;
  const color      = `hsl(${h}, ${s}%, ${l}%)`;
  const colorMuted = `hsl(${h}, ${s}%, ${Math.min(75, l + 15)}%)`;
  const glowColor  = `hsla(${h}, ${s}%, ${Math.min(75, l + 20)}%, 0.5)`;

  // glowRadius is derived from the raw intensity (PDR §6.2), not from the
  // effectClass table directly — lets the radius reflect continuous signal
  // strength rather than just tier boundaries.
  const glowRadius = glowRadiusFromIntensity(glowIntensity);

  const componentComplexity = complexityFromSyllableDepth(syllableDepth);
  const cssVars = buildCssVars(h, s, l, effect, schoolChar, rarityVisual);

  return {
    // Color
    color,
    colorMuted,
    glowColor,

    // Geometry
    borderAlpha:         effect.borderAlpha,
    glowRadius,
    paddingScale:        rarityVisual.paddingScale,
    componentComplexity,

    // Motion
    transitionMs:        schoolChar.transitionMs,
    animationClass:      effect.animationClass,
    animationDurationMs: effect.animationDurationMs,

    // Atmosphere
    atmosphereLevel:     effect.atmosphereLevel,
    scanlines:           effect.scanlines,

    // Typography
    fontSizeRem:  rarityVisual.fontSizeRem,
    fontWeight:   schoolChar.fontWeight,
    ornament:     rarityVisual.ornament,

    // CSS custom properties — ready to inject as inline vars or a style block
    cssVars,

    // Provenance
    worldLawReason: buildWorldLawReason(dominantSchool, effectClass, blendedHsl),
    provenance:     Array.isArray(provenance) ? provenance : [],
  };
}

/**
 * @typedef {Object} GrimDesignDecisions
 * @property {string} color               - hsl(h, s%, l%)
 * @property {string} colorMuted          - hsl(h, s%, l%) at +15% lightness
 * @property {string} glowColor           - hsla(…, 0.5)
 * @property {number} borderAlpha         - 0.15 – 0.85
 * @property {number} glowRadius          - px — 0, 4, 12, 20, 32
 * @property {'tight'|'standard'|'generous'} paddingScale
 * @property {1|2|3|4} componentComplexity
 * @property {number} transitionMs        - 180 – 600
 * @property {string|null} animationClass - CSS class name or null
 * @property {number} animationDurationMs - 0 | 800 | 1600 | 2400
 * @property {'none'|'faint'|'present'|'full'} atmosphereLevel
 * @property {boolean} scanlines
 * @property {number} fontSizeRem         - 0.78 – 0.95
 * @property {300|400|700} fontWeight
 * @property {boolean} ornament
 * @property {Record<string, string>} cssVars
 * @property {string} worldLawReason
 * @property {string[]} provenance
 */

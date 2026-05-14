/**
 * src/lib/truesight/color/oklch.js
 * 
 * OKLCh Perceptual Color Space Primitives
 * 
 * OKLCh provides a perceptually uniform color space where:
 * - L: Lightness (0-1)
 * - C: Chroma (0-~0.4)
 * - h: Hue (0-360)
 * 
 * This module enables accurate ΔE calculations and uniform color modulation.
 */

/**
 * Converts OKLCh to sRGB Hex string.
 */
export function oklchToHex(l, c, h) {
  const { r, g, b } = oklchToRgb(l, c, h);
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * OKLCh to sRGB conversion (D65)
 */
export function oklchToRgb(l, c, h) {
  const hRad = (h * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;

  const l_3 = l_ * l_ * l_;
  const m_3 = m_ * m_ * m_;
  const s_3 = s_ * s_ * s_;

  const r = +4.0767416621 * l_3 - 3.3077115913 * m_3 + 0.2309699292 * s_3;
  const g = -1.2684380046 * l_3 + 2.6097574011 * m_3 - 0.3413193965 * s_3;
  const b_ = -0.0041960863 * l_3 - 0.7034186147 * m_3 + 1.7076147010 * s_3;

  return { 
    r: clamp(r, 0, 1), 
    g: clamp(g, 0, 1), 
    b: clamp(b_, 0, 1) 
  };
}

/**
 * Perceptual Color Distance (ΔE) in OKLCh
 */
export function deltaE(c1, c2) {
  const dL = c1.l - c2.l;
  const dC = c1.c - c2.c;
  const dh = (c1.h - c2.h) * Math.PI / 180;
  
  // Chord distance for hue to handle wrapping
  const dH = 2 * Math.sqrt(c1.c * c2.c) * Math.sin(dh / 2);
  
  return Math.sqrt(dL * dL + dC * dC + dH * dH);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

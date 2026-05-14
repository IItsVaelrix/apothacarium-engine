/**
 * POSTER RENDERER
 *
 * Composes an apothacarium scene (lattice + palette + CRT pass) into a
 * canvas image. Uses node-canvas server-side; in the browser, the same
 * code runs against an HTMLCanvasElement.
 *
 * The CRT extension is applied as the mandatory final render pass per
 * PDR §6 "CRT Texture Layer".
 */

import { styleCRT } from '../core/extensions/style-extensions.js';

let _createCanvas = null;
async function getCreateCanvas() {
  if (_createCanvas) return _createCanvas;
  try {
    const mod = await import('canvas');
    _createCanvas = mod.createCanvas;
  } catch {
    _createCanvas = null;
  }
  return _createCanvas;
}

function resolveBgColor(palette) {
  const idx = palette?.use?.bg;
  if (Number.isFinite(idx) && palette.colors[idx]) return palette.colors[idx];
  return '#0A0A0A';
}

function resolveCabinetColor(palette) {
  const idx = palette?.use?.cabinet;
  if (Number.isFinite(idx) && palette.colors[idx]) return palette.colors[idx];
  return '#3E2723';
}

function resolveBorderColor(palette) {
  const idx = palette?.use?.borders;
  if (Number.isFinite(idx) && palette.colors[idx]) return palette.colors[idx];
  return resolveCabinetColor(palette);
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '');
  if (clean.length !== 6) return [0, 0, 0];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/**
 * Render a scene to a square buffer at scaledSize x scaledSize pixels.
 * The lattice may be non-square; we letterbox into a square buffer
 * because styleCRT.onRender assumes square dimensions.
 *
 * @param {Object} scene - { lattice, palette, rules }
 * @param {Object} [options] - { scaledSize?: 512, applyCrt?: true }
 * @returns {Promise<{canvas, buffer, width, height, scaledSize}>}
 */
export async function renderScene(scene, options = {}) {
  const { lattice, palette, rules = {} } = scene;
  const scaledSize = options.scaledSize || 512;
  const applyCrt = options.applyCrt !== false;

  const createCanvas = await getCreateCanvas();
  if (!createCanvas) {
    throw new Error("poster-renderer: node-canvas is not installed. Run `npm install canvas`.");
  }

  // Compose the lattice onto an internal square logical buffer.
  // Use letterboxing so non-square lattices are preserved aspect-correctly.
  const canvas = createCanvas(scaledSize, scaledSize);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Background
  ctx.fillStyle = resolveBgColor(palette);
  ctx.fillRect(0, 0, scaledSize, scaledSize);

  // Compute letterbox: fit lattice (lattice.width x lattice.height) into scaledSize x scaledSize.
  const latticeW = lattice.width;
  const latticeH = lattice.height;
  const scale = Math.floor(Math.min(scaledSize / latticeW, scaledSize / latticeH));
  const drawW = latticeW * scale;
  const drawH = latticeH * scale;
  const offsetX = Math.floor((scaledSize - drawW) / 2);
  const offsetY = Math.floor((scaledSize - drawH) / 2);

  // Draw cabinet base under cells
  ctx.fillStyle = resolveCabinetColor(palette);
  ctx.fillRect(offsetX, offsetY, drawW, drawH);

  // Cells
  const cellSize = lattice.cellSize * scale;
  lattice.cells.forEach((cell) => {
    ctx.fillStyle = cell.color || '#444';
    const cx = offsetX + cell.col * cellSize;
    const cy = offsetY + cell.row * cellSize;
    ctx.fillRect(cx, cy, cellSize, cellSize);
    if (cell.emphasis && cell.emphasis > 0.75) {
      ctx.shadowColor = cell.color;
      ctx.shadowBlur = 6 * cell.emphasis;
      ctx.fillRect(cx, cy, cellSize, cellSize);
      ctx.shadowBlur = 0;
    }
  });

  // Frame border
  ctx.strokeStyle = resolveBorderColor(palette);
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX + 1, offsetY + 1, drawW - 2, drawH - 2);

  if (applyCrt) {
    // Pull the buffer, run through styleCRT, write back.
    const imageData = ctx.getImageData(0, 0, scaledSize, scaledSize);
    // Apply rules override on top of defaults
    if (rules.crt) {
      Object.assign(styleCRT.config, {
        scanlineIntensity: rules.crt.scanlineIntensity ?? styleCRT.config.scanlineIntensity,
        curvature: rules.crt.curvature ?? styleCRT.config.curvature,
        phosphorGlow: rules.crt.phosphorGlow ?? styleCRT.config.phosphorGlow,
        chromaBlur: rules.crt.chromaBlur ?? styleCRT.config.chromaBlur,
      });
    }
    const transformed = styleCRT.hooks.onRender(imageData.data, {});
    const out = ctx.createImageData(scaledSize, scaledSize);
    out.data.set(transformed);
    ctx.putImageData(out, 0, 0);
  }

  return {
    canvas,
    buffer: canvas.toBuffer('image/png'),
    width: scaledSize,
    height: scaledSize,
    scaledSize,
    bounds: { offsetX, offsetY, drawW, drawH },
  };
}

/**
 * Validate a rendered scene against no-modernity rules (PDR §6).
 * Cheap sampling: scan random pixels for forbidden colors / brightness.
 */
export function validateNoModernity(imageData, rules) {
  const data = imageData?.data || imageData;
  if (!data) return { ok: false, violations: ['no image data'] };
  const forbidden = new Set((rules?.noModernity?.forbiddenColors || []).map(c => c.toUpperCase()));
  const maxBri = rules?.noModernity?.maxBrightnessRgb ?? 240;
  const violations = [];
  const samples = 1000;
  const step = Math.max(1, Math.floor(data.length / 4 / samples));
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > maxBri && g > maxBri && b > maxBri) {
      violations.push({ idx: i, kind: 'led-brightness', rgb: [r, g, b] });
      break;
    }
    const hex = ('#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')).toUpperCase();
    if (forbidden.has(hex)) {
      violations.push({ idx: i, kind: 'neon-forbidden', hex });
      break;
    }
  }
  return { ok: violations.length === 0, violations };
}

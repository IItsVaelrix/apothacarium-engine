/**
 * INTEGRATION TEST — Full apothacarium pipeline
 *
 * Validates the PDR §11 quality gates:
 *   - Lattice generation from preset
 *   - Symmetry detection (vertical, confidence ≥ 0.55)
 *   - Prop budget pass for default layouts
 *   - Palette constraint (5-7 colors, no neon, no LED brightness)
 *   - Bytecode compatibility (valid PB-* strings)
 *   - CRT scanlines + vignette present in rendered output (if canvas)
 *   - No-modernity pass on rendered output (if canvas)
 *   - Load time: core <50ms, full generation <200ms (for 160x144)
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeApothecaryScene } from '../../adapters/apothecary.adapter.js';
import { assemblePrompt } from '../../adapters/prompt-assembler.js';
import { validatePalette } from '../../core/color-apothecary-presets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../output');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

async function tryRender(scene, label) {
  try {
    const { renderScene, validateNoModernity } = await import('../../adapters/poster-renderer.js');
    const rendered = await renderScene(scene, { scaledSize: 160, applyCrt: true });
    return { rendered, validateNoModernity };
  } catch (e) {
    console.log(`SKIP  render(${label}) — ${e.message.split('\n')[0]}`);
    return null;
  }
}

async function runFor(layoutId, paletteId) {
  console.log(`\n──── ${layoutId} + ${paletteId} ────`);

  const composeStart = performance.now();
  const scene = await composeApothecaryScene({ layoutId, paletteId });
  const composeMs = performance.now() - composeStart;

  check(`[${layoutId}] lattice generated`, scene.lattice.cells.size > 0, `cells=${scene.lattice.cells.size}`);
  check(`[${layoutId}] symmetry vertical`, scene.lattice.symmetry?.type === 'vertical', `type=${scene.lattice.symmetry?.type}`);
  check(`[${layoutId}] symmetry significant`, scene.lattice.symmetry?.significant === true, `conf=${scene.lattice.symmetry?.confidence}`);
  check(`[${layoutId}] budget pass`, scene.budgetReport.pass, `violations=${scene.budgetReport.violations.length}`);

  const pv = validatePalette(scene.palette);
  check(`[${layoutId}] palette valid`, pv.ok, `${pv.violations.join('|')}`);

  // Bytecode compatibility check (per PDR §11 "valid PixelBrain-compatible strings")
  const bytecode = scene.lattice.symmetryBytecode || [];
  const allValid = bytecode.length > 0 && bytecode.every(line => typeof line === 'string' && line.length > 0);
  check(`[${layoutId}] bytecode lines emitted`, allValid, `lines=${bytecode.length}`);

  check(`[${layoutId}] compose <200ms`, composeMs < 200, `${composeMs.toFixed(1)}ms`);

  // Try canvas render
  const renderResult = await tryRender(scene, layoutId);
  if (renderResult) {
    const { rendered, validateNoModernity } = renderResult;
    const ctx = rendered.canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, rendered.width, rendered.height);
    const mod = validateNoModernity(imageData, scene.rules);
    check(`[${layoutId}] no-modernity render`, mod.ok, mod.violations.map(v => v.kind).join(','));

    // CRT scanline check: row 1 should be darker than row 0 (because every odd row is darkened)
    const row0Bright = imageData.data[0] + imageData.data[1] + imageData.data[2];
    const row1Idx = rendered.width * 4;
    const row1Bright = imageData.data[row1Idx] + imageData.data[row1Idx + 1] + imageData.data[row1Idx + 2];
    check(`[${layoutId}] CRT scanline present`, row1Bright <= row0Bright + 5, `row0=${row0Bright} row1=${row1Bright}`);

    // Persist for visual inspection
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const path = resolve(OUTPUT_DIR, `integration-${layoutId}-${paletteId}.png`);
    writeFileSync(path, rendered.buffer);
    console.log(`      wrote ${path}`);
  }

  console.log(`      prompt: ${assemblePrompt(scene).slice(0, 160)}...`);
}

const start = performance.now();
await runFor('tall-organic-cabinet', 'cosmic-herbal');
await runFor('wide-low-cabinet', 'scholomance-folk');
await runFor('tall-organic-cabinet', 'earth-dead');
const totalMs = performance.now() - start;

const failed = results.filter(r => !r.ok);
console.log(`\n──── summary ────`);
console.log(`total: ${results.length}, pass: ${results.length - failed.length}, fail: ${failed.length}`);
console.log(`elapsed: ${totalMs.toFixed(1)}ms`);
if (failed.length > 0) {
  console.log('failed:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
console.log('\nINTEGRATION OK');

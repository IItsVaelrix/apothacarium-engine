#!/usr/bin/env node
/**
 * APOTHACARIUM CLI
 *
 * Usage:
 *   node adapters/cli.js [--layout <id>] [--palette <id>] [--size <px>] [--out <path>] [--no-crt]
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composeApothecaryScene, listLayouts } from './apothecary.adapter.js';
import { renderScene, validateNoModernity } from './poster-renderer.js';
import { assemblePrompt } from './prompt-assembler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = { layoutId: 'tall-organic-cabinet', paletteId: 'cosmic-herbal', size: 512, applyCrt: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--layout') args.layoutId = argv[++i];
    else if (a === '--palette') args.paletteId = argv[++i];
    else if (a === '--size') args.size = parseInt(argv[++i], 10);
    else if (a === '--out') args.outPath = argv[++i];
    else if (a === '--no-crt') args.applyCrt = false;
    else if (a === '--list-layouts') args.list = true;
    else if (a === '--prompt-only') args.promptOnly = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.list) {
    const layouts = await listLayouts();
    for (const l of layouts) console.log(`${l.id}\t${l.cols}x${l.rows}\t${l.name}`);
    return;
  }

  const start = performance.now();
  const scene = await composeApothecaryScene({ layoutId: args.layoutId, paletteId: args.paletteId });
  const composeMs = (performance.now() - start).toFixed(1);

  console.log(`scene: ${scene.lattice.cols}x${scene.lattice.rows} cells, ${scene.lattice.cells.size} occupied`);
  console.log(`palette: ${scene.palette.name} (${scene.paletteReport.ok ? 'OK' : 'INVALID'})`);
  console.log(`budget: ${scene.budgetReport.pass ? 'PASS' : 'FAIL'} counts=${JSON.stringify(scene.budgetReport.counts)}`);
  if (!scene.budgetReport.pass) {
    console.log(`  violations:`, scene.budgetReport.violations);
  }
  console.log(`compose: ${composeMs} ms`);

  if (args.promptOnly) {
    console.log('---');
    console.log(assemblePrompt(scene));
    return;
  }

  const renderStart = performance.now();
  const rendered = await renderScene(scene, { scaledSize: args.size, applyCrt: args.applyCrt });
  const renderMs = (performance.now() - renderStart).toFixed(1);
  console.log(`render: ${renderMs} ms (${rendered.width}x${rendered.height})`);

  const outDir = resolve(REPO_ROOT, 'output');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = args.outPath
    ? (isAbsolute(args.outPath) ? args.outPath : resolve(process.cwd(), args.outPath))
    : resolve(outDir, `${args.layoutId}--${args.paletteId}--${args.size}.png`);
  writeFileSync(outPath, rendered.buffer);
  console.log(`wrote: ${outPath}`);

  const imageData = rendered.canvas.getContext('2d').getImageData(0, 0, rendered.width, rendered.height);
  const modernity = validateNoModernity(imageData, scene.rules);
  console.log(`no-modernity: ${modernity.ok ? 'PASS' : 'FAIL'}`);
  if (!modernity.ok) console.log(`  violations:`, modernity.violations);

  console.log('---');
  console.log('prompt:', assemblePrompt(scene));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

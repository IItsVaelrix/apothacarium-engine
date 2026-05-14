import { composeApothecaryScene, listLayouts } from '../adapters/apothecary.adapter.js';
import { assemblePrompt } from '../adapters/prompt-assembler.js';

console.log('=== layouts ===');
const layouts = await listLayouts();
for (const l of layouts) console.log(`  ${l.id} (${l.cols}x${l.rows}) "${l.name}"`);

console.log('=== compose: tall-organic-cabinet + cosmic-herbal ===');
const t0 = performance.now();
const sceneA = await composeApothecaryScene({ layoutId: 'tall-organic-cabinet', paletteId: 'cosmic-herbal' });
const t1 = performance.now();
console.log(`compose: ${(t1 - t0).toFixed(1)}ms`);
console.log(`cells: ${sceneA.lattice.cells.size}`);
console.log(`palette report:`, sceneA.paletteReport);
console.log(`budget report:`, sceneA.budgetReport);

console.log('=== compose: wide-low-cabinet + scholomance-folk ===');
const sceneB = await composeApothecaryScene({ layoutId: 'wide-low-cabinet', paletteId: 'scholomance-folk' });
console.log(`cells: ${sceneB.lattice.cells.size}`);
console.log(`budget report:`, sceneB.budgetReport);

console.log('=== prompt assembly ===');
console.log(assemblePrompt(sceneA));
console.log('---');
console.log(assemblePrompt(sceneB));

console.log('---');
console.log('Phase 3 smoke OK');

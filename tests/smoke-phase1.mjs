import { generateApothecaryLattice, validatePropBudget, paintCell } from '../core/lattice-grid-engine.js';
import { detectSymmetry, applySymmetryToLattice, DEFAULT_APOTHECARY_SIGNIFICANCE_THRESHOLD } from '../core/symmetry-amp.js';

console.log('threshold default:', DEFAULT_APOTHECARY_SIGNIFICANCE_THRESHOLD);

// minimal preset
const preset = {
  id: 'cabinet-test',
  cols: 16,
  rows: 24,
  cellSize: 8,
  propSlots: [
    { col: 2, row: 4, prop: { category: 'jars' }, color: '#4A7C59', emphasis: 0.9 },
    { col: 3, row: 4, prop: { category: 'jars' }, color: '#4A7C59', emphasis: 0.9 },
    { col: 5, row: 4, prop: { category: 'jars' }, color: '#4A7C59', emphasis: 0.9 },
    { col: 7, row: 4, prop: { category: 'jars' }, color: '#B8746E', emphasis: 0.7 },
    { col: 4, row: 2, prop: { category: 'herbs' }, color: '#5B8C5A', emphasis: 0.8 },
    { col: 6, row: 2, prop: { category: 'herbs' }, color: '#5B8C5A', emphasis: 0.8 },
    { col: 5, row: 20, prop: { category: 'mushrooms' }, color: '#3E2723', emphasis: 0.85 },
  ],
  budget: {
    jars: [9, 14],
    herbs: [3, 5],
    mushrooms: [2, 4],
  },
};

const lattice = generateApothecaryLattice(preset);
console.log('lattice cells:', lattice.cells.size);
console.log('symmetry:', lattice.symmetry?.type, 'confidence:', lattice.symmetry?.confidence);
console.log('budget pass:', lattice.budgetReport?.pass, 'counts:', lattice.budgetReport?.counts);
console.log('violations:', lattice.budgetReport?.violations);
console.log('bytecode lines:', lattice.symmetryBytecode?.length);

// Verify paintCell still works
paintCell(lattice, 8, 12, '#FFBF00');
console.log('after paint:', lattice.cells.has('8,12'));

// Sanity-check pure detectSymmetry doesn't crash on synthetic pixel data
const pd = new Uint8ClampedArray(32 * 32 * 4);
for (let i = 0; i < pd.length; i += 4) {
  pd[i] = 100; pd[i+1] = 80; pd[i+2] = 60; pd[i+3] = 255;
}
const sym = detectSymmetry(pd, { width: 32, height: 32 });
console.log('detectSymmetry type:', sym?.type, 'confidence:', sym?.confidence?.toFixed(3));

console.log('---');
console.log('Phase 1 smoke OK');

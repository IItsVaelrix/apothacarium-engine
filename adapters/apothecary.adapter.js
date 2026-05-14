/**
 * APOTHECARY ADAPTER
 *
 * Maps a cabinet layout JSON + palette preset id into a generateApothecaryLattice
 * input, enforces the prop budget from composition-rules.json, and returns the
 * full lattice with budget report attached.
 *
 * Vertical symmetry mirrors the declared slots across the axis, so layouts
 * typically declare only the left half. Budget checks run post-mirror.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  generateApothecaryLattice,
  validatePropBudget,
} from '../core/lattice-grid-engine.js';
import {
  APOTHACARIUM_PRESETS,
  DEFAULT_PRESET_ID,
  getPreset as getPalettePreset,
  validatePalette,
} from '../core/color-apothecary-presets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = resolve(__dirname, '../presets');

let cachedPresets = null;

async function loadPresets() {
  if (cachedPresets) return cachedPresets;
  const [layoutsRaw, catalogRaw, rulesRaw] = await Promise.all([
    readFile(resolve(PRESETS_DIR, 'cabinet-layouts.json'), 'utf8'),
    readFile(resolve(PRESETS_DIR, 'prop-catalog.json'), 'utf8'),
    readFile(resolve(PRESETS_DIR, 'composition-rules.json'), 'utf8'),
  ]);
  cachedPresets = {
    layouts: JSON.parse(layoutsRaw).layouts,
    catalog: JSON.parse(catalogRaw).categories,
    rules: JSON.parse(rulesRaw),
  };
  return cachedPresets;
}

export async function listLayouts() {
  const { layouts } = await loadPresets();
  return layouts.map((l) => ({ id: l.id, name: l.name, cols: l.cols, rows: l.rows }));
}

function resolveSlotColor(category, paletteUse, palette) {
  const useIdx = paletteUse[category];
  if (Number.isFinite(useIdx) && palette.colors[useIdx]) return palette.colors[useIdx];
  // Fall back to herbs anchor
  const herbsIdx = palette.use?.herbs;
  if (Number.isFinite(herbsIdx) && palette.colors[herbsIdx]) return palette.colors[herbsIdx];
  return palette.colors[0];
}

/**
 * Build a generateApothecaryLattice preset from a layout id + palette id.
 *
 * @param {Object} args
 * @param {string} args.layoutId
 * @param {string} [args.paletteId]
 * @returns {Promise<Object>} preset object suitable for generateApothecaryLattice
 */
export async function buildPreset({ layoutId, paletteId = DEFAULT_PRESET_ID }) {
  const { layouts, catalog, rules } = await loadPresets();
  const layout = layouts.find((l) => l.id === layoutId);
  if (!layout) throw new Error(`apothecary.adapter: unknown layout "${layoutId}"`);

  const palette = APOTHACARIUM_PRESETS[paletteId] || APOTHACARIUM_PRESETS[DEFAULT_PRESET_ID];
  const paletteUse = palette.use || {};

  const propSlots = [];
  for (const slot of layout.slots) {
    const cat = catalog[slot.category];
    if (!cat) {
      throw new Error(`apothecary.adapter: layout slot references unknown category "${slot.category}"`);
    }
    propSlots.push({
      col: slot.col,
      row: slot.row,
      prop: { category: slot.category, label: cat.label, occupancy: cat.occupancy },
      color: resolveSlotColor(slot.category, paletteUse, palette),
      emphasis: cat.emphasis,
    });
  }

  const symConf = rules.symmetry || {};
  return {
    id: `${layoutId}--${paletteId}`,
    cols: layout.cols,
    rows: layout.rows,
    cellSize: layout.cellSize,
    propSlots,
    budget: rules.totalBudget,
    symmetry: {
      type: symConf.default || 'vertical',
      confidence: symConf.confidence ?? 0.85,
      scores: { vertical: symConf.confidence ?? 0.85 },
      axis: { x: (layout.cols * layout.cellSize) / 2 },
      significant: true,
    },
    layoutMeta: layout,
    paletteMeta: palette,
    rules,
  };
}

/**
 * Full apothecary pipeline: layout id → lattice + budget + palette + rules.
 *
 * @param {Object} args
 * @param {string} args.layoutId
 * @param {string} [args.paletteId]
 * @returns {Promise<{lattice, palette, rules, budgetReport, paletteReport}>}
 */
export async function composeApothecaryScene(args) {
  const preset = await buildPreset(args);
  const lattice = generateApothecaryLattice(preset, {
    significanceThreshold: preset.rules.symmetry.significanceThreshold,
  });

  // Re-validate budget post-mirror (generateApothecaryLattice already populates
  // budgetReport, but we double-check after applying any symmetry transforms).
  const budgetReport = validatePropBudget(lattice, preset.budget);
  const paletteReport = validatePalette(preset.paletteMeta);

  return {
    lattice,
    palette: preset.paletteMeta,
    rules: preset.rules,
    budgetReport,
    paletteReport,
  };
}

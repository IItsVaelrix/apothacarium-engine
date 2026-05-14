#!/usr/bin/env node
/**
 * MEMORY CELL INFUSION CLI
 *
 * Ritual to extract "scars" from private memory and infuse them into the public substrate.
 * Usage: node scripts/memory-cell-infusion.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { extractMemoryAntigens, validatePrivacy } from '../codex/core/immunity/memory-infusion.engine.js';

const MEMORY_DIR = '/home/deck/.gemini/tmp/scholomance-v12/memory';
const SUBSTRATE_PATH = 'codex/core/immunity/clerical-raid.substrate.js';

async function main() {
  console.log('[infusion] beginning memory cell extraction...');
  
  const antigens = extractMemoryAntigens(MEMORY_DIR);
  
  if (antigens.length === 0) {
    console.log('[infusion] zero antigens found with # INFUSION_ALLOW tag. stasis holds.');
    return;
  }

  const validAntigens = antigens.filter(a => {
    const ok = validatePrivacy(a);
    if (!ok) console.warn(`[infusion] skipping ${a.title}: privacy violation detected.`);
    return ok;
  });

  console.log(`[infusion] extracted ${validAntigens.length} valid antigens.`);

  // Infuse into substrate
  const substrate = `/**
 * CLERICAL RAID SUBSTRATE
 *
 * Automatically generated via memory cell infusion.
 * DO NOT EDIT MANUALLY.
 */

export const INFUSED_ANTIGENS = ${JSON.stringify(validAntigens, null, 2)};
`;

  fs.writeFileSync(SUBSTRATE_PATH, substrate);
  console.log(`[infusion] substrate updated: ${SUBSTRATE_PATH}`);
  console.log('[infusion] ritual complete. antigens regenerated.');
}

main().catch(console.error);

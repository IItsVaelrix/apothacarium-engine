/**
 * Bootstrap Clerical RAID with the canonical seed pattern library (PDR section 4).
 *
 * @bytecode SCHOL-CLERICAL-RAID-BOOT
 */

import { ClericalRAID } from './clerical-raid.core.js';
import { SEED_PATTERNS } from './clerical-raid.patterns.js';

/**
 * @param {ConstructorParameters<typeof ClericalRAID>[0]} [options]
 * @returns {ClericalRAID}
 */
export function createRaidWithSeeds(options = {}) {
  const raid = new ClericalRAID(options);
  for (const pattern of SEED_PATTERNS) {
    raid.train(pattern);
  }
  return raid;
}

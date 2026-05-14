/**
 * CLERICAL RAID SUBSTRATE
 *
 * Automatically generated via memory cell infusion.
 * DO NOT EDIT MANUALLY.
 */

export const INFUSED_ANTIGENS = [
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed Math.random() in `opponent.engine.js` (Law 6).",
    "description": "Fixed Math.random() in `opponent.engine.js` (Law 6).\nThis module was using unseeded randomness in combat logic, violating the determinism mandate.\nFixed by passing the ritual seed.",
    "addedAt": 0
  },
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed requestId generation in `wordLookupPipeline.js`.",
    "description": "Fixed requestId generation in `wordLookupPipeline.js`.\nDuplicate IDs were causing race conditions in the pipeline.\nFixed by switching to deterministic GUID-8 format.",
    "addedAt": 0
  },
  {
    "source": "memory/MEMORY.md",
    "title": "Fixed captcha non-determinism in `captcha.service.js`.",
    "description": "Fixed captcha non-determinism in `captcha.service.js`.\nCaptcha generation was using unseeded entropy, making stasis verification impossible.\nFixed by tying to the session seed.\n\n- Ratified PDR-2026-05-09-CELL-WALL-INFRASTRUCTURE.",
    "addedAt": 0
  }
];

#!/usr/bin/env node
/**
 * scripts/audit_bytecode_vectors.js
 *
 * Performs a full QA alignment audit by cross-referencing all bytecodes
 * found in the TurboQuant vector index against the BIBLE_BYTECODE_INDEX.md.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  quantizeVectorJS,
  estimateInnerProduct,
} from '../codex/core/quantization/turboquant.js';
import { generatePhonosemanticVector } from '../codex/core/semantic/vector.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(
  __dirname,
  '../data/rhyme-astrology/rhyme_lexicon.sqlite',
);
const BIBLE_INDEX_PATH = path.resolve(
  __dirname,
  '../docs/scholomance-bible/BIBLE_BYTECODE_INDEX.md',
);
const SEED = 42;
const TARGET_DIM = 256;
const SIMILARITY_THRESHOLD = 0.3; // Tunable parameter

console.log(`[AUDIT] Using database: ${DB_PATH}`);

/**
 * Main audit function
 */
async function main() {
  // --- Phase 1: Vector Search ---
  console.log('[AUDIT] Phase 1: Scanning vector index for bytecodes...');

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[AUDIT] FATAL: Database not found at ${DB_PATH}`);
    console.error('[AUDIT] Please run `node scripts/build_vector_artifacts.js` first.');
    process.exit(1);
  }

  const db = new Database(DB_PATH);
  const searchQuery = 'PB-ERR-v1-';
  const queryVector = generatePhonosemanticVector(searchQuery, TARGET_DIM);
  const queryTQ = quantizeVectorJS(queryVector, SEED);

  const stmt = db.prepare('SELECT id, normalized, embeddings_tq FROM lexicon_node WHERE embeddings_tq IS NOT NULL');
  const allNodes = stmt.all();
  
  const candidates = [];
  for (const node of allNodes) {
    if (!node.embeddings_tq) continue;

    try {
        const tqPayload = {
            norm: node.embeddings_tq.readFloatLE(0),
            data: new Uint8Array(node.embeddings_tq.slice(4))
        };
        const score = estimateInnerProduct(queryTQ.data, tqPayload.data, queryTQ.norm, tqPayload.norm);

        if (score > SIMILARITY_THRESHOLD) {
            candidates.push({ ...node, score });
        }
    } catch(e) {
        // Ignore nodes with malformed embeddings
    }
  }

  const foundBytecodes = new Map();
  const bytecodeRegex = /(PB-(?:ERR|OK)-v1-[A-Z_]+-[A-Z_]+-[A-Z_]+-[A-F0-9]{4,})/g;

  for (const candidate of candidates) {
    const matches = candidate.normalized.match(bytecodeRegex);
    if (matches) {
      for (const match of matches) {
        if (!foundBytecodes.has(match)) {
          foundBytecodes.set(match, []);
        }
        // In a real scenario, we'd have file paths. Here we use the node 'id' as a proxy for location.
        foundBytecodes.get(match).push(`lexicon_node:${candidate.id}`); 
      }
    }
  }

  console.log(`[AUDIT] Found ${foundBytecodes.size} unique bytecode signatures in vector index.`);

  // --- Phase 2: Bible Cross-Reference ---
  console.log('\n[AUDIT] Phase 2: Cross-referencing with BIBLE_BYTECODE_INDEX.md...');
  
  if (!fs.existsSync(BIBLE_INDEX_PATH)) {
      console.error(`[AUDIT] FATAL: Bible index not found at ${BIBLE_INDEX_PATH}`);
      process.exit(1);
  }

  const bibleContent = fs.readFileSync(BIBLE_INDEX_PATH, 'utf8');
  const bibleBytecodes = new Set();
  const bibleLines = bibleContent.split('\\n');
  for(const line of bibleLines) {
      const match = line.match(bytecodeRegex);
      if(match) {
          bibleBytecodes.add(match[0]);
      }
  }

  console.log(`[AUDIT] Loaded ${bibleBytecodes.size} bytecodes from the Bible Index.`);

  // --- Phase 3: Anomaly Report ---
  console.log('\\n[AUDIT] Phase 3: Generating Anomaly Report...');
  const anomalies = {
      unregistered: [],
      missingInCode: [],
  };

  // Check for unregistered bytecodes (in code, not in Bible)
  for (const foundCode of foundBytecodes.keys()) {
      if (!bibleBytecodes.has(foundCode)) {
          anomalies.unregistered.push({
              code: foundCode,
              locations: foundBytecodes.get(foundCode),
          });
      }
  }

  // Check for missing bytecodes (in Bible, not in code)
  for (const bibleCode of bibleBytecodes) {
      if (!foundBytecodes.has(bibleCode)) {
          anomalies.missingInCode.push(bibleCode);
      }
  }

  // --- Print Report ---
  console.log('\\n\\n--- BYTECODE QA ALIGNMENT REPORT ---');
  console.log(`Audit Complete. Timestamp: ${new Date().toISOString()}\\n`);

  if (anomalies.unregistered.length === 0 && anomalies.missingInCode.length === 0) {
      console.log('✅ SYSTEM ALIGNED: All bytecodes in the vector index are registered in the Bible.');
  } else {
      if (anomalies.unregistered.length > 0) {
          console.log(`\\n⚠️ UNREGISTERED BYTECODES (${anomalies.unregistered.length} found):`);
          console.log('   (Found in vector index but not in the Bible Index)');
          for (const anomaly of anomalies.unregistered) {
              console.log(`  - ${anomaly.code}`);
              // console.log(`    Locations: ${anomaly.locations.join(', ')}`);
          }
      }

      if (anomalies.missingInCode.length > 0) {
          console.log(`\\n⚠️ MISSING BYTECODES (${anomalies.missingInCode.length} found):`);
          console.log('   (Found in Bible Index but not in the vector index)');
          for (const anomaly of anomalies.missingInCode) {
              console.log(`  - ${anomaly}`);
          }
      }
  }
  console.log('\\n--- END OF REPORT ---');

  db.close();
}

main().catch((err) => {
  console.error('[AUDIT] A critical error occurred during the audit:', err);
  process.exit(1);
});

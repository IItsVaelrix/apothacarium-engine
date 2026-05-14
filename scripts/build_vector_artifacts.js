/**
 * scripts/build_vector_artifacts.js
 * 
 * Phase 2: Vector Artifact Injection (JavaScript Fallback)
 * 
 * This script generates and injects 2.5-bit TurboQuant embeddings into 
 * rhyme_lexicon.sqlite across both /data and /dict_data targets.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { quantizeVectorJS } from '../src/lib/math/quantization/turboquant.js';
import { generatePhonosemanticVector } from '../codex/core/semantic/vector.utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_CONFIGS = [
    {
        path: path.resolve(__dirname, '../data/rhyme-astrology/rhyme_lexicon.sqlite'),
        table: 'lexicon_node',
        textColumn: 'normalized'
    },
    {
        path: path.resolve(__dirname, '../dict_data/rhyme-astrology/rhyme_lexicon.sqlite'),
        table: 'lexicon_node',
        textColumn: 'normalized'
    },
    {
        path: path.resolve(__dirname, '../data/scholomance_dict.sqlite'),
        table: 'entry',
        textColumn: 'headword_lower'
    },
    {
        path: path.resolve(__dirname, '../scholomance_dict.sqlite'),
        table: 'entry',
        textColumn: 'headword_lower'
    }
];
const SEED = 42;
const TARGET_DIM = 256; // Must be power of 2

async function processDb(config) {
    const { path: dbPath, table, textColumn } = config;
    if (!fs.existsSync(dbPath)) {
        console.log(`[RITUAL] Substrate not found at ${dbPath}, skipping.`);
        return;
    }
    
    console.log(`[RITUAL] Opening Database: ${dbPath}`);
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');

    // 1. Add column if missing
    try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN embeddings_tq BLOB`);
        console.log(`[RITUAL] Added column: ${table}.embeddings_tq`);
    } catch (e) {
        if (e.message.includes('duplicate column name')) {
            console.log(`[RITUAL] Column embeddings_tq already exists in ${table}.`);
        } else {
            console.error(`[RITUAL] Failed to alter table ${table}: ${e.message}`);
            db.close();
            throw e;
        }
    }

    // 2. Fetch all entries in chunks to save memory
    const count = db.prepare(`SELECT COUNT(*) as n FROM ${table}`).get().n;
    console.log(`[RITUAL] Generating Phonosemantic Embeddings for ${count} nodes in ${table}...`);

    const updateStmt = db.prepare(`UPDATE ${table} SET embeddings_tq = ? WHERE id = ?`);
    
    const CHUNK_SIZE = 1000;
    for (let offset = 0; offset < count; offset += CHUNK_SIZE) {
        const rows = db.prepare(`SELECT id, ${textColumn} FROM ${table} LIMIT ? OFFSET ?`).all(CHUNK_SIZE, offset);
        
        const transaction = db.transaction((batch) => {
            for (const row of batch) {
                const textValue = row[textColumn];
                if (!textValue) continue;
                
                const vector = generatePhonosemanticVector(textValue, TARGET_DIM);
                const { data, norm } = quantizeVectorJS(vector, SEED);

                const dataBuffer = Buffer.from(data);
                const tqPayload = Buffer.alloc(4 + dataBuffer.length);
                tqPayload.writeFloatLE(norm, 0); 
                dataBuffer.copy(tqPayload, 4);

                updateStmt.run(tqPayload, row.id);
            }
        });

        transaction(rows);
        if (offset % 5000 === 0 || offset + CHUNK_SIZE >= count) {
            console.log(`  - Ascended ${Math.min(offset + CHUNK_SIZE, count)}/${count}...`);
        }
    }

    console.log(`[RITUAL] Ascension Complete for ${dbPath}.`);
    db.close();
}

async function main() {
    for (const config of DB_CONFIGS) {
        await processDb(config);
    }
}

main().catch(err => {
    console.error('[RITUAL] Critical Build Failure:', err.message);
    process.exit(1);
});

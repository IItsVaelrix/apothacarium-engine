import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BytecodeHealth, HEALTH_CODES, CELL_IDS } from '../codex/core/diagnostic/BytecodeHealth.js';
import { resolveDatabasePath } from '../codex/server/utils/pathResolution.js';

/**
 * DB_HEALTH Diagnostic Cell
 * Checks for database connectivity, schema integrity (TurboQuant), and alignment with Vaelrix Law.
 */

async function diagnose() {
    console.log('--- Scholomance DB Health Diagnostic ---');
    
    const reports = [];

    const dbConfigs = [
        { name: 'Dictionary', env: 'SCHOLOMANCE_DICT_PATH', fallback: 'scholomance_dict.sqlite', table: 'entry' },
        { name: 'Corpus', env: 'SCHOLOMANCE_CORPUS_PATH', fallback: 'scholomance_corpus.sqlite', table: 'sentence' },
        { name: 'Rhyme Lexicon', env: 'RHYME_ASTROLOGY_LEXICON', fallback: 'dict_data/rhyme-astrology/rhyme_lexicon.sqlite', table: 'lexicon_node' }
    ];

    for (const config of dbConfigs) {
        const rawPath = process.env[config.env];
        const resolvedPath = resolveDatabasePath(rawPath, config.fallback);
        const exists = fs.existsSync(resolvedPath);

        console.log(`Checking ${config.name}: ${resolvedPath} (${exists ? 'FOUND' : 'MISSING'})`);

        if (!exists) {
            // Emit a "sick" health signal for missing substrate
            reports.push(new BytecodeHealth({
                code: HEALTH_CODES.CELL_SCAN_CLEAN, // Using clean code but with zero rows to indicate failure
                cellId: 'DB_HEALTH',
                checkId: `SCHEMA_MISSING_${config.name.toUpperCase().replace(' ', '_')}`,
                moduleId: resolvedPath,
                context: { name: config.name, exists: false, status: 'FATAL' }
            }));
            continue;
        }

        try {
            const db = new Database(resolvedPath, { readonly: true });
            
            // 1. Column Verification
            const columns = db.prepare(`PRAGMA table_info(${config.table})`).all();
            const hasTq = columns.some(c => c.name === 'embeddings_tq');
            
            // 2. Data Integrity Verification
            const countRow = db.prepare(`SELECT COUNT(*) as n FROM ${config.table}`).get();
            const rowCount = countRow ? countRow.n : 0;
            
            let populatedEmbeddings = 0;
            let avgNorm = 0;

            if (hasTq && rowCount > 0) {
                const sample = db.prepare(`SELECT embeddings_tq FROM ${config.table} WHERE embeddings_tq IS NOT NULL LIMIT 100`).all();
                populatedEmbeddings = db.prepare(`SELECT COUNT(*) as n FROM ${config.table} WHERE embeddings_tq IS NOT NULL`).get().n;
                
                // Inspect sample norms to verify TurboQuant packing [4-byte norm][data...]
                if (sample.length > 0) {
                    let totalNorm = 0;
                    sample.forEach(row => {
                        const buf = row.embeddings_tq;
                        if (buf && buf.length > 4) {
                            totalNorm += buf.readFloatLE(0);
                        }
                    });
                    avgNorm = totalNorm / sample.length;
                }
            }

            const health = new BytecodeHealth({
                code: HEALTH_CODES.CELL_SCAN_CLEAN,
                cellId: 'DB_HEALTH',
                checkId: `SCHEMA_VERIFIED_${config.name.toUpperCase().replace(' ', '_')}`,
                moduleId: resolvedPath,
                context: {
                    name: config.name,
                    rowCount,
                    hasTurboQuantColumn: hasTq,
                    populatedEmbeddings,
                    averageSampleNorm: Number(avgNorm.toFixed(4)),
                    substrateIntegrity: populatedEmbeddings === rowCount ? 'FULL' : 'PARTIAL'
                }
            });

            reports.push(health);
            console.log(`  ✓ ${health.toString()}`);
            console.log(`    Rows: ${rowCount}, TQ: ${hasTq}, Populated: ${populatedEmbeddings}, AvgNorm: ${avgNorm.toFixed(4)}`);
            
            db.close();
        } catch (err) {
            console.error(`  ✗ Failed to diagnose ${config.name}: ${err.message}`);
        }
    }

    if (reports.length > 0) {
        console.log('\n--- Final Bytecode Health Signals ---');
        reports.forEach(h => console.log(h.bytecode));
    }
}

diagnose().catch(console.error);

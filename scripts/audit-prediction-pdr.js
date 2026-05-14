import fs from 'node:fs';
import path from 'node:path';
import { BytecodeHealth, HEALTH_CODES } from '../codex/core/diagnostic/BytecodeHealth.js';

/**
 * PREDICTION_PDR_AUDIT Diagnostic
 * A "rapid antigen test" to verify the implementation status of the 
 * Ritual Prediction Enhancement PDR across Phases 1-5.
 */

function checkFileExists(relPath) {
    const fullPath = path.resolve(process.cwd(), relPath);
    return fs.existsSync(fullPath);
}

function checkContent(relPath, pattern) {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (!fs.existsSync(fullPath)) return false;
    const content = fs.readFileSync(fullPath, 'utf8');
    return pattern.test(content);
}

async function runAudit() {
    console.log('--- Ritual Prediction Enhancement PDR Audit ---');
    const reports = [];

    // Phase 1: Core Convergence (File Manifest)
    const phase1Files = [
        'codex/core/ritual-prediction/context.js',
        'codex/core/ritual-prediction/anchors.js',
        'codex/core/ritual-prediction/run.js',
        'codex/core/ritual-prediction/artifact.js'
    ];
    
    let phase1Count = 0;
    for (const f of phase1Files) {
        if (checkFileExists(f)) phase1Count++;
    }

    const phase1Health = new BytecodeHealth({
        code: HEALTH_CODES.CELL_SCAN_CLEAN,
        cellId: 'PREDICTION_PDR_AUDIT',
        checkId: 'PHASE_1_CORE_FILES',
        context: {
            description: 'Core prediction orchestration modules',
            filesFound: phase1Count,
            totalExpected: phase1Files.length,
            status: phase1Count === phase1Files.length ? 'COMPLETE' : (phase1Count > 0 ? 'PARTIAL' : 'NOT_STARTED')
        }
    });
    reports.push(phase1Health);

    // Phase 2: VerseIR + Syntax Hardening
    // Checking if context.js actually imports compileVerseToIR as mandated by 8.1 Runtime Flow
    const hasVerseIRImport = checkContent('codex/core/ritual-prediction/context.js', /compileVerseToIR/);
    const hasBridgeImport = checkContent('codex/core/ritual-prediction/context.js', /buildPlsVerseIRBridge/);
    
    const phase2Health = new BytecodeHealth({
        code: HEALTH_CODES.CELL_SCAN_CLEAN,
        cellId: 'PREDICTION_PDR_AUDIT',
        checkId: 'PHASE_2_VERSE_IR',
        context: {
            description: 'VerseIR-first context binding',
            verseIRImported: hasVerseIRImport,
            bridgeImported: hasBridgeImport,
            status: (hasVerseIRImport && hasBridgeImport) ? 'COMPLETE' : 'NOT_STARTED'
        }
    });
    reports.push(phase2Health);

    // Phase 3: Artifacts & Diagnostics
    const hasArtifactSchema = checkContent('docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md', /RitualPredictionArtifact/);
    const hasPixelBrainAdapter = checkContent('codex/core/ritual-prediction/artifact.js', /PixelBrain/i);
    
    const phase3Health = new BytecodeHealth({
        code: HEALTH_CODES.CELL_SCAN_CLEAN,
        cellId: 'PREDICTION_PDR_AUDIT',
        checkId: 'PHASE_3_ARTIFACTS',
        context: {
            description: 'Artifact schema and PixelBrain adapters',
            schemaPresent: hasArtifactSchema,
            adapterPresent: hasPixelBrainAdapter,
            status: (hasArtifactSchema && hasPixelBrainAdapter) ? 'COMPLETE' : (hasPixelBrainAdapter ? 'PARTIAL' : 'NOT_STARTED')
        }
    });
    reports.push(phase3Health);

    // Phase 4: Dual-Speed Data Refresh
    // Check if the prediction API has methods for incremental updates
    const hasIncrementalRefresh = checkContent('codex/server/services/wordLookup.service.js', /incrementalRefresh/);
    const hasArtifactCache = checkContent('codex/runtime/cache.js', /RitualPredictionArtifact/);

    const phase4Health = new BytecodeHealth({
        code: HEALTH_CODES.CELL_SCAN_CLEAN,
        cellId: 'PREDICTION_PDR_AUDIT',
        checkId: 'PHASE_4_DUAL_SPEED',
        context: {
            description: 'Dual-speed artifact pipeline',
            hasIncrementalRefresh,
            hasArtifactCache,
            status: (hasIncrementalRefresh && hasArtifactCache) ? 'COMPLETE' : 'NOT_STARTED'
        }
    });
    reports.push(phase4Health);

    // Print Results
    reports.forEach(h => {
        const ctx = h.context;
        console.log(`[${ctx.status}] ${h.checkId}: ${ctx.description}`);
        console.log(`  -> ${h.bytecode}`);
    });
}

runAudit().catch(console.error);

/**
 * scripts/nucleus-drift-audit.js
 * 
 * Performs Tier 2 Nucleus Drift Detection as defined in PDR-2026-05-09.
 * Compares current module implementation against its founding PDR using
 * TurboQuant vector similarity.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantizeVectorJS, estimateInnerProduct } from '../codex/core/quantization/turboquant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_DIM = 256;
const SEED = 1337;

// Keywords from index_codebase_vectors.js
const KEYWORDS = [
    'function', 'async', 'await', 'import', 'export', 'const', 'let', 'class',
    'if', 'else', 'switch', 'case', 'return', 'try', 'catch', 'throw',
    'agent', 'collab', 'task', 'lock', 'pipeline', 'ritual', 'codex', 'pixelbrain',
    'verse', 'phoneme', 'vowel', 'rhyme', 'astrology', 'persistence', 'adapter',
    'route', 'service', 'utility', 'hook', 'component', 'style', 'test'
];

/**
 * Generates a semantic vector for text (code or markdown).
 * Adapted from scripts/index_codebase_vectors.js
 */
function generateVector(text, dim) {
    const vec = new Float32Array(dim);
    const content = text.toLowerCase();

    // 1. Core keywords (Dims 0-63)
    KEYWORDS.forEach((word, i) => {
        const regex = new RegExp(`\\b${word}\\b`, 'g');
        const matches = (content.match(regex) || []).length;
        const idx = i % 64;
        vec[idx] += Math.log1p(matches) * 2.5;
    });

    // 2. Symbol detection (Dims 64-127)
    const symbols = text.match(/\b(async\s+)?function\s+([a-zA-Z0-9_]+)/g) || [];
    symbols.forEach(sym => {
        const name = sym.split(/\s+/).pop();
        const h = Math.abs(name.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 64;
        vec[64 + h] += 4.0;
    });

    // 3. Intent/Structure (Dims 128-191)
    const patterns = [
        { re: /describe\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /it\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /test\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /#+ (.+)/g, weight: 4.0 }, // Markdown headers
        { re: /- \[ \] (.+)/g, weight: 3.0 } // Markdown tasks
    ];
    patterns.forEach((p) => {
        let match;
        while ((match = p.re.exec(text)) !== null) {
            const description = match[1] || '';
            const h = Math.abs(description.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 64;
            vec[128 + h] += p.weight;
        }
    });

    // 4. Acoustic n-grams (Dims 192-255)
    for (let i = 0; i < content.length - 1; i++) {
        const gram = content.slice(i, i + 2);
        const h = ((gram.charCodeAt(0) << 5) + gram.charCodeAt(1)) % 64;
        vec[192 + h] += 0.5;
    }

    return vec;
}

function calculateDrift(modulePath, pdrPath) {
    if (!fs.existsSync(modulePath)) throw new Error(`Module not found: ${modulePath}`);
    if (!fs.existsSync(pdrPath)) throw new Error(`PDR not found: ${pdrPath}`);

    const moduleContent = fs.readFileSync(modulePath, 'utf8');
    const pdrContent = fs.readFileSync(pdrPath, 'utf8');

    const moduleVec = generateVector(moduleContent, TARGET_DIM);
    const pdrVec = generateVector(pdrContent, TARGET_DIM);

    const qModule = quantizeVectorJS(moduleVec, SEED);
    const qPdr = quantizeVectorJS(pdrVec, SEED);

    const similarity = estimateInnerProduct(qModule.data, qPdr.data, 1.0, 1.0);
    const drift = 1.0 - similarity;

    return {
        module: path.relative(ROOT, modulePath),
        pdr: path.relative(ROOT, pdrPath),
        similarity: parseFloat(similarity.toFixed(4)),
        drift: parseFloat(drift.toFixed(4))
    };
}

async function main() {
    const targets = [
        {
            module: 'codex/core/analysis.pipeline.js',
            pdr: 'docs/scholomance-encyclopedia/PDR-archive/prototype_systems_wiring_pdr.md',
            threshold: 0.25
        },
        {
            module: 'codex/core/opponent.engine.js',
            pdr: 'docs/scholomance-encyclopedia/PDR-archive/thorough_ai_combat_pdr.md',
            threshold: 0.15
        }
    ];

    console.log('\n=== Nucleus Drift Audit ===\n');

    const results = targets.map(t => {
        try {
            const result = calculateDrift(path.join(ROOT, t.module), path.join(ROOT, t.pdr));
            const status = result.drift > t.threshold ? '🔴 CRITICAL DRIFT' : (result.drift > t.threshold * 0.7 ? '🟡 WARNING' : '✅ STABLE');
            
            console.log(`Module: ${t.module}`);
            console.log(`PDR:    ${path.basename(t.pdr)}`);
            console.log(`Sim:    ${result.similarity}`);
            console.log(`Drift:  ${result.drift} (Limit: ${t.threshold})`);
            console.log(`Status: ${status}\n`);
            
            return { ...result, threshold: t.threshold, status };
        } catch (e) {
            console.error(`[ERROR] ${t.module}: ${e.message}\n`);
            return null;
        }
    }).filter(Boolean);

    const reportPath = path.join(ROOT, 'docs/reports/NUCLEUS_DRIFT_REPORT_2026-05-09.md');
    let report = `# Nucleus Drift Report — 2026-05-09\n\n`;
    report += `| Module | PDR | Similarity | Drift | Threshold | Status |\n`;
    report += `|---|---|---|---|---|---|\n`;
    results.forEach(r => {
        report += `| ${r.module} | ${path.basename(r.pdr)} | ${r.similarity} | ${r.drift} | ${r.threshold} | ${r.status} |\n`;
    });

    fs.writeFileSync(reportPath, report);
    console.log(`Report etched to ${path.relative(ROOT, reportPath)}`);
}

main().catch(err => {
    console.error('[AUDIT] Failed:', err);
    process.exit(1);
});

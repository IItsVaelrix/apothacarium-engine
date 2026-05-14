/**
 * scripts/index_codebase_vectors.js
 * 
 * Indexes the codebase into a vector space using TurboQuant.
 * Enables INSTANT codebase search for the Scholomance team.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { collabPersistence } from '../codex/server/collab/collab.persistence.js';
import { quantizeVectorJS } from '../codex/core/quantization/turboquant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const TARGET_DIM = 256;
const CHUNK_SIZE = 2000; // chars
const SEED = 1337; // Dedicated codebase seed

// Common programming keywords for semantic anchoring
const KEYWORDS = [
    'function', 'async', 'await', 'import', 'export', 'const', 'let', 'class',
    'if', 'else', 'switch', 'case', 'return', 'try', 'catch', 'throw',
    'agent', 'collab', 'task', 'lock', 'pipeline', 'ritual', 'codex', 'pixelbrain',
    'verse', 'phoneme', 'vowel', 'rhyme', 'astrology', 'persistence', 'adapter',
    'route', 'service', 'utility', 'hook', 'component', 'style', 'test'
];

/**
 * Generates a semantic vector for a piece of code.
 * V12 Code Search Logic:
 * - Dims 0-63: Core keywords & structural tokens
 * - Dims 64-127: Symbol extraction (fn names, classes)
 * - Dims 128-191: Test intent markers (describe, it, expect)
 * - Dims 192-255: N-gram acoustic fingerprint
 */
function generateCodeVector(text, dim) {
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
    // Extract potential function/class names
    const symbols = text.match(/\b(async\s+)?function\s+([a-zA-Z0-9_]+)/g) || [];
    symbols.forEach(sym => {
        const name = sym.split(/\s+/).pop();
        const h = Math.abs(name.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0)) % 64;
        vec[64 + h] += 4.0;
    });

    // 3. Test Intent (Dims 128-191)
    const testPatterns = [
        { re: /describe\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /it\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /test\(['"](.+?)['"]/g, weight: 5.0 },
        { re: /expect\(.+?\)\.to/g, weight: 2.0 }
    ];
    testPatterns.forEach((p, i) => {
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

async function indexFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(ROOT, filePath);
        
        // Chunk content
        const chunks = [];
        for (let i = 0; i < content.length; i += CHUNK_SIZE) {
            chunks.push(content.slice(i, i + CHUNK_SIZE));
        }

        const entries = chunks.map((chunk, index) => {
            const vec = generateCodeVector(chunk, TARGET_DIM);
            const { data } = quantizeVectorJS(vec, SEED);
            
            // id = hash of path + index
            const id = crypto.createHash('md5').update(`${relativePath}:${index}`).digest('hex');
            
            return {
                id,
                file_path: relativePath,
                chunk_index: index,
                content_preview: chunk.slice(0, 100).replace(/\s+/g, ' ').trim(),
                vector_tq: Buffer.from(data)
            };
        });

        await collabPersistence.codebase.index(entries);
        return chunks.length;
    } catch (e) {
        console.error(`[INDEX] Failed to process ${filePath}:`, e.message);
        return 0;
    }
}

async function walk(dir, callback) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', '.tmp', 'output', '.claude'].includes(entry.name)) continue;
            await walk(fullPath, callback);
        } else if (/\.(js|jsx|ts|tsx|md|toml|jsonc)$/.test(entry.name)) {
            await callback(fullPath);
        }
    }
}

async function main() {
    console.log('[RITUAL] Initiating Codebase Vector Ascension...');
    
    // Clear old index
    await collabPersistence.codebase.clear();
    
    let fileCount = 0;
    let chunkCount = 0;

    await walk(ROOT, async (filePath) => {
        const n = await indexFile(filePath);
        if (n > 0) {
            fileCount++;
            chunkCount += n;
            if (fileCount % 50 === 0) console.log(`  - Ascended ${fileCount} files (${chunkCount} chunks)...`);
        }
    });

    console.log(`[RITUAL] Ascension Complete. Indexed ${fileCount} files into ${chunkCount} semantic vector chunks.`);
    process.exit(0);
}

main().catch(err => {
    console.error('[RITUAL] Ascension Failed:', err);
    process.exit(1);
});

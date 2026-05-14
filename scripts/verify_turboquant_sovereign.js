/**
 * scripts/verify_turboquant_sovereign.js
 * 
 * Phase 4: Sovereign Verification (Simulation)
 * 
 * This script measures the performance and memory overhead of the TurboQuant 
 * engine under a heavy 300-word verse analysis load. 
 * It ensures the "Memory Gate" (<32MB) is satisfied for on-device execution.
 */

import { initializeTurboQuant, quantizeVector, similarity, isWasmActive } from '../src/lib/math/quantization/index.js';
import { mulberry32 } from '../codex/core/shared/math/seededRng.js';

async function runBenchmark() {
    console.log('[SOVEREIGN] Initializing TurboQuant...');
    const startInit = performance.now();
    await initializeTurboQuant();
    const endInit = performance.now();
    
    console.log(`[SOVEREIGN] Engine Ready. Mode: ${isWasmActive() ? 'WASM' : 'JavaScript (Fallback)'}`);
    console.log(`[SOVEREIGN] Init Time: ${(endInit - startInit).toFixed(2)}ms`);

    const dim = 256;
    const wordCount = 300;
    // Deterministic test vectors — fixed seed so benchmark runs are reproducible.
    const rng = mulberry32(0x5C4014A1);
    const testVectors = Array.from({ length: wordCount }, () => {
        const vec = new Float32Array(dim);
        for (let i = 0; i < dim; i++) vec[i] = rng() * 2 - 1;
        return vec;
    });

    console.log(`[SOVEREIGN] Starting 300-word analysis simulation...`);
    
    // 1. Measure Baseline Memory
    global.gc?.(); // Force GC if available (--expose-gc)
    const memBase = process.memoryUsage().heapUsed / 1024 / 1024;
    
    const startTime = performance.now();
    
    // 2. Simulate Quantization (Word Analysis Pass)
    const payloads = [];
    for (const vec of testVectors) {
        payloads.push(await quantizeVector(vec));
    }
    
    // 3. Simulate Reranking (Cross-Similarity Pass)
    // We compare a query against all 300 candidates
    const query = payloads[0];
    const results = payloads.map(p => similarity(query, p));
    
    const endTime = performance.now();
    
    // 4. Measure Peak Memory
    const memPeak = process.memoryUsage().heapUsed / 1024 / 1024;
    const memDelta = memPeak - memBase;

    console.log('--- RESULTS ---');
    console.log(`Duration:    ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`Throughput:  ${(wordCount / ((endTime - startTime) / 1000)).toFixed(0)} words/sec`);
    console.log(`Memory Base: ${memBase.toFixed(2)} MB`);
    console.log(`Memory Peak: ${memPeak.toFixed(2)} MB`);
    console.log(`Memory Delta: ${memDelta.toFixed(2)} MB`);
    
    const GATE_MEM_MB = 32.0;
    if (memDelta < GATE_MEM_MB) {
        console.log(`\n✅ PASS: Memory increase (${memDelta.toFixed(2)}MB) is under the 32MB Sovereign Gate.`);
    } else {
        console.log(`\n❌ FAIL: Memory increase (${memDelta.toFixed(2)}MB) exceeds the 32MB Sovereign Gate.`);
    }
}

runBenchmark().catch(err => {
    console.error('[SOVEREIGN] Verification Error:', err.message);
    process.exit(1);
});

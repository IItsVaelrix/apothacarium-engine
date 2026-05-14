/**
 * codex/core/ritual-prediction/reranker.js
 * 
 * Pass 2: TurboQuant Vector Reranker
 * 
 * This module performs deep semantic reranking of candidate tokens using
 * 2.5-bit compressed vector embeddings. It supports both WASM (high-perf)
 * and pure JavaScript (fallback) kernels.
 */

import { initializeTurboQuant, similarity, quantizeVector } from '../quantization/turboquant.js';

// Configuration
const RERANK_LIMIT = 200; // Only rerank top N from graph pass
const VECTOR_WEIGHT = 0.45; // Balance between graph (0.55) and vector (0.45)
const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);

let isTQLoading = false;
let isTQLoaded = false;

function readRuntimeEnvValue(key) {
    const processEnv = globalThis.process?.env;
    const importMetaEnv = import.meta.env;
    return processEnv?.[key] ?? importMetaEnv?.[key] ?? null;
}

export function isTurboQuantEnabled(options = {}) {
    const explicit = options.enabled ?? options.enableTurboQuant ?? options.ENABLE_TURBOQUANT;
    const raw = explicit ?? readRuntimeEnvValue('ENABLE_TURBOQUANT') ?? readRuntimeEnvValue('VITE_ENABLE_TURBOQUANT');
    return ENABLED_VALUES.has(String(raw || '').trim().toLowerCase());
}

async function ensureTQReady(options) {
    if (!isTurboQuantEnabled(options)) return false;
    if (isTQLoaded) return true;
    if (isTQLoading) return false;

    isTQLoading = true;
    await initializeTurboQuant();
    isTQLoading = false;
    isTQLoaded = true;
    return true;
}

function decodeTurboQuantBlob(tqBlob) {
    if (!tqBlob) return null;

    if (typeof tqBlob.readFloatLE === 'function') {
        return {
            norm: tqBlob.readFloatLE(0),
            data: new Uint8Array(tqBlob.buffer, tqBlob.byteOffset + 4, tqBlob.byteLength - 4),
        };
    }

    if (tqBlob instanceof ArrayBuffer) {
        if (tqBlob.byteLength < 5) return null;
        return {
            norm: new DataView(tqBlob).getFloat32(0, true),
            data: new Uint8Array(tqBlob, 4),
        };
    }

    if (ArrayBuffer.isView(tqBlob)) {
        if (tqBlob.byteLength < 5) return null;
        return {
            norm: new DataView(tqBlob.buffer, tqBlob.byteOffset, tqBlob.byteLength).getFloat32(0, true),
            data: new Uint8Array(tqBlob.buffer, tqBlob.byteOffset + 4, tqBlob.byteLength - 4),
        };
    }

    return null;
}

/**
 * Rerank a set of candidates based on semantic proximity.
 * 
 * @param {Array<object>} candidates - Scored candidates from Pass 1
 * @param {object} context - RitualPredictionContext
 * @param {object} dependencies - { lexiconRepo }
 * @returns {Promise<Array<object>>} Reranked candidates
 */
export async function rerankCandidates(candidates, context, dependencies = {}, options = {}) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];
    if (!(await ensureTQReady(options))) return candidates;

    const { lexiconRepo } = dependencies;
    if (!lexiconRepo) return candidates;

    // 1. Generate Context Vector
    // In Phase 2/3, we use a mock semantic representation of the current verse
    const contextText = `${context.prevToken || ''} ${context.prefix || ''}`.trim();
    if (!contextText) return candidates;
    
    // For baseline verification, we generate a mock vector matching the build script
    const mockContextVec = generateMockVector(contextText, 256);
    const qPayload = await quantizeVector(mockContextVec);

    // 2. Fetch Embeddings for Top Candidates
    const tokens = candidates.slice(0, RERANK_LIMIT).map(c => c.token);
    const embeddingsMap = await Promise.resolve(lexiconRepo.lookupNodesByNormalizedBatch(tokens));

    // 3. Score candidates using TurboQuant kernel
    const reranked = candidates.map(candidate => {
        const node = embeddingsMap[candidate.token];
        const payload = decodeTurboQuantBlob(node?.embeddings_tq);
        
        if (!payload) return candidate;
        
        const semanticSimilarity = similarity(qPayload, payload);
        
        // Normalize similarity to [0, 1] range (rough approximation for mock)
        const normalizedSim = Math.max(0, Math.min(1.0, semanticSimilarity / 10.0));

        // 4. Merge scores
        const finalScore = (candidate.totalScore * (1 - VECTOR_WEIGHT)) + (normalizedSim * VECTOR_WEIGHT);

        return {
            ...candidate,
            totalScore: finalScore,
            vectorScore: normalizedSim,
            evidence: [...(candidate.evidence || []), 'turboquant_rerank'],
        };
    });

    // 5. Final Sort
    return reranked.sort((a, b) => b.totalScore - a.totalScore);
}

/**
 * Placeholder for semantic vector generation (to be replaced by GTE-Small)
 */
function generateMockVector(text, dim) {
    const vec = new Float32Array(dim);
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
        for (let i = 0; i < word.length; i++) {
            const charCode = word.charCodeAt(i);
            const idx = (charCode * (i + 1)) % dim;
            vec[idx] += 1.0;
        }
    }
    return vec;
}

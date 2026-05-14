/**
 * scripts/verify_turboqa.js
 * 
 * Verification script for TurboQA diagnostic layer.
 * Simulates vector drift and legality violations to ensure Bytecode Errors
 * are correctly emitted and parsable.
 */

import { enforceTurboQAGates } from '../codex/core/ritual-prediction/turboqa.js';
import {
    ERROR_CATEGORIES,
    ERROR_CODES,
    parseErrorForAI,
} from '../codex/core/pixelbrain/bytecode-error.js';

const mockBaseline = [
    { token: 'light', totalScore: 0.9, legalityScore: 1 },
    { token: 'bright', totalScore: 0.85, legalityScore: 1 },
    { token: 'sight', totalScore: 0.8, legalityScore: 1 },
    { token: 'night', totalScore: 0.75, legalityScore: 1 },
    { token: 'might', totalScore: 0.7, legalityScore: 1 }
];

let failures = 0;

function runTest(name, reranked, expected = {}) {
    console.log(`\n[TurboQA TEST] ${name}`);
    try {
        const result = enforceTurboQAGates(mockBaseline, reranked);
        if (expected.errorCode) {
            failures += 1;
            console.log('FAIL: expected bytecode gate rejection, got ok result:', result.metrics);
            return;
        }
        console.log('PASS:', result.metrics);
    } catch (error) {
        const errorData = parseErrorForAI(error);
        const expectedCodeHex = expected.errorCode
            ? `0x${expected.errorCode.toString(16).toUpperCase().padStart(4, '0')}`
            : null;
        const matchesExpected = expectedCodeHex
            && errorData.category === expected.category
            && errorData.errorCodeHex === expectedCodeHex;

        if (!matchesExpected) {
            failures += 1;
            console.log('FAIL: unexpected bytecode error:');
        } else {
            console.log('PASS (expected bytecode gate rejection):');
        }
        console.log(`  Bytecode: ${errorData.bytecode}`);
        console.log(`  Category: ${errorData.category}`);
        console.log(`  Code:     ${errorData.errorCodeHex}`);
        console.log(`  Reason:   ${errorData.context.reason}`);
        console.log(`  Hints:    ${errorData.recoveryHints.suggestions.join(', ')}`);
    }
}

// 1. Valid Reranking
runTest('Valid Reranking (100% overlap)', [...mockBaseline], { ok: true });

// 2. Minor Drift (Rejected)
const minorDrift = [
    { token: 'light', totalScore: 0.9, legalityScore: 1 },
    { token: 'bright', totalScore: 0.85, legalityScore: 1 },
    { token: 'sight', totalScore: 0.8, legalityScore: 1 },
    { token: 'night', totalScore: 0.75, legalityScore: 1 },
    { token: 'fight', totalScore: 0.6, legalityScore: 1 } // Only 1 word changed
];
// 4/5 = 80%, below the 85% threshold.
runTest('Minor Drift (80% overlap)', minorDrift, {
    category: ERROR_CATEGORIES.VALUE,
    errorCode: ERROR_CODES.QUANT_PRECISION_LOSS,
});

// 3. Significant Precision Loss
const majorDrift = [
    { token: 'dark', totalScore: 0.9, legalityScore: 1 },
    { token: 'cold', totalScore: 0.8, legalityScore: 1 },
    { token: 'void', totalScore: 0.7, legalityScore: 1 },
    { token: 'empty', totalScore: 0.6, legalityScore: 1 },
    { token: 'null', totalScore: 0.5, legalityScore: 1 }
];
runTest('Significant Precision Loss', majorDrift, {
    category: ERROR_CATEGORIES.VALUE,
    errorCode: ERROR_CODES.QUANT_PRECISION_LOSS,
});

// 4. World-Law Legality Violation
const illegalRerank = [
    { token: 'light', totalScore: 0.9, legalityScore: 1 },
    { token: 'bright', totalScore: 0.85, legalityScore: 1 },
    { token: 'sight', totalScore: 0.8, legalityScore: 1 },
    { token: 'night', totalScore: 0.75, legalityScore: 0 }, // ILLEGAL (score 0)
    { token: 'might', totalScore: 0.7, legalityScore: 1 }
];
runTest('Legality Violation (100% overlap, 1 illegal)', illegalRerank, {
    category: ERROR_CATEGORIES.LINGUISTIC,
    errorCode: ERROR_CODES.LEGALITY_VIOLATION,
});

if (failures > 0) {
    console.error(`\n[TurboQA] Verification failed with ${failures} mismatch(es).`);
    process.exit(1);
}

console.log('\n[TurboQA] Verification passed.');

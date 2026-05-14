/**
 * codex/core/phonology/phonemeAlignment.js
 * 
 * Modified Levenshtein Phoneme Alignment (Study1 + TurboQuant)
 * 
 * This module aligns stimulus and response phoneme sequences using a 
 * feature-aware edit distance algorithm. It utilizes TurboQuant vectors
 * derived from the Study1 feature matrix for high-fidelity similarity scoring.
 */

import { PHONOLOGICAL_FEATURES_V1 } from './phoneme.constants.js';
import { quantizeVectorJS, similarity } from '../quantization/turboquant.js';

// Table 2: Substitution Costs (Baseline)
const COSTS = {
  SUB_VOWEL_CONS: 5.0,
  SUB_CONS_CONS: 1.75,
  SUB_SAME_MANNER: 1.3,
  SUB_SIMILAR_CONS: 1.2,
  SUB_VOWEL_VOWEL: 0.9,
  SUB_SIMILAR_VOWEL: 0.65,
  MATCH: 0.0,
  INSERT: 1.0,
  DELETE: 1.0,
  SWITCH_PENALTY: 0.5,
  MATCH_EXCEPTION_INS: 0.1,
  MATCH_EXCEPTION_DEL: 0.2
};

// Pre-calculated TurboQuant vectors for all 39 phonemes
// Each vector is a 10-dimensional feature vector padded to 16 for TurboQuant (power of 2)
const PHONEME_VECTORS = Object.fromEntries(
  Object.entries(PHONOLOGICAL_FEATURES_V1).map(([phoneme, features]) => {
    const vec = new Float32Array(16);
    const keys = Object.keys(features).sort();
    keys.forEach((key, i) => { vec[i] = features[key]; });
    return [phoneme, quantizeVectorJS(vec)];
  })
);

/**
 * Calculates similarity between two phonemes using TurboQuant.
 */
function getPhonemeSimilarity(p1, p2) {
  const b1 = p1.replace(/[0-9]/g, '').toUpperCase();
  const b2 = p2.replace(/[0-9]/g, '').toUpperCase();
  
  if (b1 === b2) return 1.0;
  
  const v1 = PHONEME_VECTORS[b1];
  const v2 = PHONEME_VECTORS[b2];
  
  if (!v1 || !v2) return 0.0;
  
  // TurboQuant similarity (inner product of normalized vectors)
  return Math.max(0, Math.min(1.0, similarity(v1.data, v2.data, v1.norm, v2.norm)));
}

/**
 * Align stimulus and response phoneme sequences.
 * 
 * @param {string[]} stim - Stimulus phonemes (e.g., ["F", "AH1", "N"])
 * @param {string[]} resp - Response phonemes (e.g., ["TH", "IH1", "N"])
 * @returns {{ alignment: Array, cost: number }}
 */
export function alignPhonemes(stim = [], resp = []) {
  const m = stim.length;
  const n = resp.length;
  
  // DP matrix: [stim_idx][resp_idx] = { cost, op, prevOp }
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1));
  
  // Base cases: Deletions (align with empty string)
  dp[0][0] = { cost: 0, op: 'match', prevOp: null };
  for (let i = 1; i <= m; i++) {
    dp[i][0] = { cost: i * COSTS.DELETE, op: 'delete', prevOp: 'delete' };
  }
  for (let j = 1; j <= n; j++) {
    dp[0][j] = { cost: j * COSTS.INSERT, op: 'insert', prevOp: 'insert' };
  }
  
  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const s = stim[i - 1].replace(/[0-9]/g, '').toUpperCase();
      const r = resp[j - 1].replace(/[0-9]/g, '').toUpperCase();
      
      const isMatch = s === r;
      const sim = getPhonemeSimilarity(s, r);
      
      // Calculate Substitution Cost
      let subCost = COSTS.SUB_VOWEL_CONS;
      const isSV = s in PHONOLOGICAL_FEATURES_V1 && PHONOLOGICAL_FEATURES_V1[s].manner === 0;
      const isRV = r in PHONOLOGICAL_FEATURES_V1 && PHONOLOGICAL_FEATURES_V1[r].manner === 0;
      
      if (isMatch) {
        subCost = COSTS.MATCH;
      } else if (isSV && isRV) {
        subCost = sim > 0.8 ? COSTS.SUB_SIMILAR_VOWEL : COSTS.SUB_VOWEL_VOWEL;
      } else if (!isSV && !isRV) {
        if (PHONOLOGICAL_FEATURES_V1[s]?.manner === PHONOLOGICAL_FEATURES_V1[r]?.manner) {
          subCost = sim > 0.8 ? COSTS.SUB_SIMILAR_CONS : COSTS.SUB_SAME_MANNER;
        } else {
          subCost = COSTS.SUB_CONS_CONS;
        }
      }
      
      // Candidate operations
      const candidates = [];
      
      // 1. Substitution / Match (Diagonal)
      const diag = dp[i - 1][j - 1];
      let currentSubCost = subCost;
      if (isMatch) {
        if (diag.op === 'insert') currentSubCost += COSTS.MATCH_EXCEPTION_INS;
        if (diag.op === 'delete') currentSubCost += COSTS.MATCH_EXCEPTION_DEL;
      }
      candidates.push({ cost: diag.cost + currentSubCost, op: isMatch ? 'match' : 'sub' });
      
      // 2. Deletion (Up)
      const up = dp[i - 1][j];
      let delCost = COSTS.DELETE;
      if (up.op === 'insert' || up.op === 'sub') delCost += COSTS.SWITCH_PENALTY;
      candidates.push({ cost: up.cost + delCost, op: 'delete' });
      
      // 3. Insertion (Left)
      const left = dp[i][j - 1];
      let insCost = COSTS.INSERT;
      if (left.op === 'delete' || left.op === 'sub') insCost += COSTS.SWITCH_PENALTY;
      candidates.push({ cost: left.cost + insCost, op: 'insert' });
      
      // Choose minimum cost
      candidates.sort((a, b) => a.cost - b.cost);
      dp[i][j] = candidates[0];
    }
  }
  
  // Backtrack to find alignment
  const alignment = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    const current = dp[i][j];
    if (current.op === 'match' || current.op === 'sub') {
      alignment.unshift({ stim: stim[i - 1], resp: resp[j - 1], op: current.op });
      i--; j--;
    } else if (current.op === 'delete') {
      alignment.unshift({ stim: stim[i - 1], resp: '-', op: 'delete' });
      i--;
    } else {
      alignment.unshift({ stim: '-', resp: resp[j - 1], op: 'insert' });
      j--;
    }
  }
  
  return { alignment, cost: dp[m][n].cost };
}

/**
 * src/lib/syntax/hmmPass.js
 * 
 * Deterministic HMM computation pass for the Syntax Layer.
 * Bridges HiddenMarkovModel (core) with the HHM summary builder (models).
 */

import { englishSyntaxHMM } from '../../hmm.js';
import { buildHiddenHarkovSummary } from '../models/harkov.model.js';

/**
 * Runs a Hidden Harkov Model pass over a sequence of tokens.
 * Enforces determinism via the underlying Viterbi implementation.
 * 
 * @param {Object[]} tokens - Classified tokens from syntax layer
 * @param {Set<string>} functionWords - Set of known function words
 * @returns {Object} HHM summary and per-token mapping
 */
export function runHmmPass(tokens, functionWords) {
  if (!tokens || tokens.length === 0) {
    return {
      summary: { enabled: false, stanzas: [] },
      tokenStateByIdentity: new Map()
    };
  }

  // 1. Prepare observations for HMM prediction
  const sortedTokens = [...tokens].sort((a, b) => {
    if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
    return a.wordIndex - b.wordIndex;
  });
  
  const observations = sortedTokens.map(t => t.word);
  
  // 2. Execute Viterbi prediction for coarse roles (content/function)
  const predictedRoles = englishSyntaxHMM.predict(observations, functionWords);
  
  // 3. Update token roles based on HMM prediction, but preserve roles that
  // were resolved via explicit precursor-context refinement (e.g. "my will"
  // disambiguating "will" as a noun via noun_precursor_context). The HMM is
  // a coarse content/function classifier and should not override targeted
  // contextual evidence.
  sortedTokens.forEach((token, i) => {
    const reasons = Array.isArray(token.reasons) ? token.reasons : [];
    const hasPrecursorRefinement =
      reasons.includes('noun_precursor_context')
      || reasons.includes('verb_precursor_context');
    if (hasPrecursorRefinement) return;
    token.role = predictedRoles[i];
  });

  // 4. Build the structural summary
  // We don't pass predictedHiddenStates here because we want the summary builder
  // to infer the high-fidelity states (terminal_anchor, stress_anchor, etc.)
  // based on the HMM-grounded roles and token positions.
  const { summary, tokenStateByIdentity } = buildHiddenHarkovSummary(tokens);

  return {
    summary,
    tokenStateByIdentity
  };
}

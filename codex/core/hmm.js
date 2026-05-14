/**
 * Hidden Markov Model (HMM) for Contextual Syntax Awareness
 * 
 * Provides probabilistic sequence tagging for words, giving the Syntax and Judiciary
 * layers a contextual understanding of sentence structure rather than just looking at
 * words in isolation.
 * 
 * @typedef {'content' | 'function'} HMMState
 * @typedef {string} Observation
 * 
 * @typedef {Object} HMMConfig
 * @property {HMMState[]} states
 * @property {Record<HMMState, number>} startProbabilities
 * @property {Record<HMMState, Record<HMMState, number>>} transitionProbabilities
 * @property {number} defaultEmissionProbability
 */

export class HiddenMarkovModel {
  /**
   * @param {HMMConfig} config 
   */
  constructor(config) {
    this.config = config;
  }

  /**
   * Get the emission probability of a word given a state, grounded in dictionary data.
   * @param {HMMState} state The hidden state (content or function)
   * @param {Observation} word The observed word
   * @param {boolean} isKnownFunction Whether the dictionary identifies this as a function word
   * @returns {number}
   */
  getEmissionProb(state, word, isKnownFunction) {
    // Deterministic grounding: If we KNOW it's a function word, it's highly unlikely to be content.
    if (isKnownFunction) {
      return state === 'function' ? 0.95 : 0.05;
    }
    
    // If it's not a known function word, it's very likely a content word.
    return state === 'content' ? 0.90 : 0.10;
  }

  /**
   * Viterbi algorithm to find the most likely sequence of hidden states.
   * @param {Observation[]} observations The sequence of observed words (e.g., a 4-line stanza)
   * @param {Set<string>} functionWords A Set of known function words for deterministic grounding
   * @returns {HMMState[]} The most likely sequence of states
   */
  predict(observations, functionWords) {
    if (observations.length === 0) return [];

    const numStates = this.config.states.length;
    const numObs = observations.length;
    
    // Use log probabilities to prevent numerical underflow in long sequences (stanzas)
    const viterbi = Array.from({ length: numObs }, () => Array(numStates).fill(-Infinity));
    const backpointer = Array.from({ length: numObs }, () => Array(numStates).fill(0));

    const log = (n) => (n === 0 ? -1e10 : Math.log(n));

    // Initialization (t = 0)
    for (let s = 0; s < numStates; s++) {
      const state = this.config.states[s];
      const isKnownFunc = functionWords.has(observations[0].toLowerCase());
      viterbi[0][s] = 
        log(this.config.startProbabilities[state] || 0) + 
        log(this.getEmissionProb(state, observations[0], isKnownFunc));
    }

    // Recursion (t > 0)
    for (let t = 1; t < numObs; t++) {
      const isKnownFunc = functionWords.has(observations[t].toLowerCase());
      for (let s = 0; s < numStates; s++) {
        const currentState = this.config.states[s];
        let maxLogProb = -Infinity;
        let bestPrevState = -1;

        for (let prev = 0; prev < numStates; prev++) {
          const prevState = this.config.states[prev];
          const transProb = this.config.transitionProbabilities[prevState]?.[currentState] || 0;
          
          const logProb = viterbi[t - 1][prev] + log(transProb) + log(this.getEmissionProb(currentState, observations[t], isKnownFunc));

          if (logProb > maxLogProb) {
            maxLogProb = logProb;
            bestPrevState = prev;
          }
        }

        viterbi[t][s] = maxLogProb;
        backpointer[t][s] = bestPrevState;
      }
    }

    // Termination
    let bestFinalState = -1;
    let maxFinalLogProb = -Infinity;
    for (let s = 0; s < numStates; s++) {
      if (viterbi[numObs - 1][s] > maxFinalLogProb) {
        maxFinalLogProb = viterbi[numObs - 1][s];
        bestFinalState = s;
      }
    }

    // Backtrack
    const bestPath = new Array(numObs);
    let currentStateIdx = bestFinalState;

    for (let t = numObs - 1; t >= 0; t--) {
      bestPath[t] = this.config.states[currentStateIdx];
      currentStateIdx = backpointer[t][currentStateIdx];
    }

    return bestPath;
  }
}

/**
 * Standard Syntax HMM configuration for Scholomance.
 * Transition probabilities reflect the flow of English literary meter.
 */
export const englishSyntaxHMM = new HiddenMarkovModel({
  states: ['content', 'function'],
  startProbabilities: {
    'content': 0.6,
    'function': 0.4
  },
  transitionProbabilities: {
    'content': {
      'content': 0.4,
      'function': 0.6 // Content words are often followed by modifiers/prepositions
    },
    'function': {
      'content': 0.85, // Function words almost always lead into content
      'function': 0.15
    }
  },
  defaultEmissionProbability: 0.0001
});

/**
 * RhymeAstrology core typedefs for runtime and build pipeline consumers.
 * JavaScript-only; JSDoc types are intentionally colocated for shared imports.
 */

/**
 * Deterministic phonetic signature derived from a token's phoneme sequence.
 * @typedef {Object} PhoneticSignature
 * @property {string[]} phonemes
 * @property {string[]} vowelSkeleton
 * @property {string[]} consonantSkeleton
 * @property {string} endingSignature
 * @property {string} onsetSignature
 * @property {string} stressPattern
 * @property {number} syllableCount
 */

/**
 * @typedef {Object} LexiconNode
 * @property {string} id
 * @property {string} token
 * @property {string} normalized
 * @property {string[]} phonemes
 * @property {string} stressPattern
 * @property {number} syllableCount
 * @property {string[]} vowelSkeleton
 * @property {string[]} consonantSkeleton
 * @property {string} endingSignature
 * @property {string} onsetSignature
 * @property {number} frequencyScore
 */

/**
 * @typedef {Object} SimilarityEdge
 * @property {string} fromId
 * @property {string} toId
 * @property {number} exactRhymeScore
 * @property {number} slantRhymeScore
 * @property {number} vowelMatchScore
 * @property {number} consonantMatchScore
 * @property {number} stressAlignmentScore
 * @property {number} syllableDeltaPenalty
 * @property {number} overallScore
 * @property {string[]} [reasons]
 */

/**
 * @typedef {Object} ConstellationCluster
 * @property {string} id
 * @property {string} anchorId
 * @property {string} label
 * @property {string[]} dominantVowelFamily
 * @property {string} dominantStressPattern
 * @property {string[]} members
 * @property {number} densityScore
 * @property {number} cohesionScore
 */

/**
 * @typedef {Object} QueryPattern
 * @property {string} rawText
 * @property {string[]} tokens
 * @property {LexiconNode[]} resolvedNodes
 * @property {string} [lineEndingSignature]
 * @property {string[]} [internalPattern]
 * @property {string} [stressContour]
 */

export const RHYME_ASTROLOGY_TYPES_VERSION = 1;

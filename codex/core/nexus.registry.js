/**
 * Nexus Registry - Deterministic Linguistic Synergies
 * 
 * Defines the synergies and mastery rules for words discovered in the Nexus.
 */

export const SYNERGIES = {
  LUMINANCE: {
    id: "LUMINANCE",
    name: "Luminance",
    description: "+5% Alchemy potency when this word is used in a multisyllabic rhyme.",
    school: "ALCHEMY",
    effect: (profile) => {
      if (profile.school === "ALCHEMY" && profile.rhymeQuality > 0.7) {
        return { damageMultiplier: 1.05 };
      }
      return null;
    }
  },
  RESONANCE: {
    id: "RESONANCE",
    name: "Harmonic Resonance",
    description: "+10% Sonic damage if used in a line with 3+ alliterations.",
    school: "SONIC",
    effect: (profile) => {
      if (profile.school === "SONIC" && profile.alliterationDensity > 0.4) {
        return { damageMultiplier: 1.10 };
      }
      return null;
    }
  },
  VOID_ECHO: {
    id: "VOID_ECHO",
    name: "Void Echo",
    description: "Status effects last 1 turn longer when using this word in the VOID school.",
    school: "VOID",
    effect: (profile) => {
      if (profile.school === "VOID") {
        return { statusDurationBonus: 1 };
      }
      return null;
    }
  }
};

export const WORD_SYNERGY_MAP = {
  "AETHER": ["LUMINANCE"],
  "ECHO": ["RESONANCE"],
  "VOID": ["VOID_ECHO"],
  "ABYSS": ["VOID_ECHO"],
  "GOLD": ["LUMINANCE"]
};

export const MASTERY_LEVELS = [
  { level: 1, name: "Discovered", expRequired: 0 },
  { level: 2, name: "Practiced", expRequired: 100 },
  { level: 3, name: "Fluent", expRequired: 500 },
  { level: 4, name: "Mastered", expRequired: 2000 },
  { level: 5, name: "Transcendent", expRequired: 10000 }
];

/**
 * Calculates mastery XP gain for a word based on use.
 * @param {string} word - The word used.
 * @param {Object} profile - The combat/scroll profile.
 * @returns {number} XP gained for this word.
 */
export function calculateWordMasteryXP(word, profile) {
  let xp = 10; // Base discovery/use XP
  
  // Bonus for school alignment
  const wordSchool = profile.wordSchools?.[word];
  if (wordSchool === profile.school) {
    xp += 15;
  }
  
  // Bonus for quality contribution
  if (profile.totalScore > 0.8) {
    xp += 25;
  }
  
  return xp;
}

/**
 * Gets unlocked synergies for a word at a specific mastery level.
 * @param {string} word - The word.
 * @param {number} level - Current mastery level.
 * @returns {string[]} List of synergy IDs.
 */
export function getUnlockedSynergies(word, level) {
  const allSynergies = WORD_SYNERGY_MAP[word.toUpperCase()] || [];
  // For now, level 3 unlocks the first synergy, level 5 unlocks all.
  if (level >= 5) return allSynergies;
  if (level >= 3) return allSynergies.slice(0, 1);
  return [];
}

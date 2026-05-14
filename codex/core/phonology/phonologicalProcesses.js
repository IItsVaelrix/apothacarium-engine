/**
 * Deterministic, ordered phonological rewrite rules for lightweight post-processing.
 * Rules operate over ARPAbet phone arrays and are intentionally conservative.
 */

function basePhone(phone) {
  return String(phone || "").replace(/[0-9]/g, "");
}

/**
 * @typedef {object} PhonologicalRuleTrace
 * @property {string} ruleId
 * @property {number} index
 * @property {string[]} before
 * @property {string[]} after
 */

/**
 * @typedef {object} ApplyProcessOptions
 * @property {boolean} [trace]
 */

const ORDERED_RULES = Object.freeze([
  {
    id: "nasal_place_assimilation_bilabial",
    apply(buffer, index) {
      const current = buffer[index];
      const next = buffer[index + 1];
      if (current !== "N" || !next) return null;

      const nextBase = basePhone(next);
      if (!["P", "B", "M"].includes(nextBase)) return null;

      const before = [current, next];
      buffer[index] = "M";
      const after = [buffer[index], buffer[index + 1]];
      return { ruleId: this.id, index, before, after };
    },
  },
  {
    id: "terminal_mb_cluster_reduction",
    apply(buffer, index) {
      const current = buffer[index];
      const next = buffer[index + 1];
      const afterNext = buffer[index + 2];

      if (current !== "M" || next !== "B" || afterNext) return null;

      const before = [current, next];
      buffer.splice(index + 1, 1);
      const after = [buffer[index]];
      return { ruleId: this.id, index, before, after };
    },
  },
]);

/**
 * Applies ordered phonological processes to a phoneme sequence.
 * @param {string[]} phonemes
 * @param {ApplyProcessOptions} [options]
 * @returns {string[] | { phonemes: string[], trace: PhonologicalRuleTrace[] }}
 */
export function applyPhonologicalProcesses(phonemes, options = {}) {
  const buffer = Array.isArray(phonemes) ? [...phonemes] : [];
  const trace = [];

  for (let index = 0; index < buffer.length; index += 1) {
    for (const rule of ORDERED_RULES) {
      const applied = rule.apply(buffer, index);
      if (!applied) continue;
      if (options.trace) trace.push(applied);
    }
  }

  if (options.trace) return { phonemes: buffer, trace };
  return buffer;
}

export const PHONOLOGICAL_PROCESS_RULES = ORDERED_RULES;

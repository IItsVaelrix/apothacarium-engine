import { buildPhoneticSignature, getDominantVowelFamily, stripStress } from './signatures.js';
import { clampUnitInterval } from './scoring.js';

const DEFAULT_CLUSTER_OPTIONS = Object.freeze({
  minScore: 0,
  maxClusters: 12,
});

/**
 * @param {string} value
 * @returns {string}
 */
function sanitizeIdPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'x';
}

/**
 * @param {string} endingSignature
 * @returns {string}
 */
function endingTail(endingSignature) {
  const parts = String(endingSignature || '')
    .split('-')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return 'open';
  const tail = parts
    .slice(1)
    .map(stripStress)
    .filter((part) => part && part.toUpperCase() !== 'OPEN')
    .join('-');
  return tail || 'open';
}

/**
 * @param {{
 *   signature?: import('./types.js').PhoneticSignature,
 *   phonemes?: string[],
 *   node?: { phonemes?: string[] },
 * }} match
 * @returns {import('./types.js').PhoneticSignature}
 */
function resolveMatchSignature(match) {
  if (match?.signature) return match.signature;
  if (Array.isArray(match?.phonemes)) return buildPhoneticSignature(match.phonemes);
  if (Array.isArray(match?.node?.phonemes)) return buildPhoneticSignature(match.node.phonemes);
  return buildPhoneticSignature([]);
}

/**
 * @param {string[]} values
 * @returns {string}
 */
function mode(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = String(value || '');
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Groups scored matches into lightweight consonance constellations.
 * @param {Array<{
 *   nodeId?: string,
 *   id?: string,
 *   token?: string,
 *   overallScore?: number,
 *   signature?: import('./types.js').PhoneticSignature,
 *   phonemes?: string[],
 *   node?: { phonemes?: string[] },
 * }>} matches
 * @param {{ minScore?: number, maxClusters?: number }} [options]
 * @returns {import('./types.js').ConstellationCluster[]}
 */
export function buildConstellationClusters(matches, options = {}) {
  const minScore = Number.isFinite(Number(options.minScore))
    ? Number(options.minScore)
    : DEFAULT_CLUSTER_OPTIONS.minScore;
  const maxClusters = Number.isFinite(Number(options.maxClusters))
    ? Math.max(1, Number(options.maxClusters))
    : DEFAULT_CLUSTER_OPTIONS.maxClusters;

  /** @type {Map<string, { key: string, family: string, tail: string, entries: { memberId: string, score: number, stress: string }[] }>} */
  const groups = new Map();

  for (const match of Array.isArray(matches) ? matches : []) {
    const score = clampUnitInterval(match?.overallScore);
    if (score < minScore) continue;

    const signature = resolveMatchSignature(match);
    const family = getDominantVowelFamily(signature) || 'UNK';
    const tail = endingTail(signature.endingSignature);
    const key = `${family}|${tail}`;
    const memberId = String(match?.nodeId || match?.id || match?.token || '').trim();
    if (!memberId) continue;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        family,
        tail,
        entries: [],
      });
    }

    groups.get(key).entries.push({
      memberId,
      score,
      stress: signature.stressPattern,
    });
  }

  const groupList = [...groups.values()];
  if (groupList.length === 0) return [];

  const maxGroupSize = Math.max(...groupList.map((group) => group.entries.length), 1);
  const clusters = groupList.map((group, index) => {
    const sortedEntries = [...group.entries].sort((a, b) => b.score - a.score);
    const members = [...new Set(sortedEntries.map((entry) => entry.memberId))];
    const cohesionScore = clampUnitInterval(
      sortedEntries.reduce((sum, entry) => sum + entry.score, 0) / Math.max(1, sortedEntries.length)
    );
    const densityScore = clampUnitInterval(members.length / maxGroupSize);
    const tailLabel = group.tail.toUpperCase() === 'OPEN' ? 'OPEN' : group.tail.toUpperCase();

    return {
      id: `c_${sanitizeIdPart(group.family)}_${sanitizeIdPart(group.tail)}_${index + 1}`,
      anchorId: members[0] || '',
      label: `${group.family.toUpperCase()}-${tailLabel} Cluster`,
      dominantVowelFamily: [group.family],
      dominantStressPattern: mode(sortedEntries.map((entry) => entry.stress)),
      members,
      densityScore,
      cohesionScore,
    };
  });

  return clusters
    .sort((first, second) => {
      const firstRank = (first.cohesionScore * 0.7) + (first.densityScore * 0.3);
      const secondRank = (second.cohesionScore * 0.7) + (second.densityScore * 0.3);
      return secondRank - firstRank;
    })
    .slice(0, maxClusters);
}

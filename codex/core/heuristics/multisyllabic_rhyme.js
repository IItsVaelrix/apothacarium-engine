import { DeepRhymeEngine } from '../rhyme-astrology/deepRhyme.engine.js';

const rhymeEngine = new DeepRhymeEngine();

const MIN_MULTISYLLABIC_MATCH = 2;
const INTERNAL_PLACEMENT_WEIGHT = 0.82;

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toPercent(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function normalizeToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

function stemToken(token) {
  if (!token || token.length <= 3) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
  return token;
}

function getTierProfile(connection) {
  const syllablesMatched = Number(connection?.syllablesMatched) || 0;
  if (syllablesMatched >= 4) {
    return { key: 'extended', label: '4+ syllable', authority: 1.0 };
  }
  if (syllablesMatched >= 3) {
    return { key: 'dactylic', label: 'dactylic', authority: 0.88 };
  }
  if (syllablesMatched >= 2) {
    return { key: 'feminine', label: 'feminine', authority: 0.72 };
  }
  return null;
}

function isEndRhyme(connection) {
  return Number(connection?.wordA?.lineIndex) !== Number(connection?.wordB?.lineIndex);
}

function getPlacementWeight(connection) {
  return isEndRhyme(connection) ? 1.0 : INTERNAL_PLACEMENT_WEIGHT;
}

function getConnectionAuthority(connection) {
  const tier = getTierProfile(connection);
  if (!tier) return 0;
  return clamp01((Number(connection?.score) || 0) * tier.authority * getPlacementWeight(connection));
}

function buildWordLookup(doc) {
  const words = Array.isArray(doc?.allWords) ? doc.allWords : [];
  const lookup = new Map();

  for (const word of words) {
    const start = Number(word?.start);
    if (!Number.isFinite(start)) continue;

    const normalized = normalizeToken(word?.normalized || word?.text);
    if (!normalized) continue;

    lookup.set(start, {
      normalized,
      stem: stemToken(normalized),
      surface: String(word?.text || normalized),
    });
  }

  return lookup;
}

function hasDistinctRoots(connection, wordLookup) {
  const left = wordLookup.get(Number(connection?.wordA?.charStart));
  const right = wordLookup.get(Number(connection?.wordB?.charStart));

  if (!left?.stem || !right?.stem) return true;
  return left.stem !== right.stem;
}

function buildDiagnostics(connections, wordLookup, limit = 5) {
  return [...connections]
    .sort((a, b) => getConnectionAuthority(b) - getConnectionAuthority(a))
    .slice(0, limit)
    .map((connection) => {
      const tier = getTierProfile(connection);
      const authority = getConnectionAuthority(connection);
      const distinctRoots = hasDistinctRoots(connection, wordLookup);
      const start = Math.min(connection.wordA.charStart, connection.wordB.charStart);
      const end = Math.max(connection.wordA.charEnd, connection.wordB.charEnd);

      return {
        start,
        end,
        severity: authority >= 0.8 ? 'success' : authority >= 0.62 ? 'info' : 'warning',
        message: distinctRoots
          ? `${tier?.label || 'multisyllabic'} rhyme chain`
          : 'Shared-root multisyllabic echo ignored',
        metadata: {
          pair: `${connection.wordA.word} <-> ${connection.wordB.word}`,
          score: clamp01(connection.score || 0),
          authority,
          subtype: connection.subtype || 'none',
          syllablesMatched: Number(connection.syllablesMatched) || 0,
          placement: isEndRhyme(connection) ? 'end' : 'internal',
          distinctRoots,
        },
      };
    });
}

async function scoreMultisyllabicRhyme(doc) {
  if (!doc || !doc.raw || !doc.raw.trim()) {
    return {
      heuristic: 'multisyllabic_rhyme',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No text to analyze.',
      diagnostics: [],
    };
  }

  const analysis = await rhymeEngine.analyzeDocument(doc.raw);
  const allConnections = Array.isArray(analysis?.allConnections) ? analysis.allConnections : [];
  const multiConnections = allConnections.filter(
    (connection) => (Number(connection?.syllablesMatched) || 0) >= MIN_MULTISYLLABIC_MATCH
  );

  if (multiConnections.length === 0) {
    return {
      heuristic: 'multisyllabic_rhyme',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: 'No multisyllabic rhyme chains detected.',
      diagnostics: [],
    };
  }

  const wordLookup = buildWordLookup(doc);
  const eligibleConnections = multiConnections.filter((connection) => hasDistinctRoots(connection, wordLookup));
  const excludedConnections = multiConnections.filter((connection) => !hasDistinctRoots(connection, wordLookup));

  if (eligibleConnections.length === 0) {
    return {
      heuristic: 'multisyllabic_rhyme',
      rawScore: 0,
      weight: 0.15,
      contribution: 0,
      explanation: `${multiConnections.length} multisyllabic rhyme link${multiConnections.length !== 1 ? 's' : ''} detected, but all reuse the same root and do not earn multisyllabic credit.`,
      diagnostics: buildDiagnostics(excludedConnections, wordLookup),
    };
  }

  const tierCounts = {
    feminine: 0,
    dactylic: 0,
    extended: 0,
  };
  const touchedLines = new Set();
  let totalAuthority = 0;
  let endRhymeCount = 0;

  for (const connection of eligibleConnections) {
    const tier = getTierProfile(connection);
    if (tier) {
      tierCounts[tier.key] += 1;
    }

    totalAuthority += getConnectionAuthority(connection);
    touchedLines.add(connection.wordA.lineIndex);
    touchedLines.add(connection.wordB.lineIndex);

    if (isEndRhyme(connection)) {
      endRhymeCount += 1;
    }
  }

  const lineCount = analysis?.lines?.length || doc?.lines?.length || 1;
  const averageAuthority = clamp01(totalAuthority / eligibleConnections.length);
  const density = clamp01(eligibleConnections.length / Math.max(1, allConnections.length));
  const lineCoverage = lineCount > 0 ? clamp01(touchedLines.size / lineCount) : 0;
  const endRhymeShare = clamp01(endRhymeCount / eligibleConnections.length);

  const rawScore = clamp01(
    averageAuthority * 0.55 +
    density * 0.25 +
    lineCoverage * 0.10 +
    endRhymeShare * 0.10
  );

  const explanationParts = [
    `${eligibleConnections.length} multisyllabic links`,
    `${tierCounts.feminine} feminine`,
    `${tierCounts.dactylic} dactylic`,
    `${tierCounts.extended} at 4+ syllables`,
    `authority ${toPercent(averageAuthority)}`,
    `density ${toPercent(density)}`,
    `line coverage ${toPercent(lineCoverage)}`,
  ];

  if (excludedConnections.length > 0) {
    explanationParts.push(`${excludedConnections.length} shared-root pair${excludedConnections.length !== 1 ? 's' : ''} excluded`);
  }

  return {
    heuristic: 'multisyllabic_rhyme',
    rawScore,
    explanation: explanationParts.join(', ') + '.',
    diagnostics: [
      ...buildDiagnostics(eligibleConnections, wordLookup),
      ...buildDiagnostics(excludedConnections, wordLookup, 2),
    ].slice(0, 5),
  };
}

export const multisyllabicRhymeHeuristic = {
  name: 'multisyllabic_rhyme',
  scorer: scoreMultisyllabicRhyme,
  weight: 0.15,
};

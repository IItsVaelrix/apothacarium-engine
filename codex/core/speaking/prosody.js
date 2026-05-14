const FOOT_PATTERNS = Object.freeze([
  Object.freeze({ id: 'IAMB', label: 'Iambic', grid: '01' }),
  Object.freeze({ id: 'TROCHEE', label: 'Trochaic', grid: '10' }),
  Object.freeze({ id: 'ANAPEST', label: 'Anapestic', grid: '001' }),
  Object.freeze({ id: 'DACTYL', label: 'Dactylic', grid: '100' }),
  Object.freeze({ id: 'AMPHIBRACH', label: 'Amphibrachic', grid: '010' }),
  Object.freeze({ id: 'SPONDEE', label: 'Spondaic', grid: '11' }),
]);

const CADENCE_WEIGHTS = Object.freeze({
  RESOLVED: 1.0,
  FALLING: 0.92,
  SURGING: 0.9,
  RISING: 0.72,
  LEVEL: 0.66,
  SUSPENDED: 0.58,
  WITHHELD: 0.54,
  CLIPPED: 0.5,
});

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeStressPattern(value) {
  return String(value || '').replace(/[^01]/g, '');
}

function extractLineStressPattern(line) {
  const direct = normalizeStressPattern(line?.stressPattern);
  if (direct) return direct;
  const words = Array.isArray(line?.words) ? line.words : [];
  return normalizeStressPattern(words.map((word) => word?.deepPhonetics?.stressPattern || word?.stressPattern || '').join(''));
}

function countLineSyllables(line) {
  const direct = Number(line?.syllableCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const words = Array.isArray(line?.words) ? line.words : [];
  return words.reduce((sum, word) => {
    return sum + (
      Number(word?.deepPhonetics?.syllableCount)
      || Number(word?.syllableCount)
      || Number(word?.phonetics?.syllableCount)
      || 1
    );
  }, 0);
}

function computeMismatch(pattern, grid) {
  const normalized = normalizeStressPattern(pattern);
  if (!normalized || !grid) return 1;
  let mismatches = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== grid[index % grid.length]) {
      mismatches += 1;
    }
  }
  return mismatches / normalized.length;
}

function resolveFoot(lines) {
  const patterns = lines.map((line) => extractLineStressPattern(line)).filter((pattern) => pattern.length >= 2);
  if (patterns.length === 0) {
    return {
      foot: FOOT_PATTERNS[0],
      averageMismatch: 1,
    };
  }

  let best = {
    foot: FOOT_PATTERNS[0],
    averageMismatch: Number.POSITIVE_INFINITY,
  };

  for (const candidate of FOOT_PATTERNS) {
    const mismatch = average(patterns.map((pattern) => computeMismatch(pattern, candidate.grid)));
    if (mismatch < best.averageMismatch) {
      best = {
        foot: candidate,
        averageMismatch: mismatch,
      };
    }
  }

  return best;
}

function feetLabel(count) {
  const labels = {
    1: 'Monometer',
    2: 'Dimeter',
    3: 'Trimeter',
    4: 'Tetrameter',
    5: 'Pentameter',
    6: 'Hexameter',
    7: 'Heptameter',
    8: 'Octameter',
  };
  return labels[count] || `${count}-Foot`;
}

function resolveMeterName(foot, feetPerLine) {
  if (!foot || !feetPerLine) return 'Free Verse';
  return `${foot.label} ${feetLabel(feetPerLine)}`;
}

function resolveTerminalPunctuation(lineText) {
  const text = String(lineText || '').trim();
  if (!text) return '';
  if (/[.]{3}$/.test(text) || /…$/.test(text)) return '...';
  const match = text.match(/[?!:;,.]$/);
  return match ? match[0] : '';
}

function detectCadenceTag(line, stressPattern) {
  const text = String(line?.text || '').trim();
  const punctuation = String(line?.terminalPunctuation || resolveTerminalPunctuation(text));
  const syllables = countLineSyllables(line);
  const endingStress = stressPattern.slice(-1);

  if (punctuation === '...') return 'WITHHELD';
  if (punctuation === '?') return 'RISING';
  if (punctuation === '!') {
    return endingStress === '1' ? 'SURGING' : 'RISING';
  }
  if (syllables > 0 && syllables <= 3) return 'CLIPPED';
  if (punctuation === ',' || punctuation === ';' || punctuation === ':') return 'SUSPENDED';
  if (endingStress === '0' && !punctuation) return 'WITHHELD';
  if (endingStress === '0') return 'LEVEL';
  if (endingStress === '1' && punctuation === '.') return 'RESOLVED';
  if (endingStress === '1') return 'FALLING';
  return punctuation ? 'RESOLVED' : 'SUSPENDED';
}

function dominantCadence(lineTags) {
  const counts = {};
  for (const line of lineTags) {
    const tag = String(line?.tag || '');
    if (!tag) continue;
    counts[tag] = (counts[tag] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'LEVEL';
  entries.sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    const rightWeight = CADENCE_WEIGHTS[right[0]] || 0;
    const leftWeight = CADENCE_WEIGHTS[left[0]] || 0;
    if (rightWeight !== leftWeight) return rightWeight - leftWeight;
    return left[0].localeCompare(right[0]);
  });
  return entries[0][0];
}

export function cadenceClosureWeight(tag) {
  return CADENCE_WEIGHTS[String(tag || '').toUpperCase()] || 0.5;
}

export function analyzeProsody(analyzedDoc) {
  const lines = Array.isArray(analyzedDoc?.lines)
    ? analyzedDoc.lines.filter((line) => String(line?.text || '').trim().length > 0)
    : [];

  if (lines.length === 0) {
    return {
      dominantFoot: 'MIXED',
      metricalGrid: '',
      meterName: 'Free Verse',
      feetPerLine: 0,
      beatAlignment: 0,
      controlledVariance: 0,
      closureScore: 0,
      cadence: {
        dominantTag: 'LEVEL',
        lineTags: [],
      },
      lines: [],
    };
  }

  const { foot, averageMismatch } = resolveFoot(lines);
  const lineProsody = lines.map((line, lineIndex) => {
    const stressPattern = extractLineStressPattern(line);
    const mismatch = computeMismatch(stressPattern, foot.grid);
    const alignment = clamp01(1 - mismatch);
    const expressiveDeviation = clamp01(1 - (Math.abs(mismatch - 0.18) / 0.24));
    const cadenceTag = detectCadenceTag(line, stressPattern);

    return {
      lineIndex,
      stressPattern,
      syllableCount: countLineSyllables(line),
      mismatch: Number(mismatch.toFixed(3)),
      beatAlignment: Number(alignment.toFixed(3)),
      expressiveDeviation: Number(expressiveDeviation.toFixed(3)),
      cadenceTag,
    };
  });

  const beatAlignment = average(lineProsody.map((line) => line.beatAlignment));
  const controlledVariance = average(lineProsody.map((line) => line.expressiveDeviation));
  const closureScore = average(lineProsody.map((line) => cadenceClosureWeight(line.cadenceTag)));
  const averageFeet = average(lineProsody.map((line) => {
    const patternLength = normalizeStressPattern(line.stressPattern).length;
    return foot.grid.length > 0 ? Math.round(patternLength / foot.grid.length) : 0;
  }));

  const cadenceLineTags = lineProsody.map((line) => ({
    lineIndex: line.lineIndex,
    tag: line.cadenceTag,
    beatAlignment: line.beatAlignment,
  }));

  return {
    dominantFoot: foot.id,
    metricalGrid: foot.grid,
    meterName: resolveMeterName(foot, Math.max(0, Math.round(averageFeet))),
    feetPerLine: Math.max(0, Math.round(averageFeet)),
    beatAlignment: Number(beatAlignment.toFixed(3)),
    controlledVariance: Number(controlledVariance.toFixed(3)),
    closureScore: Number(closureScore.toFixed(3)),
    deviation: Number(averageMismatch.toFixed(3)),
    cadence: {
      dominantTag: dominantCadence(cadenceLineTags),
      lineTags: cadenceLineTags,
    },
    lines: lineProsody,
  };
}

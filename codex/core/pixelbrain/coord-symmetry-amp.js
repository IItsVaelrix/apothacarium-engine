/**
 * COORDINATE SYMMETRY AMP MICROPROCESSOR
 *
 * Transforms coordinates using symmetry operations BEFORE render/export.
 * Separate from amp.symmetry (detection) — this is the transformation engine.
 *
 * PIPELINE:
 *   upload → amp.symmetry (detect) → amp.coord-symmetry (transform) → render/export
 *
 * STAGE: pre-render (after lattice generation, before canvas render)
 */

/**
 * Microprocessor metadata
 */
export const CoordSymmetryProcessor = {
  id: 'amp.coord-symmetry',
  version: '1.0.1',
  stage: 'pre-render',
  accepts: ['coordinates.array', 'lattice', 'symmetry.metadata'],
  emits: ['coordinates.transformed', 'symmetry.bytecode'],
};

const CANONICAL_DEBUG_FADE = 0.95;
const RADIAL_CANONICAL_ANGLES = Object.freeze([90, 180, 270]);

/**
 * Input Contract
 * @typedef {Object} CoordSymmetryInput
 * @property {string} assetId - Unique identifier
 * @property {Array} coordinates - Input coordinates [{x, y, color, emphasis}]
 * @property {Object} dimensions - Canvas dimensions {width, height}
 * @property {Object} symmetry - Symmetry metadata from amp.symmetry
 * @property {string} transformMode - 'overlay'|'replace'|'canonicalize'
 * @property {string} overlapPolicy - 'prefer-original'|'prefer-transformed'|'max-emphasis'|'blend'
 * @property {string} coordinateSpace - 'pixel'|'cell'
 * @property {boolean} snapToGrid - Snap transformed coords to grid
 * @property {number} cellSize - Grid cell size for snapping
 * @property {boolean} debugMirrorFade - Fade mirrors in preview (not export)
 */

/**
 * Output Contract
 * @typedef {Object} CoordSymmetryOutput
 * @property {string} assetId - Asset identifier
 * @property {boolean} ok - Success status
 * @property {number} originalCount - Input coordinate count
 * @property {number} transformedCount - Output coordinate count
 * @property {Array} coordinates - Transformed coordinates
 * @property {Object} bounds - Coordinate bounds {minX, maxX, minY, maxY}
 * @property {string[]} bytecode - Persistence metadata
 * @property {string[]} diagnostics - Processing log
 */

/**
 * Main processor entry point
 * @param {CoordSymmetryInput} input
 * @returns {CoordSymmetryOutput}
 */
export function runCoordSymmetryAmp(input) {
  const {
    assetId,
    coordinates,
    dimensions,
    symmetry,
    transformMode = 'overlay',
    overlapPolicy = 'prefer-original',
    coordinateSpace = 'pixel',
    snapToGrid = true,
    cellSize = 8,
    debugMirrorFade = false,
  } = input;

  const diagnostics = [];
  let transformed = [];

  // Validate input
  if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
    return {
      assetId,
      ok: false,
      originalCount: 0,
      transformedCount: 0,
      coordinates: [],
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      bytecode: ['AMP COORD-SYMMETRY', 'ERROR NO_COORDINATES'],
      diagnostics: ['No coordinates provided'],
    };
  }

  // STEP 1: Handle transform mode
  if (transformMode === 'overlay') {
    // Keep originals + add transformed
    transformed.push(...coordinates.map(c => ({
      ...c,
      symmetrySource: 'original',
    })));
  } else if (transformMode === 'replace' || transformMode === 'canonicalize') {
    // Only transformed (no originals)
    // For canonicalize, we'll rebuild full symmetric set below
  }

  // STEP 2: Apply symmetry transformations
  const axis = {
    x: symmetry?.axis?.x ?? dimensions.width / 2,
    y: symmetry?.axis?.y ?? dimensions.height / 2,
  };

  switch (symmetry?.type) {
    case 'vertical':
      coordinates.forEach(coord => {
        const mirrored = verticalMirror(coord, axis.x);
        applyEmphasisFade(mirrored, debugMirrorFade ? 0.9 : 1.0);
        
        transformed.push({
          ...mirrored,
          originalX: coord.x,
          originalY: coord.y,
          symmetrySource: 'vertical-mirror',
        });
      });
      diagnostics.push(`Applied vertical mirror @ x=${axis.x} (${coordinates.length} coords)`);
      break;

    case 'horizontal':
      coordinates.forEach(coord => {
        const mirrored = horizontalMirror(coord, axis.y);
        applyEmphasisFade(mirrored, debugMirrorFade ? 0.9 : 1.0);
        
        transformed.push({
          ...mirrored,
          originalX: coord.x,
          originalY: coord.y,
          symmetrySource: 'horizontal-mirror',
        });
      });
      diagnostics.push(`Applied horizontal mirror @ y=${axis.y} (${coordinates.length} coords)`);
      break;

    case 'radial':
      [90, 180, 270].forEach(angle => {
        coordinates.forEach(coord => {
          const rotated = radialRotate(coord, axis.x, axis.y, angle);
          applyEmphasisFade(rotated, debugMirrorFade ? 0.85 : 1.0);
          
          transformed.push({
            ...rotated,
            originalX: coord.x,
            originalY: coord.y,
            symmetrySource: `radial-${angle}`,
          });
        });
      });
      diagnostics.push(`Applied radial rotation (${coordinates.length * 3} coords)`);
      break;

    case 'diagonal':
      coordinates.forEach(coord => {
        const mirrored = diagonalMirror(coord);
        applyEmphasisFade(mirrored, debugMirrorFade ? 0.9 : 1.0);
        
        transformed.push({
          ...mirrored,
          originalX: coord.x,
          originalY: coord.y,
          symmetrySource: 'diagonal-mirror',
        });
      });
      diagnostics.push(`Applied diagonal mirror (${coordinates.length} coords)`);
      break;

    default:
      diagnostics.push('No symmetry type specified — returning originals');
      transformed = coordinates.map(c => ({ ...c, symmetrySource: 'original' }));
  }

  // STEP 3: Handle canonicalize mode (rebuild full symmetric set)
  if (transformMode === 'canonicalize') {
    transformed = canonicalizeSymmetry(coordinates, symmetry, axis, debugMirrorFade);
    diagnostics.push(`Canonicalized symmetry (${transformed.length} total coords)`);
  }

  // STEP 4: Snap to grid if requested
  if (snapToGrid) {
    const snapUnit = coordinateSpace === 'cell' ? 1 : cellSize;
    transformed.forEach(coord => {
      if (coordinateSpace === 'cell') {
        coord.x = Math.round(coord.x);
        coord.y = Math.round(coord.y);
      } else {
        coord.x = Math.round(coord.x / cellSize) * cellSize;
        coord.y = Math.round(coord.y / cellSize) * cellSize;
      }
    });
    diagnostics.push(`Snapped to ${snapUnit}${coordinateSpace === 'cell' ? ' cell' : 'px'} grid`);
  }

  // STEP 5: Handle overlaps
  transformed = resolveOverlaps(transformed, overlapPolicy);
  const overlapCount = coordinates.length * (transformed.length / coordinates.length - 1);
  if (overlapCount > 0) {
    diagnostics.push(`Resolved ${overlapCount} overlapping coordinates (${overlapPolicy})`);
  }

  // STEP 6: Calculate bounds
  const bounds = {
    minX: Math.min(...transformed.map(c => c.x)),
    maxX: Math.max(...transformed.map(c => c.x)),
    minY: Math.min(...transformed.map(c => c.y)),
    maxY: Math.max(...transformed.map(c => c.y)),
  };

  // STEP 7: Generate bytecode for persistence
  const bytecode = [
    'AMP COORD-SYMMETRY',
    `SYMMETRY_TYPE ${symmetry?.type || 'none'}`,
    `TRANSFORM_MODE ${transformMode}`,
    `ORIGINAL_COUNT ${coordinates.length}`,
    `TRANSFORMED_COUNT ${transformed.length}`,
    `OVERLAP_POLICY ${overlapPolicy}`,
    `BOUNDS ${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`,
    `AXIS ${axis.x},${axis.y}`,
  ];

  return {
    assetId,
    ok: true,
    originalCount: coordinates.length,
    transformedCount: transformed.length,
    coordinates: transformed,
    bounds,
    bytecode,
    diagnostics,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFORMATION FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vertical mirror (left ↔ right) around axis
 */
export function verticalMirror(coord, axisX) {
  return {
    x: Math.round((axisX * 2) - coord.x),
    y: coord.y,
    color: coord.color,
    emphasis: coord.emphasis,
  };
}

/**
 * Horizontal mirror (top ↔ bottom) around axis
 */
export function horizontalMirror(coord, axisY) {
  return {
    x: coord.x,
    y: Math.round((axisY * 2) - coord.y),
    color: coord.color,
    emphasis: coord.emphasis,
  };
}

/**
 * Radial rotation around center point
 */
export function radialRotate(coord, centerX, centerY, angle = 90) {
  const rad = (angle * Math.PI) / 180;
  const dx = coord.x - centerX;
  const dy = coord.y - centerY;
  
  return {
    x: Math.round(centerX + dx * Math.cos(rad) - dy * Math.sin(rad)),
    y: Math.round(centerY + dx * Math.sin(rad) + dy * Math.cos(rad)),
    color: coord.color,
    emphasis: coord.emphasis,
  };
}

/**
 * Diagonal mirror (swap X ↔ Y)
 */
export function diagonalMirror(coord) {
  return {
    x: coord.y,
    y: coord.x,
    color: coord.color,
    emphasis: coord.emphasis,
  };
}

/**
 * Apply emphasis fade (for debug preview, not canonical output)
 */
function applyEmphasisFade(coord, factor) {
  if (factor < 1.0) {
    coord.emphasis = Math.max(0.1, coord.emphasis * factor);
  }
}

/**
 * Canonicalize symmetry — rebuild full symmetric set from the governing region.
 */
function canonicalizeSymmetry(coordinates, symmetry, axis, debugFade) {
  switch (symmetry?.type) {
    case 'vertical':
      return canonicalizeMirrorPair(
        coordinates,
        [
          coordinates.filter(c => c.x < axis.x),
          coordinates.filter(c => c.x >= axis.x),
        ],
        coord => verticalMirror(coord, axis.x),
        'vertical-mirror',
        debugFade
      );

    case 'horizontal':
      return canonicalizeMirrorPair(
        coordinates,
        [
          coordinates.filter(c => c.y < axis.y),
          coordinates.filter(c => c.y >= axis.y),
        ],
        coord => horizontalMirror(coord, axis.y),
        'horizontal-mirror',
        debugFade
      );

    case 'radial':
      return canonicalizeRadial(coordinates, axis, debugFade);

    case 'diagonal':
      return canonicalizeMirrorPair(
        coordinates,
        [
          coordinates.filter(c => c.x >= c.y),
          coordinates.filter(c => c.x < c.y),
        ],
        diagonalMirror,
        'diagonal-mirror',
        debugFade
      );

    default:
      return coordinates.map(c => ({ ...c, symmetrySource: 'original' }));
  }
}

function canonicalizeMirrorPair(coordinates, groups, transform, symmetrySource, debugFade) {
  const governingSide = selectGoverningGroup(groups, coordinates);
  const result = governingSide.map(c => ({ ...c, symmetrySource: 'original' }));

  governingSide.forEach(c => {
    const mirrored = transform(c);
    applyEmphasisFade(mirrored, debugFade ? CANONICAL_DEBUG_FADE : 1.0);
    result.push({
      ...mirrored,
      originalX: c.x,
      originalY: c.y,
      symmetrySource,
    });
  });

  return result;
}

function canonicalizeRadial(coordinates, axis, debugFade) {
  const quadrants = [0, 1, 2, 3].map(quadrant =>
    coordinates.filter(coord => getRadialQuadrant(coord, axis) === quadrant)
  );
  const governingQuadrant = selectGoverningGroup(quadrants, coordinates);
  const result = governingQuadrant.map(c => ({ ...c, symmetrySource: 'original' }));

  RADIAL_CANONICAL_ANGLES.forEach(angle => {
    governingQuadrant.forEach(c => {
      const rotated = radialRotate(c, axis.x, axis.y, angle);
      applyEmphasisFade(rotated, debugFade ? CANONICAL_DEBUG_FADE : 1.0);
      result.push({
        ...rotated,
        originalX: c.x,
        originalY: c.y,
        symmetrySource: `radial-${angle}`,
      });
    });
  });

  return result;
}

function selectGoverningGroup(groups, fallback) {
  const selected = groups.reduce((winner, group) =>
    group.length > winner.length ? group : winner
  , groups[0] || []);

  return selected.length > 0 ? selected : fallback;
}

function getRadialQuadrant(coord, axis) {
  const right = coord.x >= axis.x;
  const bottom = coord.y >= axis.y;
  if (right && !bottom) return 0;
  if (right && bottom) return 1;
  if (!right && bottom) return 2;
  return 3;
}

/**
 * Resolve overlapping coordinates based on policy
 */
function resolveOverlaps(coordinates, policy) {
  // Group by position (rounded to avoid sub-pixel duplicates)
  const byPosition = new Map();
  
  coordinates.forEach(coord => {
    const key = `${Math.round(coord.x)},${Math.round(coord.y)}`;
    if (!byPosition.has(key)) {
      byPosition.set(key, []);
    }
    byPosition.get(key).push(coord);
  });
  
  const result = [];
  
  byPosition.forEach((coords, _key) => {
    if (coords.length === 1) {
      result.push(coords[0]);
      return;
    }
    
    // Multiple coords at same position — apply policy
    switch (policy) {
      case 'prefer-original': {
        const original = coords.find(c => c.symmetrySource === 'original');
        result.push(original || coords[0]);
        break;
      }

      case 'prefer-transformed': {
        const transformed = coords.find(c => c.symmetrySource !== 'original');
        result.push(transformed || coords[0]);
        break;
      }

      case 'max-emphasis': {
        const maxEmphasis = coords.reduce((a, b) =>
          a.emphasis > b.emphasis ? a : b
        );
        result.push(maxEmphasis);
        break;
      }

      case 'blend': {
        // Average colors and max emphasis
        const avgColor = blendColors(coords.map(c => c.color));
        const maxEmp = Math.max(...coords.map(c => c.emphasis));
        result.push({
          ...coords[0],
          color: avgColor,
          emphasis: maxEmp,
          symmetrySource: 'blended',
        });
        break;
      }

      default:
        result.push(coords[0]);
    }
  });
  
  return result;
}

/**
 * Blend multiple hex colors
 */
function blendColors(colors) {
  if (colors.length === 1) return colors[0];
  
  let r = 0, g = 0, b = 0;
  colors.forEach(hex => {
    r += parseInt(hex.slice(1, 3), 16);
    g += parseInt(hex.slice(3, 5), 16);
    b += parseInt(hex.slice(5, 7), 16);
  });
  
  const count = colors.length;
  const avgR = Math.round(r / count);
  const avgG = Math.round(g / count);
  const avgB = Math.round(b / count);
  
  return `#${[avgR, avgG, avgB].map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

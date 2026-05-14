/**
 * LATTICE GRID ENGINE — Spatial Bytecode Execution Model
 *
 * Aseprite-compatible deterministic grid system.
 * Grid is not UI decoration — it is spatial bytecode.
 *
 * CORE PRINCIPLES:
 * ───────────────
 * 1. CONSTANTS: TILE_W, TILE_H, ORIGIN_X, ORIGIN_Y define the lattice space
 * 2. NORMALIZATION: LOCAL_X = MOUSE_X - ORIGIN_X (normalize to grid-local)
 * 3. QUANTIZATION: CELL_X = floor(LOCAL_X / TILE_W) (discrete address space)
 * 4. MODULO: INNER_X = LOCAL_X % TILE_W (offset inside resolved cell)
 * 5. RENDER: Lines at ORIGIN + n*TILE (iterative arithmetic expansion)
 * 6. SNAP: Rewrite coordinates to nearest legal grid point
 *
 * The grid is a spatial execution model.
 */

import { safeDivide, toFinite } from '../shared/math/safe.js';
import { verseIRMicroprocessors } from '../microprocessors/index.js';
import { generateSymmetryOverlay } from './symmetry-amp.js';

/**
 * LATTICE CONSTANTS — Spatial bytecode registers
 */
const LATTICE_CONSTANTS = {
  ORIGIN_X: 0,
  ORIGIN_Y: 0,
  MIN_CELL_SIZE: 1,
  MAX_CELL_SIZE: 64,
  MAX_CANVAS_DIM: 16384, // GPU limit for most modern browsers
  COMMON_CELL_SIZES: [1, 2, 4, 8, 16, 32, 64],
};

function generateBufferHash(buffer) {
  let hash = 5381;
  // Sample every 64th byte for performance on large images
  for (let i = 0; i < buffer.length; i += 64) {
    hash = ((hash << 5) + hash) ^ buffer[i];
  }
  return (hash >>> 0).toString(16);
}

/**
 * Generate complete lattice grid from image analysis
 *
 * AUTOMATIC SYMMETRY DETECTION:
 * Every upload is analyzed for inherent symmetry patterns.
 * Detected symmetry is automatically applied to the lattice.
 *
 * @param {Object} imageAnalysis - Backend analysis result
 * @returns {Object} Lattice grid with symmetry applied
 */
export async function generateLatticeGrid(imageAnalysis) {
  const { pixelData, dimensions } = imageAnalysis;
  const { width: srcW, height: srcH } = dimensions;

  const contentHash = generateBufferHash(pixelData);
  const assetId = `upload_${contentHash}`;

  // ── STEP 1: DETECT SYMMETRY via Microprocessor ─────────────────────────────
  const symmetryResult = await verseIRMicroprocessors.execute('amp.symmetry', {
    assetId,
    sourceType: 'image',
    pixelData,
    dimensions,
    options: {
      autoApply: false, // Don't auto-apply here, caller decides
      emitOverlay: true,
      emitBytecode: true,
      cropToOpaqueBounds: true,
      significanceThreshold: 0.65,
    },
  });

  const symmetry = symmetryResult.symmetry;
  console.log('[Symmetry AMP]', symmetry);
  console.log('[Symmetry AMP Diagnostics]', symmetryResult.diagnostics);
  console.log('[Symmetry AMP Bytecode]', symmetryResult.bytecodeMetadata);

  // ── STEP 2: DETECT OPTIMAL CELL SIZE ──────────────────────────────────────
  const cellSize = detectOptimalCellSize(pixelData, srcW, srcH);

  // ── STEP 3: CALCULATE GRID DIMENSIONS ─────────────────────────────────────
  const cols = Math.ceil(srcW / cellSize);
  const rows = Math.ceil(srcH / cellSize);

  // ── STEP 4: CREATE LATTICE STRUCTURE ──────────────────────────────────────
  const lattice = {
    width: srcW,
    height: srcH,
    cellSize,
    cols,
    rows,
    cells: new Map(),
    symmetry, // Attach symmetry metadata from microprocessor
  };

  // ── STEP 5: POPULATE LATTICE FROM PIXEL DATA ──────────────────────────────
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellPixels = [];
      for (let py = row * cellSize; py < Math.min((row + 1) * cellSize, srcH); py++) {
        for (let px = col * cellSize; px < Math.min((col + 1) * cellSize, srcW); px++) {
          const idx = (py * srcW + px) * 4;
          const r = pixelData[idx];
          const g = pixelData[idx + 1];
          const b = pixelData[idx + 2];
          const a = pixelData[idx + 3];
          if (a > 128) {
            cellPixels.push({ r, g, b, a, x: px, y: py });
          }
        }
      }
      if (cellPixels.length > 0) {
        const avgColor = averageColors(cellPixels);
        const emphasis = cellPixels.length / (cellSize * cellSize);
        lattice.cells.set(`${col},${row}`, {
          col,
          row,
          color: rgbToHex(avgColor.r, avgColor.g, avgColor.b),
          emphasis: Math.max(0.1, Math.min(1, emphasis)),
          pixelCount: cellPixels.length,
        });
      }
    }
  }

  // ── STEP 6: APPLY COORDINATE SYMMETRY via Microprocessor ───────────────────
  if (symmetry && symmetry.significant && symmetry.type !== 'none') {
    const coordSymmetryResult = await verseIRMicroprocessors.execute('amp.coord-symmetry', {
      assetId,
      coordinates: Array.from(lattice.cells.values()).map(c => ({
        x: c.col * cellSize,
        y: c.row * cellSize,
        color: c.color,
        emphasis: c.emphasis,
      })),
      dimensions: { width: cols * cellSize, height: rows * cellSize },
      symmetry,
      options: {
        transformMode: 'canonicalize', // Rebuild full symmetric set
        overlapPolicy: 'prefer-original',
        coordinateSpace: 'pixel',
        snapToGrid: true,
        cellSize,
        debugMirrorFade: false, // No fade for canonical output
      },
    });

    console.log('[Coord Symmetry]', coordSymmetryResult.diagnostics);
    console.log('[Coord Symmetry Bytecode]', coordSymmetryResult.bytecode);

    // Rebuild lattice with transformed coordinates
    const transformedLattice = {
      ...lattice,
      cells: new Map(),
      symmetryResult: coordSymmetryResult,
    };

    // Add transformed coordinates to lattice cells
    coordSymmetryResult.coordinates.forEach((coord, _idx) => {
      const col = Math.round(coord.x / cellSize);
      const row = Math.round(coord.y / cellSize);
      transformedLattice.cells.set(`${col},${row}`, {
        col,
        row,
        color: coord.color,
        emphasis: coord.emphasis,
        symmetrySource: coord.symmetrySource,
        originalX: coord.originalX,
        originalY: coord.originalY,
      });
    });

    return transformedLattice;
  }

  return lattice;
}

/**
 * Detect optimal cell size from pixel data
 * Analyzes runs of identical colors to find natural grid boundaries
 */
function detectOptimalCellSize(pixelData, width, height) {
  const commonSizes = [1, 2, 4, 8, 16, 32];

  // Test each candidate cell size
  for (const size of commonSizes) {
    if (width % size === 0 && height % size === 0) {
      // Check if this size creates clean cell boundaries
      const consistency = testCellSizeConsistency(pixelData, width, height, size);
      if (consistency > 0.7) {
        return size;
      }
    }
  }

  // Default: use smallest dimension / 16 as heuristic
  const heuristicSize = toFinite(Math.min(width, height) / 16);
  return Math.max(LATTICE_CONSTANTS.MIN_CELL_SIZE, heuristicSize);
}

/**
 * Test how consistent a cell size is across the image
 * Returns 0-1 score (1 = perfect cell boundaries)
 */
function testCellSizeConsistency(pixelData, width, height, cellSize) {
  let consistentCells = 0;
  let totalCells = 0;

  for (let row = 0; row < height; row += cellSize) {
    for (let col = 0; col < width; col += cellSize) {
      totalCells++;

      // Sample center pixel of potential cell
      const centerX = Math.min(col + cellSize / 2, width - 1);
      const centerY = Math.min(row + cellSize / 2, height - 1);
      const centerIdx = (Math.floor(centerY) * width + Math.floor(centerX)) * 4;

      // Check if pixels within cell are mostly uniform
      let uniformPixels = 0;
      let samplePixels = 0;
      const centerR = pixelData[centerIdx];
      const centerG = pixelData[centerIdx + 1];
      const centerB = pixelData[centerIdx + 2];

      for (let y = row; y < Math.min(row + cellSize, height); y += 2) {
        for (let x = col; x < Math.min(col + cellSize, width); x += 2) {
          samplePixels++;
          const idx = (y * width + x) * 4;
          const dr = Math.abs(pixelData[idx] - centerR);
          const dg = Math.abs(pixelData[idx + 1] - centerG);
          const db = Math.abs(pixelData[idx + 2] - centerB);

          if (dr + dg + db < 60) { // Similar color threshold
            uniformPixels++;
          }
        }
      }

      if (samplePixels > 0 && uniformPixels / samplePixels > 0.6) {
        consistentCells++;
      }
    }
  }

  return totalCells > 0 ? consistentCells / totalCells : 0;
}

/**
 * Average multiple colors together
 */
function averageColors(pixels) {
  const sum = pixels.reduce((acc, p) => ({
    r: acc.r + p.r,
    g: acc.g + p.g,
    b: acc.b + p.b,
    a: acc.a + p.a,
  }), { r: 0, g: 0, b: 0, a: 0 });

  const count = pixels.length;
  return {
    r: Math.round(sum.r / count),
    g: Math.round(sum.g / count),
    b: Math.round(sum.b / count),
    a: Math.round(sum.a / count),
  };
}

/**
 * Convert RGB to hex string
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, x)).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('').toUpperCase();
}

/**
 * Build occupancy set from lattice cells for hit testing
 * @param {Object} lattice - Lattice object
 * @returns {Set<string>} Occupied cell addresses as "col,row"
 */
export function buildOccupancySet(lattice) {
  const occupied = new Set();
  lattice.cells.forEach((cell) => {
    occupied.add(`${cell.col},${cell.row}`);
  });
  return occupied;
}

/**
 * Render lattice to canvas (visual only - interaction handled separately)
 *
 * CRISP RENDERING RULES:
 * ──────────────────────
 * 1. Canvas backing resolution = display size (no CSS scaling)
 * 2. Grid lines at integer pixel positions (+0.5 for crisp stroke)
 * 3. imageSmoothingEnabled = false
 * 4. Cell blocks drawn as rects, not scaled images
 * 5. Grid drawn AFTER cells, BEFORE effects
 *
 * @param {HTMLCanvasElement} canvas - Target canvas
 * @param {Object} lattice - Lattice from generateLatticeGrid
 * @param {number} zoom - Zoom level (INTEGER multiplier only: 1, 2, 4, 8, 16)
 */
export function renderLattice(canvas, lattice, zoom = 4) {
  const ctx = canvas.getContext('2d');
  const { cols, rows, cellSize, cells } = lattice;

  // Extract constants
  const { ORIGIN_X, ORIGIN_Y, MAX_CANVAS_DIM } = LATTICE_CONSTANTS;
  const TILE_W = cellSize;
  const TILE_H = cellSize;

  // CRITICAL: Force integer display dimensions and clamp to GPU limits
  const displayWidth = Math.min(MAX_CANVAS_DIM, toFinite(Math.floor((cols * TILE_W * zoom) + ORIGIN_X)));
  const displayHeight = Math.min(MAX_CANVAS_DIM, toFinite(Math.floor((rows * TILE_H * zoom) + ORIGIN_Y)));
  
  // Set canvas backing resolution to match display (no CSS scaling)
  canvas.width = displayWidth;
  canvas.height = displayHeight;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;

  // Disable smoothing for crisp pixels
  ctx.imageSmoothingEnabled = false;

  // Clear background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(ORIGIN_X, ORIGIN_Y, displayWidth, displayHeight);

  // Draw cells as integer blocks (no scaling artifacts)
  cells.forEach((cell) => {
    const x = toFinite(Math.floor(ORIGIN_X + (cell.col * TILE_W * zoom)));
    const y = toFinite(Math.floor(ORIGIN_Y + (cell.row * TILE_H * zoom)));
    const size = toFinite(Math.floor(TILE_W * zoom));

    ctx.fillStyle = cell.color;
    ctx.fillRect(x, y, size, size);

    // Emphasis glow (only for high-emphasis cells)
    if (cell.emphasis > 0.7) {
      ctx.shadowColor = cell.color;
      ctx.shadowBlur = toFinite(8 * cell.emphasis);
      ctx.fillRect(x, y, size, size);
      ctx.shadowBlur = 0;
    }
  });

  // Draw grid lines - CRISP INTEGER POSITIONING
  // Use fillRect instead of stroke for maximum crispness
  ctx.fillStyle = 'rgba(201, 162, 39, 0.35)'; // Golden amber, boosted opacity

  // Vertical grid lines (1px wide, integer positions)
  for (let n = 0; n <= cols; n++) {
    const x = toFinite(Math.floor(ORIGIN_X + (n * TILE_W * zoom)));
    ctx.fillRect(x, ORIGIN_Y, 1, displayHeight);
  }

  // Horizontal grid lines (1px tall, integer positions)
  for (let n = 0; n <= rows; n++) {
    const y = Math.floor(ORIGIN_Y + (n * TILE_H * zoom));
    ctx.fillRect(ORIGIN_X, y, displayWidth, 1);
  }

  // Draw symmetry overlay (if detected)
  if (lattice.symmetry && lattice.symmetry.significant) {
    const overlay = generateSymmetryOverlay(lattice.symmetry, cols * cellSize, rows * cellSize, zoom);
    overlay.forEach(cmd => {
      if (cmd.type === 'line') {
        ctx.strokeStyle = cmd.color;
        ctx.lineWidth = toFinite(cmd.lineWidth);
        ctx.setLineDash(cmd.dash || []);
        ctx.beginPath();
        ctx.moveTo(toFinite(cmd.x1), toFinite(cmd.y1));
        ctx.lineTo(toFinite(cmd.x2), toFinite(cmd.y2));
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (cmd.type === 'circle') {
        ctx.fillStyle = cmd.color;
        ctx.beginPath();
        ctx.arc(toFinite(cmd.x), toFinite(cmd.y), toFinite(cmd.radius), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Debug: log scale info
  console.log('[Lattice Render]', {
    cols, rows, cellSize, zoom,
    displayWidth, displayHeight,
    scaleX: safeDivide(displayWidth, (cols * cellSize)),
    scaleY: safeDivide(displayHeight, (rows * cellSize)),
    isIntegerScale: Number.isInteger(safeDivide(displayWidth, (cols * cellSize))) && 
                    Number.isInteger(safeDivide(displayHeight, (rows * cellSize))),
    symmetry: lattice.symmetry?.type || 'none',
  });
}

/**
 * Resolve click to lattice cell coordinates
 * PURE FUNCTION - no side effects, just math
 *
 * @param {number} clientX - Mouse client X
 * @param {number} clientY - Mouse client Y
 * @param {DOMRect} rect - Canvas bounding rect
 * @param {Object} lattice - Lattice object
 * @param {number} zoom - Zoom level
 * @param {number} offsetX - Sprite offset X (if centered in larger canvas)
 * @param {number} offsetY - Sprite offset Y
 * @returns {{col: number, row: number, hit: boolean, innerX: number, innerY: number}}
 */
export function resolveLatticeClick(clientX, clientY, rect, lattice, zoom, offsetX = 0, offsetY = 0) {
  const { ORIGIN_X, ORIGIN_Y } = LATTICE_CONSTANTS;
  const TILE_W = lattice.cellSize;
  const TILE_H = lattice.cellSize;

  // Scale factors for canvas vs display
  const scaleX = rect.width > 0 ? lattice.cols * TILE_W * zoom / rect.width : 1;
  const scaleY = rect.height > 0 ? lattice.rows * TILE_H * zoom / rect.height : 1;

  // Mouse position in canvas space
  const mouseX = (clientX - rect.left) * scaleX;
  const mouseY = (clientY - rect.top) * scaleY;

  // NORMALIZATION: LOCAL = MOUSE - ORIGIN - OFFSET
  const localX = mouseX - ORIGIN_X - offsetX;
  const localY = mouseY - ORIGIN_Y - offsetY;

  // Early exit if outside sprite bounds
  if (localX < 0 || localY < 0) {
    return { col: -1, row: -1, hit: false, innerX: 0, innerY: 0 };
  }

  // QUANTIZATION: CELL = floor(LOCAL / TILE)
  const col = Math.floor(localX / TILE_W);
  const row = Math.floor(localY / TILE_H);

  // MODULO: INNER = LOCAL % TILE
  const innerX = localX % TILE_W;
  const innerY = localY % TILE_H;

  // Bounds test
  if (col < 0 || col >= lattice.cols || row < 0 || row >= lattice.rows) {
    return { col: -1, row: -1, hit: false, innerX, innerY };
  }

  // Occupancy test
  const occupied = buildOccupancySet(lattice);
  const hit = occupied.has(`${col},${row}`);

  return { col, row, hit, innerX, innerY };
}

/**
 * Paint a cell in the lattice
 * @param {Object} lattice - Lattice object
 * @param {number} col - Column index
 * @param {number} row - Row index
 * @param {string} color - Hex color
 */
export function paintCell(lattice, col, row, color) {
  const key = `${col},${row}`;
  const existing = lattice.cells.get(key);

  lattice.cells.set(key, {
    col,
    row,
    color,
    emphasis: existing?.emphasis || 1,
    pixelCount: existing?.pixelCount || lattice.cellSize * lattice.cellSize,
  });
}

/**
 * Clear a cell in the lattice
 * @param {Object} lattice - Lattice object
 * @param {number} col - Column index
 * @param {number} row - Row index
 */
export function clearCell(lattice, col, row) {
  lattice.cells.delete(`${col},${row}`);
}

/**
 * Export lattice to Aseprite-compatible format
 *
 * CENTERING RULE:
 * - Horizontally center the occupied pixel bounds
 * - Vertically bottom-align (flames have empty space above)
 * - Canvas size = standard asset dimensions (32x32, 64x64, etc.)
 *
 * @param {Object} lattice - Lattice object
 * @param {number} targetWidth - Target canvas width (default: auto-fit to content)
 * @param {number} targetHeight - Target canvas height (default: auto-fit to content)
 * @returns {Object} Aseprite data structure with centered pixels
 */
export function exportLatticeToAseprite(lattice, targetWidth = null, targetHeight = null) {
  const { cellSize, cells } = lattice;

  // STEP 1: Find bounds of occupied cells
  let minCol = Infinity, maxCol = -Infinity;
  let minRow = Infinity, maxRow = -Infinity;

  cells.forEach((cell) => {
    if (cell.col < minCol) minCol = cell.col;
    if (cell.col > maxCol) maxCol = cell.col;
    if (cell.row < minRow) minRow = cell.row;
    if (cell.row > maxRow) maxRow = cell.row;
  });

  // Handle empty lattice
  if (minCol === Infinity) {
    return {
      width: 0,
      height: 0,
      cellSize,
      cols: 0,
      rows: 0,
      pixelData: new Uint8ClampedArray(0),
      cells: [],
      format: 'aseprite-compatible',
      bounds: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 },
    };
  }

  // STEP 2: Calculate content dimensions
  const contentCols = maxCol - minCol + 1;
  const contentRows = maxRow - minRow + 1;
  const contentWidth = contentCols * cellSize;
  const contentHeight = contentRows * cellSize;

  // STEP 3: Determine target canvas size
  // If not specified, auto-fit to content
  const canvasWidth = targetWidth || contentWidth;
  const canvasHeight = targetHeight || contentHeight;

  // STEP 4: Calculate offsets for centering
  // Horizontal: center the content
  const offsetX = Math.floor((canvasWidth - contentWidth) / 2) - (minCol * cellSize);
  
  // Vertical: bottom-align (flames look better anchored at bottom)
  // Alternative: use Math.floor((canvasHeight - contentHeight) / 2) for true center
  const offsetY = (canvasHeight - contentHeight) - (minRow * cellSize);

  // STEP 5: Create pixel buffer at target size
  const pixels = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);

  // STEP 6: Fill pixels with CENTERED coordinates
  cells.forEach((cell) => {
    const r = parseInt(cell.color.slice(1, 3), 16);
    const g = parseInt(cell.color.slice(3, 5), 16);
    const b = parseInt(cell.color.slice(5, 7), 16);

    // Apply centering offset
    const drawCol = cell.col + Math.floor(offsetX / cellSize);
    const drawRow = cell.row + Math.floor(offsetY / cellSize);

    // Fill all pixels in this cell
    for (let py = 0; py < cellSize; py++) {
      for (let px = 0; px < cellSize; px++) {
        const pixelX = drawCol * cellSize + px;
        const pixelY = drawRow * cellSize + py;
        
        // Bounds check
        if (pixelX >= 0 && pixelX < canvasWidth && pixelY >= 0 && pixelY < canvasHeight) {
          const idx = (pixelY * canvasWidth + pixelX) * 4;
          pixels[idx] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = 255;
        }
      }
    }
  });

  return {
    width: canvasWidth,
    height: canvasHeight,
    cellSize,
    cols: Math.ceil(canvasWidth / cellSize),
    rows: Math.ceil(canvasHeight / cellSize),
    pixelData: pixels,
    cells: Array.from(cells.values()).map(c => ({
      ...c,
      drawX: (c.col * cellSize) + offsetX,
      drawY: (c.row * cellSize) + offsetY,
    })),
    format: 'aseprite-compatible',
    bounds: { minCol, maxCol, minRow, maxRow, offsetX, offsetY },
    centering: {
      horizontal: 'center',
      vertical: 'bottom',
    },
  };
}

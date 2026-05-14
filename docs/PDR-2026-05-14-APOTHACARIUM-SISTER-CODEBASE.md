# PDR: Apothacarium Sister Codebase — Scholomance Logic Extraction

## 1. Product Goal

Create a standalone sister codebase ("Apothacarium Engine") that extracts, adapts, and preserves the Scholomance core visual logic — PixelBrain lattice, symmetry engine, formula compiler, palette system, CRT rendering, and procedural generation — while removing all combat, IDE, sci-fi, collaboration, and server infrastructure.

The sister codebase must produce the image defined in the Apothacarium PDR (an 80s occult herbal poster of a single organic apothecary cabinet with hidden PixelBrain composition logic), but as a deterministic generation engine, not a full-stack web application.

## 2. Change Classification

| Layer | Classification | Change |
|-------|---------------|--------|
| PixelBrain lattice | Extracted as-is | Lattice grid engine, occupancy, cell rendering, Aseprite export — kept identical |
| Symmetry engine | Extracted as-is | Symmetry detection + coordinate transformation — kept identical |
| Formula system | Extracted as-is | Formula extraction, bytecode compilation, coordinate evaluation — kept identical |
| Palette system | Extracted | Remove school/vowel-family mapping; replace with Apothacarium herbal palette tiers |
| CRT rendering | Extracted | styleCRT extension, scanlines, phosphor glow, vignette — kept identical |
| Gear-glide animation | Extracted | BPM-synced rotation — kept identical |
| Procedural noise | Extracted | Perlin noise, texture generation, dithering — kept identical |
| Anti-alias system | Extracted | Pixel grid snapping, line drawing — kept identical |
| Bytecode error system | Extracted | Error encoding/decoding — kept identical |
| Extension registry | Extracted | Plugin/hook system — kept identical |
| Template grid engine | Extracted | Aseprite-compatible template editing — kept identical |
| Token/verseIR bytecode | **Removed** | VerseIR linguistic dependencies not needed |
| Phoneme mapping | **Removed** | No phoneme-to-image mapping needed |
| Combat scoring | **Removed** | No combat system |
| Collaboration | **Removed** | No collab console |
| Server infrastructure | **Removed** | No Fastify, auth, sessions, database |
| React frontend | **Replaced** | Canvas-only or CLI generation target; no React dependency |
| Schools/constants | **Replaced** | Replace SCHOOLS/VOWEL mappings with Apothacarium-style classification |
| Microprocessor pipeline | **Adapted** | Remove verseIR microprocessors; keep symmetry/coordinate amps |
| Color-byte mapping | **Adapted** | Strip school/vowel-family resolution; add Apothacarium palette presets |

## 3. Scope of Extraction — Three Tiers

### Tier 1: Core Foundation (carry unchanged)

| Module | Files | Purpose |
|--------|-------|---------|
| Shared utils | `shared.js` | GOLDEN_RATIO, clamp, round, hash, PRNG, bytecode strings, hslToHex |
| Bytecode errors | `bytecode-error.js` | Error encoding/decoding, factory functions |
| Anti-alias control | `anti-alias-control.js` | Pixel grid snapping, Bresenham lines, hand-drawn lines, pixel buffer summary |
| Procedural noise | `procedural-noise.js` | Perlin noise, texture palettes, Bayer dithering |
| Gear-glide AMP | `gear-glide-amp.js` | BPM-synced time-based rotation |
| Extension registry | `extension-registry.js` | Plugin system with coordinate-map/color-byte/noise-gen/render hooks |
| Style extensions | `extensions/style-extensions.js` | GameBoy, 8-bit, 16-bit, CRT render hooks |
| Physics extensions | `extensions/physics-extensions.js` | Stretch-squash, gravity, bounce |
| Dimension compiler | `dimension-formula-compiler.ts` | Responsive dimension bytecode |

### Tier 2: Adapted (carry with modifications)

| Module | Files | Adaptation |
|--------|-------|------------|
| Lattice grid engine | `lattice-grid-engine.js` | Remove symmetry AMP async call dependency; replace with standalone symmetry detect. Strip microprocessor dependency. Keep all canvas rendering, export, click resolution. |
| Symmetry detection | `symmetry-amp.js` | Keep detection logic. Remove processor harness/wrapper; export pure `detectSymmetry`, `applySymmetryToLattice`, `generateSymmetryOverlay`. Make synchronous. |
| Coordinate symmetry | `coord-symmetry-amp.js` | Keep transform functions and `runCoordSymmetryAmp`. Remove async/processor wrapper. |
| Coordinate symmetry errors | `coord-symmetry-errors.js` | Keep all. |
| Formula extraction | `image-to-bytecode-formula.js` | Keep analysis pipeline, formula types, bytecode format. Remove tone mapping / neural deps. Keep pure algorithmic edge+grid+curve extraction. |
| Formula evaluation | `formula-to-coordinates.js` | Keep all evaluators. Add Apothacarium-specific cell-to-herb mapping. |
| Image-to-pixel-art | `image-to-pixel-art.js` | Keep pipeline. Remove VerseIR/phoneme dependencies. Keep coordinate generation, silhouette, fill. |
| Image-to-semantic bridge | `image-to-semantic-bridge.js` | Keep if image analysis input is used; otherwise optional. |

### Tier 3: Replaced (new implementation)

| System | Replacement |
|--------|-------------|
| Palette generation (`color-byte-mapping.js`) | New Apothacarium palette presets — Cosmic Herbal, Scholomance Folk, Earth Dead |
| School constants (`../constants/schools.js`) | Remove. Replace with Apothacarium classification: { HERBAL, COSMIC, FOLK, ALCHEMICAL } |
| Phonology/chroma deps | Remove. Palette is preset-driven, not phoneme-driven. |
| Token/verseIR bytecode | Remove. No linguistic input needed. |
| PixelBrain adapter (`src/lib/pixelbrain.adapter.js`) | Replace with Apothacarium-specific adapter that wraps core + applies herbal domain logic. |
| Microprocessor pipeline | Remove. Symmetry amps called directly (synchronous). |

## 4. Sister Codebase Architecture

```
apothacarium-engine/
├── core/                          # Pure domain logic (no I/O, no framework)
│   ├── shared.js                  # Constants, clamp, round, hash, PRNG, bytecode strings
│   ├── bytecode-error.js          # Error encoding/decoding
│   ├── anti-alias-control.js      # Pixel grid snapping, line drawing
│   ├── procedural-noise.js        # Perlin noise, texture palettes, dithering
│   ├── gear-glide-amp.js          # BPM-synced rotation
│   ├── extension-registry.js      # Plugin/hook system
│   ├── dimension-formula-compiler.ts  # Responsive dimension bytecode
│   ├── lattice-grid-engine.js     # Lattice generation, rendering, export
│   ├── symmetry-amp.js            # Symmetry detection
│   ├── coord-symmetry-amp.js      # Coordinate transformation
│   ├── coord-symmetry-errors.js   # Symmetry error codes
│   ├── image-to-bytecode-formula.js   # Formula extraction
│   ├── formula-to-coordinates.js  # Formula evaluation
│   ├── image-to-pixel-art.js      # Image-to-pixel-art pipeline
│   ├── image-to-semantic-bridge.js    # Image params mapping
│   ├── template-grid-engine.js    # Aseprite-compatible template editing
│   ├── color-byte-mapping.js      # ADAPTED: Apothacarium palette presets
│   ├── color-apothecary-presets.js    # NEW: Herbal/cosmic/folk palette definitions
│   └── extensions/
│       ├── style-extensions.js    # CRT, GameBoy, 8-bit, 16-bit render hooks
│       └── physics-extensions.js  # Stretch-squash, gravity, bounce
│
├── adapters/                      # Domain-to-output adapters
│   ├── apothecary.adapter.js      # Maps lattice + palette + CRT into Apothacarium scene
│   ├── poster-renderer.js         # Composes final poster image (canvas 2D / node-canvas)
│   └── prompt-assembler.js        # Builds generation prompt from scene description (optional)
│
├── presets/                       # Apothacarium-specific configuration
│   ├── herbal-palettes.json       # Cosmic Herbal + Scholomance Folk + Earth Dead palettes
│   ├── cabinet-layouts.json       # Predefined lattice layouts for apothecary cabinet
│   ├── prop-catalog.json          # Jar, herb, mushroom, symbol definitions with cell occupancy
│   └── composition-rules.json     # Golden ratio targets, symmetry preferences, prop budget
│
├── output/                        # Generated output (gitignored)
│
├── tests/
│   ├── core/                      # Mirrors core/ structure
│   ├── adapters/
│   └── integration/               # Full pipeline: preset -> generate -> render
│
├── package.json                   # Minimal: only canvas/node-canvas deps
├── tsconfig.json
├── README.md
└── .gitignore
```

### Dependency Graph

```
shared.js
  ├── bytecode-error.js
  ├── anti-alias-control.js
  ├── procedural-noise.js
  │     └── (standalone)
  ├── gear-glide-amp.js
  │     └── (standalone)
  ├── extension-registry.js
  │     └── bytecode-error.js
  ├── dimension-formula-compiler.ts
  │     └── (standalone)
  ├── lattice-grid-engine.js
  │     ├── shared.js
  │     └── symmetry-amp.js
  ├── symmetry-amp.js
  │     └── shared.js
  ├── coord-symmetry-amp.js
  │     └── (standalone)
  ├── coord-symmetry-errors.js
  │     └── bytecode-error.js
  ├── image-to-bytecode-formula.js
  │     ├── shared.js
  │     └── bytecode-error.js
  ├── formula-to-coordinates.js
  │     ├── shared.js
  │     ├── image-to-bytecode-formula.js
  │     └── gear-glide-amp.js
  ├── image-to-pixel-art.js
  │     ├── anti-alias-control.js
  │     ├── image-to-bytecode-formula.js
  │     └── formula-to-coordinates.js
  ├── image-to-semantic-bridge.js
  │     └── shared.js
  ├── template-grid-engine.js
  │     └── shared.js
  ├── color-byte-mapping.js (ADAPTED)
  │     ├── shared.js
  │     └── color-apothecary-presets.js
  └── color-apothecary-presets.js
        └── (standalone)
```

### Comparison: Scholomance PixelBrain vs Apothacarium Engine

| Aspect | Scholomance PixelBrain | Apothacarium Engine |
|--------|----------------------|-------------------|
| Input | VerseIR tokens + phonemes | Image analysis or composition presets |
| Palette | School/vowel-family driven | Preset-driven (Cosmic Herbal, Scholomance Folk, Earth Dead) |
| Symmetry | Via AMP microprocessors (async) | Direct synchronous calls |
| Lattice population | Pixel data → symmetry → cells | Preset layout → symmetry → herbal props |
| Output | Canvas overlay, Aseprite export | Canvas 2D image, node-canvas PNG, prompt string |
| Extension hooks | OnColorByte, OnCoordinateMap, OnNoiseGen, OnRender | Same (CRT extension applied by default) |
| Error handling | BytecodeError system | Same (keep bytecode errors for deterministic debugging) |
| Framework | React + Fastify | Node.js / browser (no framework) |

## 5. PixelBrain Conversion Contract

### Lattice Engine Adaptation

**Before (Scholomance):**
```
generateLatticeGrid(imageAnalysis) → async
  1. hash content
  2. detect symmetry via amp.symmetry microprocessor
  3. detect optimal cell size
  4. create lattice structure
  5. populate cells
  6. apply coord symmetry via amp.coord-symmetry
```

**After (Apothacarium):**
```
generateApothecaryLattice(cabinetLayout) → synchronous
  1. load cabinet preset (cols, rows, cellSize, anchorPoints)
  2. detect symmetry from preset OR override
  3. create lattice structure with cabinet dimensions
  4. populate cells from prop catalog (jar, herb, mushroom, symbol)
  5. apply coord symmetry
  6. validate against prop budget (see Section 7)
```

Key changes:
- Remove async microprocessor calls
- Replace image analysis with preset cabinet layouts
- Replace pixel-data cell population with prop catalog assignment
- Add prop budget validation (9-14 jars, 3-5 herbs, etc.)

### Symmetry Conversion

**Keep:** All 4 symmetry types (vertical, horizontal, radial, diagonal), confidence scoring, overlay generation, coordinate mirror transforms, canonicalization.

**Adapt:**
- Apothecarium symmetry is Soft Vertical by default — left/right cabinet balance with gentle organic breaks
- Radial symmetry used for botanical mandala glyphs
- Symmetry confidence threshold lowered (0.55 vs 0.65) to allow for "hand-warped" aesthetic

### Formula Conversion

**Keep:** All 5 formula types (parametric curve, grid projection, edge trace, fractal iteration, template-based). All 4 grid types (rectangular, isometric, hexagonal, fibonacci). All 3 color formula types (palette-indexed, gradient-mapped, brightness-quantized).

**Adapt:**
- Default grid type for cabinet: Rectangular (shelves)
- Default for herb placement: Fibonacci (golden ratio spiral for focal tincture)
- Default color formula: Palette-indexed (enforce 5-7 color maximum)

### Palette Conversion

**Replace school-driven palette with Apothacarium presets:**

```javascript
// color-apothecary-presets.js
const COSMIC_HERBAL = {
  name: 'Cosmic Herbal',
  colors: ['#2D1B4E', '#4A7C59', '#FFBF00', '#B8746E', '#F5F0E6', '#3E2723', '#E8D5B7'],
  use: { bg: 0, herbs: 1, glow: 2, accent: 3, labels: 4, cabinet: 5, borders: 6 }
}

const SCHOLOMANCE_FOLK = {
  name: 'Scholomance Folk',
  colors: ['#1A1A2E', '#5B8C5A', '#E8A838', '#C27A7A', '#F5E6D3', '#4A3728', '#D4C4A8']
}

// Palette constraint: 5-7 dominant colors max
```

## 6. Apothacarium-Specific Adaptations

### Prop Budget System (NEW)

The sister codebase must enforce the Apothacarium PDR prop budget:

| Category | Limit | Enforcement |
|----------|-------|-------------|
| Bottles / jars | 9-14 | Cell occupancy constraint in lattice generation |
| Hanging herbs | 3-5 | Dedicated top-row cells |
| Mushrooms / roots | 2-4 | Bottom-shelf / corner cells |
| Scrolls / labels | 3-6 | Mid-shelf parchment cells |
| Symbols | 5-9 | Etched into wood cells, background overlay |
| Glowing elements | 2-4 | Color palette index 2 (amber) applied to selected cells |

### No-Modernity Enforcement

The adapter layer must validate output against the no-modernity rule:

| Forbidden | Detection |
|-----------|-----------|
| Holographic UI | No floating elements outside lattice bounds |
| LED screens | No high-brightness (>240) colors |
| Digital panels | No rectangular uniform color blocks without texture |
| Sci-fi circuitry | No neon line networks |
| Neon grids | No fully saturated (#00FF00, #FF00FF, #00FFFF) color usage |
| Lab equipment | Prop catalog excludes beakers, burners, modern glass |

### Palette Constraint Enforcement

```javascript
function validatePalette(colors) {
  if (colors.length < 5 || colors.length > 7) return false
  // Check no modern-neon colors
  // Check dominance matches Cosmic Herbal + Scholomance Folk
}
```

### CRT Texture Layer

The styleCRT extension is applied as mandatory final render pass:

| Effect | Implementation |
|--------|----------------|
| Scanlines | Every odd row: darken by 0.3 |
| Vignette | Distance-based corner darkening |
| Phosphor glow | R > 200: boost by 0.1 × phosphorGlow |
| Chroma blur | Optional: slight RGB separation at edges |
| Poster grain | Perlin noise overlay at low opacity |

## 7. Removal List — What Stays in Scholomance

These modules from the current codebase are **NOT** extracted:

| System | Reason for Exclusion |
|--------|---------------------|
| VerseIR token-to-bytecode | Linguistic input not needed |
| Phoneme mapping (image→phonemes) | No phoneme visualization needed |
| Phonology engine (CMU, vowel families, syllabifier) | No text analysis |
| Heuristic scoring engine | No rhyme/scoring mechanics |
| Combat engine | No turn-based combat |
| Judiciary system | No consensus voting |
| Hidden Harkov Model | No token state machine |
| Rhyme astrology | No constellation mapping |
| TurboQuant prediction | No prediction engine |
| Immune system | No code quality probes |
| Collaboration system | No agent collab |
| MCP bridge | No AI agent integration |
| Server (Fastify, auth, sessions, routes, DB) | No web server needed |
| React frontend (pages, hooks, components) | No React UI |
| CODEx runtime (pipeline, event bus) | No event-driven orchestration |
| Bytecode diagnostic reporting | No diagnostic infrastructure |
| Abyss lexicon | No deep-language layer |
| Spellchecker / trie | No text processing |
| Animation system (full) | Gear-glide only; no Framer Motion, school animations |
| Atmosphere system | No school-based ambient styling |

## 8. Implementation Phases

### Phase 0: Scaffold (1 session)
- Create `apothacarium-engine/` directory structure
- Copy `shared.js`, `bytecode-error.js`, `anti-alias-control.js`, `procedural-noise.js`, `gear-glide-amp.js` unchanged
- Create `package.json` with only `canvas` (browser) / `canvas` npm (node) dependency
- Verify each file loads in isolation with minimal test

### Phase 1: Core Visual Engine (2-3 sessions)
- Copy and adapt `lattice-grid-engine.js`:
  - Remove async/microprocessor dependencies
  - Replace `generateLatticeGrid(imageAnalysis)` with `generateApothecaryLattice(preset)`
  - Keep `renderLattice`, `exportLatticeToAseprite`, `resolveLatticeClick`, `paintCell`, `clearCell`
- Copy and adapt `symmetry-amp.js`:
  - Export pure functions, remove processor harness
  - Default to soft vertical symmetry
- Copy `coord-symmetry-amp.js` and `coord-symmetry-errors.js` unchanged
- Copy `template-grid-engine.js` unchanged
- All tests pass for lattice + symmetry + template generation

### Phase 2: Formula & Palette System (2 sessions)
- Copy and adapt `image-to-bytecode-formula.js`:
  - Keep formula types, grid types, bytecode format
  - Remove any neural/external-analysis dependencies
  - Keep edge detection, curve fitting, grid detection, color quantization
- Copy `formula-to-coordinates.js` unchanged
- Copy `image-to-pixel-art.js` (remove VerseIR/phoneme deps)
- Create `color-apothecary-presets.js` with Cosmic Herbal + Scholomance Folk + Earth Dead palettes
- Adapt `color-byte-mapping.js`:
  - Replace school resolution with preset selection
  - Keep palette generation, bytecode-to-palette mapping

### Phase 3: Extensions & Rendering (1 session)
- Copy `extension-registry.js` unchanged
- Copy `extensions/style-extensions.js` unchanged
- Copy `extensions/physics-extensions.js` unchanged
- Copy `dimension-formula-compiler.ts` unchanged
- Create adapters:
  - `poster-renderer.js` — Composes lattice + palette + CRT into final image
  - `apothecary.adapter.js` — Preset-to-lattice mapping with prop budget enforcement
- Create preset JSON files for cabinet layouts, prop catalog, composition rules

### Phase 4: Integration & Refinement (2 sessions)
- Build end-to-end test: preset → generate lattice → apply symmetry → assign props → render with CRT
- Validate output against Apothacarium PDR section 13 (Negative Constraints)
- Add prompt assembler (optional) for AI image generation prompt from scene description
- Performance profiling (target: <100ms per generation for 160x144 canvas)

## 9. Schema Contract — Shared Types Between Sister Codebases

If the two codebases need to share data (e.g., Scholomance exports a palette → Apothacarium consumes it), the shared contract is:

```typescript
// From shared.js (both codebases)
interface PixelBrainCanvas {
  width: number
  height: number
  gridSize: number
}

// Bytecode string format (both codebases)
type PixelBrainBytecode = `PB-${string}`  // "PB-ERR-v1-..." or "0xF..."

// Lattice (both codebases)
interface Lattice {
  width: number
  height: number
  cellSize: number
  cols: number
  rows: number
  cells: Map<string, LatticeCell>
  symmetry?: SymmetryMetadata
}

interface LatticeCell {
  col: number
  row: number
  color?: string
  emphasis?: number
  pixelCount?: number
  symmetrySource?: string
}

// Symmetry (both codebases)
interface SymmetryMetadata {
  type: 'vertical' | 'horizontal' | 'radial' | 'diagonal' | 'none'
  confidence: number
  scores: Record<string, number>
  axis?: { x?: number; y?: number }
  significant: boolean
}

// Palette (adapted for Apothacarium)
interface ApothecaryPalette {
  name: string
  colors: string[]  // 5-7 hex colors
  use: Record<string, number>  // color-index mapping
}
```

## 10. Infrastructure

### Package Dependencies (minimal)
```json
{
  "name": "apothacarium-engine",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "canvas": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

- `canvas` (node-canvas): Only dependency. Required for `renderLattice`, `poster-renderer`, and all canvas 2D operations in Node.js.
- No React. No Fastify. No SQLite. No Redis. No AWS SDK.

### Build Target
- **Node.js 22+** for server-side generation (CLI tool, API endpoint)
- **Browser** for client-side generation (ES module, no canvas dependency if rendering to offscreen canvas)
- Single entry point: `generatePoster(preset, options)` → returns `{ canvas, buffer, metadata }`

### Testing Strategy
- Unit tests mirror `core/` structure (same tests as Scholomance for extracted files)
- Integration tests: full pipeline with preset → validate output against Apothacarium PDR rules
- Visual regression: compare generated output against reference images

## 11. Quality Gates

Before Phase 4 is considered complete:

| Gate | Criterion |
|------|-----------|
| Lattice generation | Generates valid lattice from any cabinet preset |
| Symmetry detection | Correctly detects vertical symmetry in cabinet layouts |
| Prop budget | Generated scene never exceeds Apothacarium PDR prop limits |
| Palette constraint | Colors stay within 5-7 range, no neon/sci-fi colors |
| CRT texture | Scanlines, vignette, phosphor glow present and configurable |
| No-modernity pass | Zero forbidden elements detected in output |
| Bytecode compatibility | All bytecode operations produce valid PixelBrain-compatible strings |
| Load time | Core module loads in <50ms, full generation in <200ms |

## 12. Negative Constraints

The sister codebase must NOT:

- Import any file from `codex/` outside `core/pixelbrain/`, `core/shared/math/safe.js`
- Reference school constants (SONIC, PSYCHIC, ALCHEMY, WILL, VOID)
- Use phoneme/vowel-family/vowel-wheel logic
- Include combat, scoring, or judiciary code
- Depend on React, Fastify, or any web framework
- Include server routes, authentication, or session management
- Reference verseIR, token bytecode, or HMM systems
- Bundle any database adapter (SQLite, Turso, Redis)
- Include the MCP bridge, collab console, or agent infrastructure
- Reference the immune system, diagnostic cells, or antigen probes
- Use Framer Motion, Three.js, or Phaser
- Import from `src/` directory (frontend-only code)

## 13. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Lattice engine depends on microprocessors | Generation blocked | Replace async amp calls with direct sync calls |
| Color-byte-mapping depends on SCHOOLS | Palette broken | Replace school resolution with Apothacarium presets |
| Prop count exceeds PDR limits | Output violates constraints | Add hard cap validation in adapter layer |
| CRT extension requires canvas API | Node.js generation fails | Use node-canvas; canvas is the only external dep |
| Formula system depends on image analysis input | Preset-only mode incomplete | Support both: image analysis (when input provided) and preset layout (default) |
| Scholomance PixelBrain files change upstream | Sister codebase diverges | Pin extracted files at current commit; manual sync with changelog |

# Scholomance Immune System

> The body's defense against corruption, entropy, and the resurrection of shadow logic.

The Scholomance Immune System (`codex/core/immunity/`) is a three-layer defense architecture that detects, classifies, and reports code violations using PixelBrain Bytecode Errors. It operates as the "health inspector" of the codebase — catching deterministic violations, semantic pathogen shadows, and async protocol drift before they can corrupt the weave.

**Skill ID:** `SISP-GLYPH-v1`  
**Determinism:** VAELRIX_LAW §6 Verified  
**Stasis Status:** 🔒 LOCKED

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        IMMUNE SYSTEM LAYERS                               │
├─────────────────┬──────────────────────┬──────────────────────────────────┤
│  LAYER 1: INNATE│  LAYER 2: ADAPTIVE   │  LAYER 3: PROTOCOL                │
│  (Skin Barrier) │  (Leukocytes)        │  (T-Cell Memory)                 │
├─────────────────┼──────────────────────┼──────────────────────────────────┤
│  Pattern-based  │  Vector-similarity   │  Cross-file async surface       │
│  Fast, stateless│  Semantic matching   │  Protocol drift detection       │
│  ~8 rules       │  8 pathogens         │  Await verification             │
│  Runs every PR  │  Thresholds tuning  │  Layer migration guard          │
└─────────────────┴──────────────────────┴──────────────────────────────────┘
```

### Layer 1: Innate (Innate Rules)

**File:** `codex/core/immunity/innate.rules.js`  
**Scanner:** `codex/core/immunity/innate.scanner.js`  
**Error Builder:** `codex/core/immunity/inflammatoryResponse.js`

Fast, stateless pattern checks that reject obvious entropy. Each rule is a regex or content inspection that emits a real PixelBrain bytecode error under the `IMMUNE` module.

**Current Rules:**

| Rule ID | Name | Category | Severity | Error Code |
|---------|------|----------|----------|------------|
| `QUANT-0101` | `Math.random()` outside seeded contexts | VALUE | CRIT | `QUANT_PRECISION_LOSS` (0x0105) |
| `QUANT-0102` | Unseeded clock in hot paths | VALUE | WARN | `QUANT_PRECISION_LOSS` (0x0105) |
| `LING-0F03` | Forbidden UI → Codex import | LINGUISTIC | CRIT | `IMMUNE_FORBIDDEN_IMPORT` (0x0F03) |
| `LING-0F04` | Duplicate path / shadow import | LINGUISTIC | CRIT | `IMMUNE_DUPLICATE_PATH` (0x0F04) |
| `LING-0F05` | Known-violation literal | LINGUISTIC | CRIT | `IMMUNE_KNOWN_VIOLATION_LITERAL` (0x0F05) |
| `STATE-0305` | Uninitialized session blocking CSRF | STATE | CRIT | `INVARIANT_VIOLATION` (0x0304) |
| `STATE-0306` | Shadowing Recursion Pathogen | STATE | CRIT | `INVARIANT_VIOLATION` (0x0304) |
| `INFRA-0G01` | Infrastructure Port Drift | STATE | WARN | `INVARIANT_VIOLATION` (0x0304) |

**Key Features:**
- Allow-list annotations (`// IMMUNE_ALLOW: math-random`)
- Path-based exemptions (tests, docs, atmosphere effects)
- Duplicate path canonical table (`DUPLICATE_PATH_CANON`)
- Full bytecode emission with repair recommendations

### Layer 2: Adaptive (Pathogen Registry)

**Registry:** `codex/core/immunity/pathogenRegistry.js`  
**Scanner:** `codex/core/immunity/adaptive.scanner.js`  
**Glyph System:** `codex/core/immunity/ai-glyphs.js`  
**Vector Utils:** `codex/core/semantic/vector.utils.js`  
**TurboQuant:** `codex/core/quantization/turboquant.js`

Vector-similarity detection using phonosemantic analysis with **AI Glyph steganographic encoding**. Known pathogen signatures are stored with glyph markers that allow instantaneous AI identification.

**AI Glyph Encoding (SISP-GLYPH-v1):**

| Glyph | Unicode | Class | Pathogen Examples |
|-------|---------|-------|-------------------|
| ⟡ | U+E29E1 | `CLIENT_AUTHORITY` | Combat scoring on client |
| ⧫ | U+E29EB | `SHADOW_PATH` | Bytecode bridge duplication |
| ⌁ | U+E29E1 | `EQUIVALENCE` | Legacy rhyme/phoneme stacks |
| ⟟ | U+E29DF | `LOOP_RECURSION` | Service/service loops |
| ⧯ | U+E29EF | `INFRASTRUCTURE` | Port drift |
| ◈ | U+E25C8 | `PROTOCOL_DRIFT` | Un-awaited async calls |
| ⧿ | U+E29FF | `CRITICAL_PATH` | Keystroke latency |

**Example:** `⟡⌁` = CLIENT_AUTHORITY + EQUIVALENCE → Client-side Combat Scoring

Each pathogen carries a `glyphs` field in its bytecode context for AI-instantaneous identification.

**Current Pathogens:** 8 total (see full table in File Structure below)

| Pathogen ID | Name | Threshold | Encyclopedia Entry |
|-------------|------|----------|-------------------|
| `pathogen.client-combat-scorer` | Client-side Combat Scoring | 0.85 | `BUG-2026-04-26-COMBAT-AUTHORITY` |
| `pathogen.legacy-rhyme-stack` | Legacy Rhyme Engine | 0.90 | `BUG-2026-04-26-RHYME-SEVERANCE` |
| `pathogen.bytecode-bridge-shadow` | Bytecode Bridge Shadowing | 0.88 | `BUG-2026-04-26-ANIMATION-PARITY` |
| `pathogen.recursive-shadow` | Recursive Shadow | 0.95 | `BUG-2026-04-27-RECURSIVE-SHADOW` |
| `pathogen.port-drift` | Port Drift | 0.80 | `BUG-2026-04-27-PORT-DRIFT` |
| `pathogen.recursive-fragmentation` | Recursive Fragmentation | 0.90 | `BUG-2026-04-27-RECURSIVE-FRAGMENTATION` |
| `pathogen.async-protocol-drift` | Sync-style Caller of Async API | 1.0 | `BUG-2026-04-27-ASYNC-PROTOCOL-DRIFT` |
| `pathogen.keystroke-critical-path` | Keystroke Critical Path Contamination | 0.85 | `BUG-2026-05-08-INPUT-LAG-COMPLETIONS` |

**Known Issues:**
- Vector signatures are currently generated on-the-fly from `pathogen.name` (placeholder)
- Pre-quantized pathogen vectors should be stored in the registry for production
- Threshold tuning needed for semantic similarity (see stasis test comments)

### Layer 3: Protocol (Async Surface Scanner)

**File:** `codex/core/immunity/protocol.scanner.js`

Detects sync-style calls to async APIs across file boundaries. Harvests async function names from implementation modules and flags un-awaited callers.

**Key Functions:**

```javascript
// Harvest async surface from implementation modules
harvestAsyncSurface(implPaths: string[]): Set<string>

// Scan caller for un-awaited async calls
scanProtocol(content: string, filePath: string, options: {
  asyncSurface: Set<string>,  // Required: async function names to flag
  callerPrefixes?: string[],   // Optional: filter to specific service prefixes
}): Violation[]
```

**Known Issues:**
- Regex-based (not full AST) — designed for CI scale but misses complex cases
- Does not detect multi-line expression spread across lines
- `expect(<call>).rejects` intentional patterns need explicit allow-listing

---

## Error Encoding

All violations emit PixelBrain bytecode errors following the schema:

```
PB-ERR-v1-{CATEGORY}-{SEVERITY}-{MODULE}-{CODE}-{CONTEXT_B64}-{CHECKSUM}
```

**Example:**
```
PB-ERR-v1-VALUE-CRIT-IMMUNE-0105-eyJjb250ZXh0Ijp7fQ--ABCD1234
```

**IMMUNITY Error Codes (0x0F00–0x0FFF):**

| Code | Name | Description |
|------|------|-------------|
| `0x0F01` | `IMMUNE_INNATE_BLOCK` | Layer 1 pattern violation |
| `0x0F02` | `IMMUNE_ADAPTIVE_BLOCK` | Layer 2 pathogen vector match |
| `0x0F03` | `IMMUNE_FORBIDDEN_IMPORT` | UI → Codex layering violation |
| `0x0F04` | `IMMUNE_DUPLICATE_PATH` | Shadow path collision |
| `0x0F05` | `IMMUNE_KNOWN_VIOLATION_LITERAL` | Purged symbol resurrection |
| `0x0F06` | `IMMUNE_OVERRIDE_MISSING` | Layer override required but not provided |
| `0x0F07` | `IMMUNE_OVERRIDE_AUTHORITY_INVALID` | Authority not on curated list |
| `0x0F08` | `IMMUNE_PROTOCOL_BLOCK` | Cross-file async protocol drift |

---

## Repair Recommendations

**File:** `codex/core/immunity/repair.recommendations.js`

Each rule references a repair recommendation with:
- `key`: Stable lookup key
- `title`: One-line headline
- `suggestions`: Concrete actionable steps
- `constraints`: Invariants the fix must satisfy
- `invariants`: Code-level predicates
- `references`: Encyclopedia / bug-fix-plan links
- `canonical`: Canonical replacement path/symbol (when known)

**Available Repairs:**

| Key | Title |
|-----|-------|
| `repair.math-random.seeded` | Replace `Math.random()` with seeded RNG |
| `repair.unseeded-clock.pipeline-context` | Use authoritative pipeline clock |
| `repair.forbidden-import.bridge-via-lib` | Move logic out of UI into Codex runtime |
| `repair.duplicate-path.canon` | Reroute through the canonical path |
| `repair.known-violation.cleansing` | Forbidden symbol — replaced during cleansing |
| `repair.session.save-uninitialized` | Fastify session must initialize for guests |
| `repair.recursion.alias-imports` | Avoid infinite recursion via aliased imports |
| `repair.infra.port-alignment` | Align infrastructure ports across environments |
| `repair.handshake.centralized-csrf` | Centralize CSRF handshake in useAuth hook |

---

## Server Integration

**File:** `codex/server/services/immunity.service.js`

The server-side immunity service orchestrates all three layers:
- Loads and caches staged files from git
- Runs all three scanners in sequence
- Stores violations in SQLite for audit trail
- Provides override mechanism with Angel authority

**API Endpoints (if exposed):**

| Endpoint | Purpose |
|----------|---------|
| `/api/immunity/scan` | Scan a single file |
| `/api/immunity/report` | Get violation report |
| `/api/immunity/override` | Request layer override |

---

## Test Coverage

**Stasis Tests:** 

| Test File | Purpose | Run Command |
|----------|---------|-------------|
| `tests/qa/immunity.stasis.test.js` | Original innate/adaptive tests | `node tests/qa/immunity.stasis.test.js` |
| `tests/qa/immunity.glyph-stasis.test.js` | Glyph + determinism + L3 protocol | `node tests/qa/immunity.glyph-stasis.test.js` |

**Glyph Stasis Test Suite (SISP-STASIS-GLYPH-v1):** 20 tests covering:
- Glyph system version and exhaustive code verification
- Pathogen glyphs completeness
- Encode/decode round-trip stability
- Determinism verification (100 iterations per check)
- Protocol scanner Layer 3 tests (unawaited, awaited, allow-list patterns)
- Adaptive scanner glyph inclusion in violations
- SISP compliance (bytecode, checksum, no entropy)

**Run:**
```bash
npm run immune:stasis
# Or individually:
node tests/qa/immunity.stasis.test.js
node tests/qa/immunity.glyph-stasis.test.js
```

---

## What Needs to Be Finished

### High Priority

1. **[ADAPTIVE] Pre-quantized Pathogen Vectors**
   - Currently: Pathogen vectors generated on-the-fly from `pathogen.name`
   - Needed: Pre-quantized vectors stored in `pathogenRegistry.js` for production accuracy
   - Files: `pathogenRegistry.js`, `adaptive.scanner.js`

2. **[ADAPTIVE] Threshold Tuning**
   - Current state: Some adaptive tests warn about missed detections
   - Needed: Tune thresholds based on false-positive/negative rates from stasis tests
   - Files: `pathogenRegistry.js`

3. **[PROTOCOL] Full AST Parsing (Optional)**
   - Currently: Regex-based scanner misses multi-line expressions
   - Needed: Optional AST-based upgrade for deeper protocol drift detection
   - File: `protocol.scanner.js`

### Medium Priority

4. **[INTEGRATION] CI/CD Pipeline Hook**
   - Missing: Git hook integration for pre-commit scanning
   - Needed: `pre-commit` hook that scans staged files through all three layers
   - Files: `package.json` (scripts), new hook script

5. **[INNATE] INFRA-0G01 Implementation**
   - Referenced in `innate.rules.js` but implementation appears incomplete
   - Needed: Complete port drift detection logic
   - File: `innate.rules.js`

6. **[UI] Immunity Dashboard**
   - Missing: Visual dashboard for immunity violation trends
   - Needed: Render violation history from SQLite in admin UI
   - Files: `src/pages/admin/immunity.jsx` (new)

### Low Priority

7. **[ADAPTIVE] Performance Optimization**
   - Pathogen scanning chunks content 500 chars at a time
   - Could be parallelized for large files
   - File: `adaptive.scanner.js`

8. **[PROTOCOL] Allow-list for `expect().rejects`**
   - Currently: Hardcoded pattern in scanner
   - Could be externalized to config for maintainability
   - File: `protocol.scanner.js`

9. **[DOCS] Encyclopedia Cross-Links**
   - Many repair references point to encyclopedia entries that may not exist
   - Needed: Audit and create missing encyclopedia entries
   - Directory: `docs/scholomance-encyclopedia/`

---

## Law References

- **VAELRIX_LAW.md §7**: Security Before Features — No input surface ships without allow-list validation
- **VAELRIX_LAW.md §8**: Bytecode Is Priority — All persistent state uses bytecode encoding
- **VAELRIX_LAW.md §12**: Law Evolution Is Mandatory — Evaluate whether the law requires updating

---

## File Structure

```
codex/core/immunity/
├── innate.rules.js           # Layer 1 rule definitions
├── innate.scanner.js        # Layer 1 pattern scanner
├── adaptive.scanner.js     # Layer 2 vector similarity scanner
├── pathogenRegistry.js      # Layer 2 known pathogen signatures (with glyphs)
├── ai-glyphs.js             # AI Glyph steganographic encoding system
├── protocol.scanner.js       # Layer 3 async surface scanner
├── inflammatoryResponse.js # BytecodeError builders
├── repair.recommendations.js # Repair guidance lookup
└── README.md                # This file

codex/server/services/
├── immunity.service.js      # Server orchestrator

tests/qa/
├── immunity.stasis.test.js          # Original stasis tests
├── immunity.glyph-stasis.test.js    # Glyph + determinism + L3 tests
```

## SISP Compliance

Per `SCHOLOMANCE_IRONCLAD_STERILIZATION_PROTOCOL.skill.md`:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Determinism (VAELRIX_LAW §6) | ✅ Verified | 100-iteration pass on all vector generation |
| Glyph encoding (SISP-GLYPH-v1) | ✅ Implemented | 7 glyph classes with steganographic encoding |
| Bytecode compliance | ✅ Verified | PB-ERR-v1-* format with checksum |
| Protocol scanner L3 | ✅ Implemented | harvestAsyncSurface + scanProtocol |
| Allow-list externalization | ✅ Implemented | PROTOCOL_ALLOW_LIST |
| Recursion safety | ✅ Verified | No timestamp/random entropy |
| Evidence ladder | ✅ Complete | Tier 1-6 classification in source |

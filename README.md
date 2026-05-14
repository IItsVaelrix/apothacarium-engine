# Apothacarium Engine

Sister codebase to [Scholomance](https://github.com/IItsVaelrix/scholomance), extracting the PixelBrain visual logic — lattice grid, symmetry engine, formula compiler, palette system, CRT rendering, and procedural generation — into a standalone generator for the Apothacarium occult-herbal poster.

## Status

Phase 0 scaffold. See [PDR](./docs/PDR-2026-05-14-APOTHACARIUM-SISTER-CODEBASE.md).

## Architecture

```
core/        Pure PixelBrain domain logic (lattice, symmetry, formulas, palette, extensions)
adapters/    Apothacarium-specific scene composition + poster renderer
presets/     Cabinet layouts, prop catalog, herbal palettes, composition rules
server/      Carried-over collab/MCP/auth/db stack from Scholomance
tests/       Unit + integration tests
output/      Generated posters (gitignored)
```

## Differences from Scholomance

- No React frontend
- No VerseIR / phoneme / school constants
- Symmetry calls are synchronous (no microprocessor harness)
- Palette is preset-driven (Cosmic Herbal / Scholomance Folk / Earth Dead)
- Prop budget enforced (9-14 jars, 3-5 herbs, etc.)
- CRT extension applied as mandatory final render pass
- Full collab/MCP infrastructure preserved for tooling continuity

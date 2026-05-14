/**
 * Animation AMP — Blueprint Parser
 * 
 * Parses bytecode blueprint blocks from PDR source documents.
 * Converts line-based syntax into AnimationBlueprintV1 IR.
 */

import {
  AnimationBlueprintV1,
  BlueprintParseResult,
  BLUEPRINT_ERROR_CODES,
} from "../contracts/blueprint.types.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

const ANIM_START_MARKER = "ANIM_START";
const ANIM_END_MARKER = "ANIM_END";

const REQUIRED_DIRECTIVES = new Set(["ID", "TARGET", "DURATION", "EASE", "LOOP"]);

const VALID_DIRECTIVES = new Set([
  "ANIM_START",
  "ANIM_END",
  "ID",
  "NAME",
  "DESCRIPTION",
  "TARGET",
  "PRESET",
  "DURATION",
  "DELAY",
  "LOOP",
  "EASE",
  "PHASE",
  "SCALE",
  "ROTATE",
  "TRANSLATE_X",
  "TRANSLATE_Y",
  "OPACITY",
  "GLOW",
  "BLUR",
  "ENVELOPE",
  "SYMMETRY",
  "GRID",
  "ANCHOR",
  "COMPOSITE",
  "BACKEND_HINT",
  "CONSTRAINT",
  "QA",
  "METADATA",
]);

// ─── Parser State ────────────────────────────────────────────────────────────

interface ParserState {
  lines: string[];
  currentIndex: number;
  errors: any[];
  warnings: any[];
  sourceMap: Map<number, string>;
  directives: Map<string, string[]>;
}

// ─── Core Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a bytecode blueprint block from source text
 */
export function parseBlueprintBlock(source: string): BlueprintParseResult {
  const lines = source.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  
  const state: ParserState = {
    lines,
    currentIndex: 0,
    errors: [],
    warnings: [],
    sourceMap: new Map(),
    directives: new Map(),
  };

  // Validate ANIM_START
  if (lines.length === 0 || (lines[0] !== ANIM_START_MARKER && !lines[0].startsWith('ANIMATION'))) {
     // Fallback for some formats
  }

  // Parse all lines
  while (state.currentIndex < lines.length) {
    const line = lines[state.currentIndex];
    const lineNum = state.currentIndex + 1;
    state.sourceMap.set(lineNum, line);

    if (line === ANIM_END_MARKER) {
      state.currentIndex++;
      break;
    }

    parseDirective(state, line, lineNum);
    state.currentIndex++;
  }

  // Build blueprint from directives
  const blueprint = buildBlueprint(state);
  
  return {
    success: state.errors.length === 0,
    blueprint,
    errors: state.errors,
    warnings: state.warnings,
    sourceMap: state.sourceMap,
  };
}

// ─── Directive Parser ────────────────────────────────────────────────────────

function parseDirective(state: ParserState, line: string, lineNum: number): void {
  const parts = line.split(/\s+/);
  const directive = parts[0].toUpperCase();

  if (!VALID_DIRECTIVES.has(directive)) return;

  const args = parts.slice(1);
  const existingArgs = state.directives.get(directive) || [];
  state.directives.set(directive, [...existingArgs, ...args]);
}

// ─── Blueprint Builder ───────────────────────────────────────────────────────

function buildBlueprint(state: ParserState): AnimationBlueprintV1 {
  const get = (key: string): string | undefined => state.directives.get(key)?.join(" ");
  
  const targetParts = (get("TARGET") || "").split(/\s+/);
  const selectorType = (targetParts[0] || "id") as any;
  const targetValue = targetParts.slice(1).join(" ") || "";

  const easingParts = (get("EASE") || "").split(/\s+/);
  const easingType = (easingParts[0] || "token") as any;
  const easingValue = easingParts.slice(1).join(" ") || "linear";

  const loopStr = get("LOOP") || "1";
  const loop: number | "infinite" = loopStr.toLowerCase() === "infinite" ? "infinite" : parseInt(loopStr, 10) || 1;

  const blueprint: AnimationBlueprintV1 = {
    version: "1.0",
    id: get("ID") || "unknown",
    target: {
      selectorType,
      value: targetValue,
    },
    durationMs: parseInt(get("DURATION") || "0", 10) || 400,
    loop,
    easing: {
      type: easingType,
      value: easingValue,
    },
  };

  // Parse transforms
  const transforms: any = {};
  for (const transform of ["SCALE", "ROTATE", "TRANSLATE_X", "TRANSLATE_Y", "OPACITY", "GLOW", "BLUR"]) {
    const value = get(transform);
    if (value) {
      const key = transform.toLowerCase().replace("_", "");
      transforms[key] = parseTransform(value);
    }
  }
  if (Object.keys(transforms).length > 0) blueprint.transforms = transforms;

  return blueprint;
}

function parseTransform(value: string): any {
  const parts = value.split(/\s+/);
  const result: any = {};
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i].toLowerCase();
    const next = parts[i + 1];
    if (key === "base" && next) { result.base = parseFloat(next); i++; }
    else if (key === "peak" && next) { result.peak = parseFloat(next); i++; }
  }
  return result;
}

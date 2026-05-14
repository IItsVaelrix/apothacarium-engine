#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { enhanceVerseIR } from "../codex/core/verseir-amplifier/index.js";
import { phoneticColorAmplifier } from "../codex/core/verseir-amplifier/plugins/phoneticColor.js";
import { SCHOOL_SKINS, SCHOOL_SKINS_LIGHT } from "../src/data/schoolPalettes.js";
import { SCHOOLS, VOWEL_FAMILY_TO_SCHOOL } from "../src/data/schools.js";
import { compileVerseToIR } from "../src/lib/truesight/compiler/compileVerseToIR.js";

function parseArgs(argv) {
  const args = {
    mode: "balanced",
    visualMode: "AESTHETIC",
    output: null,
    text: null,
    textFile: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--mode" && next) {
      args.mode = next;
      index += 1;
      continue;
    }

    if (arg === "--visual-mode" && next) {
      args.visualMode = next;
      index += 1;
      continue;
    }

    if (arg === "--output" && next) {
      args.output = next;
      index += 1;
      continue;
    }

    if (arg === "--text" && next) {
      args.text = next;
      index += 1;
      continue;
    }

    if (arg === "--text-file" && next) {
      args.textFile = next;
      index += 1;
      continue;
    }
  }

  return args;
}

async function resolveText(args) {
  if (typeof args.text === "string" && args.text.trim()) {
    return args.text;
  }

  if (typeof args.textFile === "string" && args.textFile.trim()) {
    return readFile(args.textFile, "utf8");
  }

  throw new Error("Provide --text or --text-file.");
}

function serializeSchoolMap(map) {
  return Object.fromEntries(
    Object.entries(map).map(([schoolId, palette]) => [schoolId, { ...palette }])
  );
}

function serializeToken(token) {
  return {
    id: Number(token?.id) || 0,
    text: String(token?.text || ""),
    normalized: String(token?.normalized || ""),
    normalizedUpper: String(token?.normalizedUpper || ""),
    lineIndex: Number(token?.lineIndex) || 0,
    tokenIndexInLine: Number(token?.tokenIndexInLine) || 0,
    globalTokenIndex: Number(token?.globalTokenIndex) || 0,
    charStart: Number(token?.charStart) || 0,
    charEnd: Number(token?.charEnd) || 0,
    syllableCount: Number(token?.syllableCount) || 0,
    phonemes: Array.isArray(token?.phonemes) ? [...token.phonemes] : [],
    stressPattern: String(token?.stressPattern || ""),
    onset: Array.isArray(token?.onset) ? [...token.onset] : [],
    nucleus: Array.isArray(token?.nucleus) ? [...token.nucleus] : [],
    coda: Array.isArray(token?.coda) ? [...token.coda] : [],
    vowelFamily: Array.isArray(token?.vowelFamily) ? [...token.vowelFamily] : [],
    primaryStressedVowelFamily: token?.primaryStressedVowelFamily || null,
    terminalVowelFamily: token?.terminalVowelFamily || null,
    rhymeTailSignature: String(token?.rhymeTailSignature || ""),
    consonantSkeleton: String(token?.consonantSkeleton || ""),
    flags: token?.flags ? { ...token.flags } : null,
    phoneticDiagnostics: token?.phoneticDiagnostics
      ? {
          source: token.phoneticDiagnostics.source || null,
          branch: token.phoneticDiagnostics.branch || null,
          fallbackPath: Array.isArray(token.phoneticDiagnostics.fallbackPath)
            ? [...token.phoneticDiagnostics.fallbackPath]
            : [],
          authoritySource: token.phoneticDiagnostics.authoritySource || null,
          usedAuthorityCache: Boolean(token.phoneticDiagnostics.usedAuthorityCache),
          unknownReason: token.phoneticDiagnostics.unknownReason || null,
          notes: Array.isArray(token.phoneticDiagnostics.notes)
            ? [...token.phoneticDiagnostics.notes]
            : [],
        }
      : null,
    visualBytecode: token?.visualBytecode ? { ...token.visualBytecode } : null,
  };
}

function serializeLine(line) {
  return {
    lineIndex: Number(line?.lineIndex) || 0,
    text: String(line?.text || ""),
    normalizedText: String(line?.normalizedText || ""),
    tokenIds: Array.isArray(line?.tokenIds) ? [...line.tokenIds] : [],
    charStart: Number(line?.charStart) || 0,
    charEnd: Number(line?.charEnd) || 0,
    isTerminalLine: Boolean(line?.isTerminalLine),
  };
}

function buildPayload(text, verseIR, args) {
  const hash = createHash("sha256").update(text).digest("hex");
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: args.mode,
      visualMode: args.visualMode,
      amplifiers: ["phonetic_color"],
      textLength: text.length,
      tokenCount: Array.isArray(verseIR?.tokens) ? verseIR.tokens.length : 0,
      lineCount: Array.isArray(verseIR?.lines) ? verseIR.lines.length : 0,
      sha256: hash,
    },
    paletteContext: {
      schools: Object.fromEntries(
        Object.entries(SCHOOLS).map(([schoolId, school]) => [schoolId, {
          id: school.id,
          name: school.name,
          color: school.color,
          colorHsl: school.colorHsl ? { ...school.colorHsl } : null,
          description: school.description,
          glyph: school.glyph,
          atmosphere: school.atmosphere ? { ...school.atmosphere } : null,
        }])
      ),
      schoolSkins: serializeSchoolMap(SCHOOL_SKINS),
      schoolSkinsLight: serializeSchoolMap(SCHOOL_SKINS_LIGHT),
      vowelFamilyToSchool: { ...VOWEL_FAMILY_TO_SCHOOL },
    },
    verseIR: {
      version: String(verseIR?.version || ""),
      rawText: String(verseIR?.rawText || text),
      normalizedText: String(verseIR?.normalizedText || text),
      lines: Array.isArray(verseIR?.lines) ? verseIR.lines.map(serializeLine) : [],
      tokens: Array.isArray(verseIR?.tokens) ? verseIR.tokens.map(serializeToken) : [],
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = await resolveText(args);
  const compiled = compileVerseToIR(text, { mode: args.mode });
  const verseIR = await enhanceVerseIR(compiled, {
    visualMode: args.visualMode,
    amplifiers: [phoneticColorAmplifier],
    routing: { enabled: false },
  });
  const payload = buildPayload(text, verseIR, args);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  if (args.output) {
    const outputPath = path.resolve(args.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  process.stdout.write(serialized);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

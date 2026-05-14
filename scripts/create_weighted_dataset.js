import fs from "node:fs";
import path from "node:path";
import { parseDocxToLines } from "../codex/core/rhyme/dataset.js";
import { analyzeLinePhonology } from "../codex/core/rhyme/phonology.js";
import { buildPairs } from "../codex/core/rhyme/training.js";

function writeJsonl(outputPath, rows) {
  const stream = fs.createWriteStream(outputPath);
  for (const row of rows) {
    stream.write(`${JSON.stringify(row)}\n`);
  }
  stream.end();
}

function getInputPathFromArgs() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    const preferredInputPath = path.join(process.cwd(), "docs", "references", "DATA-SET 1.md");
    if (fs.existsSync(preferredInputPath)) return preferredInputPath;
    return path.join(process.cwd(), "DATA-SET 1.md");
  }
  return path.resolve(process.cwd(), inputArg);
}

function getWindowSizeFromArgs() {
  const raw = Number(process.argv[3]);
  if (!Number.isFinite(raw) || raw <= 0) return 4;
  return Math.floor(raw);
}

async function run() {
  const inputPath = getInputPathFromArgs();
  const windowSize = getWindowSizeFromArgs();
  const linesOutputPath = path.join(process.cwd(), "public", "ritual_dataset.jsonl");
  const pairsOutputPath = path.join(process.cwd(), "public", "ritual_training_pairs.jsonl");

  console.log(`[dataset] reading source: ${inputPath}`);
  const parsedLines = await parseDocxToLines(inputPath);
  if (!parsedLines.length) {
    throw new Error("No usable lines were extracted from the input source.");
  }

  const lineRows = parsedLines.map((line) => {
    const analysis = analyzeLinePhonology(line.text);
    return {
      id: line.id,
      documentId: line.documentId,
      documentTitle: line.documentTitle,
      documentNumber: line.documentNumber,
      lineIndex: line.lineIndex,
      sectionLabel: line.sectionLabel,
      text: line.text,
      tokens: analysis.tokens,
      endWord: analysis.endWord,
      rhymeKey: analysis.rhymeKey,
      styleVector: analysis.styleVector,
    };
  });

  const pairs = buildPairs(parsedLines, windowSize, {
    refrain: {
      minOccurrences: 2,
      maxSequenceLength: 3,
      minTokens: 3,
    },
  });

  fs.mkdirSync(path.dirname(linesOutputPath), { recursive: true });
  writeJsonl(linesOutputPath, lineRows);
  writeJsonl(pairsOutputPath, pairs);

  const uniqueDocuments = new Set(lineRows.map((row) => row.documentId)).size;
  const uniqueRhymeKeys = new Set(pairs.map((pair) => pair.targetRhymeKey)).size;
  const refrainPairs = pairs.filter((pair) => pair.isRefrain).length;

  console.log(`[dataset] wrote ${lineRows.length} line records -> ${linesOutputPath}`);
  console.log(`[dataset] wrote ${pairs.length} training pairs -> ${pairsOutputPath}`);
  console.log(`[dataset] docs=${uniqueDocuments} window=${windowSize} unique_rhyme_keys=${uniqueRhymeKeys}`);
  console.log(`[dataset] refrain_tagged_pairs=${refrainPairs}`);
}

run().catch((error) => {
  console.error("[dataset] failed:", error);
  process.exitCode = 1;
});

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LIBRARY_FILE = path.join("src", "data", "library.js");
const SCHOOLS_FILE = path.join("src", "data", "schools.js");

function parseArgs(argv) {
  const args = {
    school: "",
    url: "",
    title: "",
    key: "",
    append: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--school" || token === "-s") {
      args.school = argv[i + 1] || "";
      i += 1;
    } else if (token === "--url" || token === "-u") {
      args.url = argv[i + 1] || "";
      i += 1;
    } else if (token === "--title" || token === "-t") {
      args.title = argv[i + 1] || "";
      i += 1;
    } else if (token === "--key" || token === "-k") {
      args.key = argv[i + 1] || "";
      i += 1;
    } else if (token === "--append") {
      args.append = true;
    } else if (token === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

function assertFileExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required file not found: ${filePath}`);
  }
}

function readFile(filePath) {
  assertFileExists(filePath);
  return fs.readFileSync(filePath, "utf8");
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function toTrackKey(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (!normalized) return "suno_track";
  if (/^[0-9]/.test(normalized)) return `track_${normalized}`;
  return normalized;
}

function ensureUniqueKey(baseKey, librarySource) {
  const keyRegex = /^\s{2}([a-zA-Z0-9_]+):\s*{/gm;
  const existing = new Set();
  let match = keyRegex.exec(librarySource);
  while (match) {
    existing.add(match[1]);
    match = keyRegex.exec(librarySource);
  }

  if (!existing.has(baseKey)) return baseKey;

  let suffix = 2;
  while (existing.has(`${baseKey}_${suffix}`)) {
    suffix += 1;
  }
  return `${baseKey}_${suffix}`;
}

function getAvailableSchoolIds(schoolsSource) {
  const schoolRegex = /^\s{2}([A-Z][A-Z0-9_]+):\s*{/gm;
  const schools = [];
  let match = schoolRegex.exec(schoolsSource);
  while (match) {
    schools.push(match[1]);
    match = schoolRegex.exec(schoolsSource);
  }
  return schools;
}

function validateInputs({ school, url }, schoolsSource) {
  if (!school) {
    throw new Error("Missing required argument --school.");
  }
  if (!url) {
    throw new Error("Missing required argument --url.");
  }
  if (!/suno/i.test(url)) {
    throw new Error("URL must be a Suno link.");
  }

  const schoolUpper = school.toUpperCase();
  const available = getAvailableSchoolIds(schoolsSource);
  if (!available.includes(schoolUpper)) {
    throw new Error(`Unknown school "${school}". Valid options: ${available.join(", ")}`);
  }
  return schoolUpper;
}

function buildLibraryEntry({ key, title, url, school }) {
  const safeTitle = title?.trim() || `${school} Suno Track`;
  return [
    `  ${key}: {`,
    `    title: ${JSON.stringify(safeTitle)},`,
    `    suno: ${JSON.stringify(url.trim())},`,
    `    school: ${JSON.stringify(school)},`,
    "  },",
  ].join("\n");
}

function upsertLibraryTrack(librarySource, entryKey, entryBlock) {
  const blockRegex = new RegExp(
    `^\\s{2}${entryKey}:\\s*{[\\s\\S]*?^\\s{2}},\\r?\\n?`,
    "m"
  );
  if (blockRegex.test(librarySource)) {
    return librarySource.replace(blockRegex, `${entryBlock}\n`);
  }

  const insertMarker = "};\n\n// Meditation tracks";
  if (!librarySource.includes(insertMarker)) {
    throw new Error("Unable to locate LIBRARY insertion point.");
  }

  return librarySource.replace(insertMarker, `${entryBlock}\n${insertMarker}`);
}

function updateSchoolTracks(schoolsSource, schoolId, trackKey, append) {
  const schoolTracksRegex = new RegExp(
    `(${schoolId}:\\s*{[\\s\\S]*?tracks:\\s*\\[)([^\\]]*)(\\])`,
    "m"
  );
  const match = schoolTracksRegex.exec(schoolsSource);
  if (!match) {
    throw new Error(`Unable to locate tracks array for school "${schoolId}".`);
  }

  const existingTrackKeys = [...match[2].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
  const deduped = existingTrackKeys.filter((key) => key !== trackKey);
  const nextTrackKeys = append ? [...deduped, trackKey] : [trackKey, ...deduped];
  const nextTrackValue = nextTrackKeys.map((key) => `"${key}"`).join(", ");

  return schoolsSource.replace(schoolTracksRegex, `$1${nextTrackValue}$3`);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const libraryPath = path.join(root, LIBRARY_FILE);
  const schoolsPath = path.join(root, SCHOOLS_FILE);

  const librarySource = readFile(libraryPath);
  const schoolsSource = readFile(schoolsPath);

  const schoolId = validateInputs(args, schoolsSource);
  const requestedKey = toTrackKey(args.key || `${schoolId.toLowerCase()}_${args.title || "suno_track"}`);
  const trackKey = ensureUniqueKey(requestedKey, librarySource);
  const entryBlock = buildLibraryEntry({
    key: trackKey,
    title: args.title,
    url: args.url,
    school: schoolId,
  });

  const nextLibrarySource = upsertLibraryTrack(librarySource, trackKey, entryBlock);
  const nextSchoolsSource = updateSchoolTracks(schoolsSource, schoolId, trackKey, args.append);

  if (!args.dryRun) {
    writeFile(libraryPath, nextLibrarySource);
    writeFile(schoolsPath, nextSchoolsSource);
  }

  const modeLabel = args.append ? "added to end of school track list" : "set as primary school track";
  const dryLabel = args.dryRun ? " (dry run only)" : "";
  console.log(`Suno track ${modeLabel}${dryLabel}.`);
  console.log(`school: ${schoolId}`);
  console.log(`trackKey: ${trackKey}`);
  console.log(`url: ${args.url.trim()}`);
}

try {
  run();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

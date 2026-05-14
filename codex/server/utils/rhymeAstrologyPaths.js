import { existsSync } from 'node:fs';
import path from 'node:path';

export const RHYME_ASTROLOGY_ARTIFACT_FILES = Object.freeze({
  lexiconDb: 'rhyme_lexicon.sqlite',
  indexDb: 'rhyme_index.sqlite',
  edgesDb: 'rhyme_edges.sqlite',
  emotionPriors: 'rhyme_emotion_priors.json',
});

const DEFAULT_PERSISTENT_DATA_DIR = '/var/data';

function toResolvedPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return path.resolve(value.trim());
}

function uniquePaths(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isPathWithinParent(candidatePath, parentPath) {
  if (!candidatePath || !parentPath) return false;
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function hasCompleteArtifactSet(outputDir) {
  if (!outputDir) return false;
  return [
    RHYME_ASTROLOGY_ARTIFACT_FILES.lexiconDb,
    RHYME_ASTROLOGY_ARTIFACT_FILES.indexDb,
    RHYME_ASTROLOGY_ARTIFACT_FILES.edgesDb,
  ].every((fileName) => existsSync(path.join(outputDir, fileName)));
}

export function hasRhymeAstrologyArtifactBundle(paths) {
  return Boolean(
    paths &&
    existsSync(paths.lexiconDbPath) &&
    existsSync(paths.indexDbPath) &&
    existsSync(paths.edgesDbPath)
  );
}

export function resolveRhymeAstrologyArtifactPaths(options = {}) {
  const projectRoot = toResolvedPath(options.projectRoot) || process.cwd();
  const persistentDataDir = toResolvedPath(options.persistentDataDir) || DEFAULT_PERSISTENT_DATA_DIR;
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

  const configuredOutputDir = toResolvedPath(
    options.outputDir ?? process.env.RHYME_ASTROLOGY_OUTPUT_DIR
  );
  const explicitLexiconDbPath = toResolvedPath(
    options.lexiconDbPath ?? process.env.RHYME_ASTROLOGY_LEXICON_DB_PATH
  );
  const explicitIndexDbPath = toResolvedPath(
    options.indexDbPath ?? process.env.RHYME_ASTROLOGY_INDEX_DB_PATH
  );
  const explicitEdgesDbPath = toResolvedPath(
    options.edgesDbPath ?? process.env.RHYME_ASTROLOGY_EDGES_DB_PATH
  );
  const explicitEmotionPriorsPath = toResolvedPath(
    options.emotionPriorsPath ?? process.env.RHYME_EMOTION_PRIORS_PATH
  );

  const hasExplicitDbPaths = Boolean(
    explicitLexiconDbPath ||
    explicitIndexDbPath ||
    explicitEdgesDbPath
  );

  const persistentOutputDir = path.join(persistentDataDir, 'rhyme-astrology');
  const projectOutputDir = path.resolve(projectRoot, 'dict_data', 'rhyme-astrology');
  const preferredOutputDir = configuredOutputDir || (isProduction ? persistentOutputDir : projectOutputDir);
  const candidateOutputDirs = uniquePaths([
    configuredOutputDir,
    isProduction ? persistentOutputDir : null,
    projectOutputDir,
  ]);

  const existingArtifactsOutputDir = hasExplicitDbPaths
    ? null
    : candidateOutputDirs.find(hasCompleteArtifactSet) || null;

  const usedProductionPersistentFallback = Boolean(
    !existingArtifactsOutputDir &&
    !hasExplicitDbPaths &&
    isProduction &&
    configuredOutputDir &&
    !existsSync(configuredOutputDir) &&
    !isPathWithinParent(configuredOutputDir, persistentDataDir)
  );

  const outputDir = existingArtifactsOutputDir
    || (usedProductionPersistentFallback ? persistentOutputDir : preferredOutputDir);

  const lexiconDbPath = explicitLexiconDbPath
    || path.join(outputDir, RHYME_ASTROLOGY_ARTIFACT_FILES.lexiconDb);
  const indexDbPath = explicitIndexDbPath
    || path.join(outputDir, RHYME_ASTROLOGY_ARTIFACT_FILES.indexDb);
  const edgesDbPath = explicitEdgesDbPath
    || path.join(outputDir, RHYME_ASTROLOGY_ARTIFACT_FILES.edgesDb);
  const emotionPriorsPath = explicitEmotionPriorsPath
    || path.join(outputDir, RHYME_ASTROLOGY_ARTIFACT_FILES.emotionPriors);

  return {
    outputDir,
    lexiconDbPath,
    indexDbPath,
    edgesDbPath,
    emotionPriorsPath,
    configuredOutputDir,
    preferredOutputDir,
    persistentOutputDir,
    projectOutputDir,
    candidateOutputDirs,
    usedExistingArtifactsFallback: Boolean(
      existingArtifactsOutputDir && existingArtifactsOutputDir !== preferredOutputDir
    ),
    usedProductionPersistentFallback,
    hasCompleteDbSet: hasRhymeAstrologyArtifactBundle({
      lexiconDbPath,
      indexDbPath,
      edgesDbPath,
    }),
    hasEmotionPriors: existsSync(emotionPriorsPath),
  };
}

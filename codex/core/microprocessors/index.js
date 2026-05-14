import { verseIRMicroprocessors } from './factory.js';

/**
 * LAZY MICROPROCESSOR REGISTRY
 * 
 * Maps IDs to dynamic import functions.
 * Prevents loading NLU dependencies when only Pixel work is needed (and vice-versa).
 */

// --- NLU Microprocessors (Lazy) ---
verseIRMicroprocessors.register('nlu.classifyIntent', async (payload, context) => {
  const { classifyIntent } = await import('./nlu/intent-classifier.js');
  return classifyIntent(payload, context);
});

verseIRMicroprocessors.register('nlu.extractEntities', async (payload, context) => {
  const { extractEntities } = await import('./nlu/entity-extractor.js');
  return extractEntities(payload, context);
});

verseIRMicroprocessors.register('nlu.mapSemantics', async (payload, context) => {
  const { mapEntitiesToSemanticParameters } = await import('./nlu/semantic-mapper.js');
  return mapEntitiesToSemanticParameters(payload, context);
});

verseIRMicroprocessors.register('nlu.generateVerse', async (payload, context) => {
  const { generateVerse } = await import('./nlu/verse-generator.js');
  return generateVerse(payload, context);
});

verseIRMicroprocessors.register('nlu.synthesizeVerse', async (payload, context) => {
  const { runSynthesis } = await import('./nlu/synthesisProcessor.js');
  return runSynthesis(payload, context);
});

verseIRMicroprocessors.register('pls.index', async (payload, context) => {
  const { buildPlsIndex } = await import('./nlu/plsIndexProcessor.js');
  return buildPlsIndex(payload);
});

// --- Pixel Microprocessors (Lazy) ---
verseIRMicroprocessors.register('pixel.decode', async (payload, context) => {
  const { decodeBitStream } = await import('./pixel/BitStreamProcessor.js');
  return decodeBitStream(payload, context);
});

verseIRMicroprocessors.register('pixel.resample', async (payload, context) => {
  const { resampleSubstrate } = await import('./pixel/SubstrateResampler.js');
  return resampleSubstrate(payload, context);
});

verseIRMicroprocessors.register('pixel.trace', async (payload, context) => {
  const { traceLattice } = await import('./pixel/LatticeTracer.js');
  return traceLattice(payload, context);
});

verseIRMicroprocessors.register('pixel.quantize', async (payload, context) => {
  const { quantizeChroma } = await import('./pixel/ChromaQuantizer.js');
  return quantizeChroma(payload, context);
});

verseIRMicroprocessors.register('pixel.transmute', async (payload, context) => {
  const { transmuteAIArt } = await import('./pixel/Transmuter.js');
  return transmuteAIArt(payload, context);
});

// --- Animation Microprocessors (Lazy) ---
verseIRMicroprocessors.register('pixel.compileAnimation', async (payload, context) => {
  const { compileAnimation } = await import('./pixel/AnimationProcessor.js');
  return compileAnimation(payload, context);
});

verseIRMicroprocessors.register('pixel.calculateRotation', async (payload, context) => {
  const { calculateRotation } = await import('./pixel/AnimationProcessor.js');
  return calculateRotation(payload, context);
});

verseIRMicroprocessors.register('amp.run', async (payload, context) => {
  const { runAmpProcessor } = await import('./pixel/AmpRunProcessor.ts');
  return runAmpProcessor(payload);
});

// --- Symmetry AMP Microprocessors ---
verseIRMicroprocessors.register('amp.symmetry', async (payload, context) => {
  const { runSymmetryAmpProcessor } = await import('../pixelbrain/symmetry-amp.js');
  return runSymmetryAmpProcessor(payload, context);
});

verseIRMicroprocessors.register('amp.coord-symmetry', async (payload, context) => {
  const { runCoordSymmetryAmp } = await import('../pixelbrain/coord-symmetry-amp.js');
  return runCoordSymmetryAmp(payload, context);
});

// --- IDE Microprocessors (Lazy) ---
verseIRMicroprocessors.register('arbiter.predict', async (payload, context) => {
  const { predictNextRitualMove } = await import('./arbiter/predictProcessor.ts');
  return predictNextRitualMove(payload, context);
});

// --- Weave Prototypes (Remediation) ---
verseIRMicroprocessors.register('speaking.prosody', async (payload) => {
  const { analyzeProsody } = await import('../speaking/prosody.js');
  return analyzeProsody(payload);
});

verseIRMicroprocessors.register('syntax.hmm', async (payload, context) => {
  const { englishSyntaxHMM } = await import('../hmm.js');
  return englishSyntaxHMM.predict(payload, context);
});

verseIRMicroprocessors.register('phonetic.matcher', async (payload) => {
  const { phoneticMatcher } = await import('../phonetic_matcher.js');
  return phoneticMatcher.encode(payload);
});

verseIRMicroprocessors.register('spellweave.engine', async (payload) => {
  const { calculateSyntacticBridge } = await import('../spellweave.engine.js');
  return calculateSyntacticBridge(payload);
});

verseIRMicroprocessors.register('world.entity', async (payload) => {
  const { buildInspectableEntity } = await import('../world.entity.js');
  return buildInspectableEntity(payload);
});

verseIRMicroprocessors.register('pixel.turboquant', async (payload) => {
  const { turboQuantize } = await import('../quantization/turboquant.js');
  return turboQuantize(payload);
});

export { verseIRMicroprocessors };

/**
 * NATURAL LANGUAGE AMP (NLU-AMP)
 * 
 * Layer 0: Intent Recognition & Semantic Parsing
 * Converts plain English prompts into PixelBrain configuration
 * 
 * Architecture (Refactored to Microprocessors):
 * 1. nlu.classifyIntent - Detects intent
 * 2. nlu.extractEntities - Extracts subjects, colors, materials, etc.
 * 3. nlu.generateVerse - Generates phonetic verse based on entities
 * 4. nluToPixelBrainParams - Parameter mapping (SemanticParameters output)
 */

import { clamp01, createAmplifierResult, createAmplifierDiagnostic } from '../shared.js';
import { LEXICAL_VISUAL_DB } from '../../semantic/visual-extractor.js';
import { nluToPixelBrainParams } from '../../semantic/semantic-math-bridge.js';
import { verseIRMicroprocessors } from '../../microprocessors/index.js';
import { tokenize, INTENT_KEYWORDS, STYLE_KEYWORDS } from '../../microprocessors/nlu/constants.js';

const ID = 'natural_language_amp';
const LABEL = 'Natural Language Understanding AMP';
const TIER = 'COMMON';
const CLAIMED_WEIGHT = 0.03;
const VERSION = '3.0.0';

/**
 * Parse natural language prompt
 * @param {string} prompt - Natural language input
 * @returns {Object} Parsed intent with semantic parameters
 */
export function parseNaturalLanguagePrompt(prompt) {
  const tokens = tokenize(prompt);
  const fullText = String(prompt || '').toLowerCase();
  
  // 1. Microprocessor: Intent Classification
  const { intent, confidence } = verseIRMicroprocessors.execute('nlu.classifyIntent', { tokens });
  
  // 2. Microprocessor: Entity Extraction
  const entities = verseIRMicroprocessors.execute('nlu.extractEntities', { tokens, fullText });
  
  // 3. Microprocessor: Semantic Mapping
  const semanticParams = verseIRMicroprocessors.execute('nlu.mapSemantics', { entities, intent });
  
  // 4. Microprocessor: Verse Generation
  const generatedVerse = verseIRMicroprocessors.execute('nlu.generateVerse', { entities });
  
  return Object.freeze({
    intent,
    confidence,
    entities,
    semanticParams,
    generatedVerse,
    originalPrompt: prompt,
  });
}

/**
 * Natural Language AMP Plugin
 */
export const naturalLanguageAmp = {
  id: ID,
  label: LABEL,
  tier: TIER,
  claimedWeight: CLAIMED_WEIGHT,
  version: VERSION,
  
  /**
   * Route decision - run if text appears to be natural language prompt
   */
  route(context = {}) {
    const { verseIR, options = {} } = context;
    const rawText = String(verseIR?.rawText || '').trim();
    
    const isNaturalLanguage = this.isNaturalLanguagePrompt(rawText);
    
    if (!isNaturalLanguage) {
      return {
        score: 0,
        shouldRun: false,
        reason: 'not_natural_language',
      };
    }
    
    return {
      score: 0.9,
      shouldRun: true,
      reason: 'natural_language_detected',
      mode: options.nluMode || 'direct',
    };
  },
  
  /**
   * Check if text appears to be a natural language prompt
   */
  isNaturalLanguagePrompt(text) {
    if (!text || text.length < 5) return false;
    
    const tokens = tokenize(text);
    const lowerText = text.toLowerCase();
    
    for (const keywords of Object.values(INTENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.startsWith(keyword) || tokens.includes(keyword)) {
          return true;
        }
      }
    }
    
    const hasSemanticSubject = tokens.some(token => LEXICAL_VISUAL_DB.has(token));
    if (hasSemanticSubject) return true;
    
    for (const styleKeywords of Object.values(STYLE_KEYWORDS)) {
      for (const keyword of styleKeywords) {
        if (tokens.includes(keyword)) {
          return true;
        }
      }
    }
    
    return false;
  },
  
  /**
   * Analyze and extract semantic parameters with mathematical constraints
   */
  async analyze(context = {}) {
    const { verseIR, options = {} } = context;
    const rawText = String(verseIR?.rawText || '').trim();
    
    if (!rawText) {
      return createAmplifierResult({
        id: ID,
        label: LABEL,
        tier: TIER,
        claimedWeight: CLAIMED_WEIGHT,
        commentary: 'No text provided for natural language analysis.',
      });
    }

    const tokenCount = tokenize(rawText).length;
    const mode = (tokenCount < 10) ? 'generate' : (options.nluMode || 'direct');
    
    // Parse the prompt using the microprocessor pipeline
    const parsed = parseNaturalLanguagePrompt(rawText);
    
    // Convert entities to mathematical constraints (THE BRIDGE)
    const mathConstraints = nluToPixelBrainParams(parsed.entities, parsed.semanticParams);
    
    const diagnostics = [];
    
    if (parsed.confidence < 0.5) {
      diagnostics.push(createAmplifierDiagnostic({
        severity: 'warning',
        source: ID,
        message: 'Low confidence in natural language interpretation.',
        metadata: {
          intent: parsed.intent,
          confidence: parsed.confidence,
        },
      }));
    }
    
    const commentary = mode === 'direct'
      ? `NLU direct: ${parsed.intent} → ${mathConstraints.surface.material}/${mathConstraints.form.symmetry} constraints.`
      : `NLU generate: "${parsed.intent}" → generated verse for phonetic analysis.`;
    
    diagnostics.push(createAmplifierDiagnostic({
      severity: 'info',
      source: ID,
      message: `Parsed: ${parsed.intent} with ${Object.keys(parsed.entities).reduce((sum, key) => sum + parsed.entities[key].length, 0)} entities → ${mathConstraints.coordinateDensity} coord density, ${mathConstraints.latticeConnections} connections.`,
      metadata: {
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: parsed.entities,
        mathConstraints: {
          coordinateDensity: mathConstraints.coordinateDensity,
          latticeConnections: mathConstraints.latticeConnections,
          ditherMethod: mathConstraints.ditherMethod,
          extension: mathConstraints.extension,
        },
        mode,
      },
    }));
    
    return Object.freeze({
      ...createAmplifierResult({
        id: ID,
        label: LABEL,
        tier: TIER,
        claimedWeight: CLAIMED_WEIGHT,
        signal: parsed.confidence,
        semanticDepth: clamp01(Object.keys(parsed.entities).reduce((sum, key) => sum + parsed.entities[key].length, 0) / 10),
        matches: [],
        archetypes: [],
        diagnostics,
        commentary,
      }),
      payload: Object.freeze({
        version: VERSION,
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: parsed.entities,
        semanticParams: parsed.semanticParams,
        mathConstraints,
        generatedVerse: mode === 'generate' ? parsed.generatedVerse : null,
        originalPrompt: parsed.originalPrompt,
        mode,
      }),
    });
  },
};

console.log('[NLU-AMP] Plugin loaded (Microprocessor Edition)');

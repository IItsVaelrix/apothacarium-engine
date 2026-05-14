/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    CLERICAL RAID: VECTOR ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * THE ARCHIVE OF DOMINANCE — LEVEL 10 BILLION PERCENT
 * 
 * "We do not store vectors. We PETRIFY them into 2.5-bit and 4-bit shells
 * that retain their semantic soul while shedding 90% of their mass."
 * 
 * This module implements the symptomHash() function — the first step in
 * the Clerical RAID immune response. Given raw bug symptoms, it produces
 * a deterministic 128-dimensional vector ready for TurboQuant processing.
 * 
 * @author   Merlin Data (Testing/QA)
 * @bytecode SCHOL-CLERICAL-RAID-VECTOR
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  SYMPTOM_BITS,
  LAYER_INDEX,
  LAW_BITS,
  AGENT_INDEX,
  VECTOR_DIMENSIONS
} from './clerical-raid.schema.js';

/**
 * THE SIGNATURE EXTRACTOR
 * 
 * Transforms raw symptom descriptions into a deterministic bitmask.
 * Uses PATTERN MATCHING, not LLM parsing — fast, deterministic, immune to injection.
 */
export function symptomsToVector(symptoms, dim = 32) {
  const vec = new Float32Array(dim);
  
  for (const symptom of symptoms) {
    const lower = symptom.toLowerCase();
    
    if (lower.includes('null') || lower.includes('undefined')) {
      vec[SYMPTOM_BITS.NULL_UNDEFINED] = 1.0;
    }
    if (lower.includes('async') || lower.includes('timing') || lower.includes('race')) {
      vec[SYMPTOM_BITS.ASYNC_TIMING] = 1.0;
    }
    if (lower.includes('render') || lower.includes('display') || lower.includes('ui')) {
      vec[SYMPTOM_BITS.RENDER_MISMATCH] = 1.0;
    }
    if (lower.includes('schema') || lower.includes('validation')) {
      vec[SYMPTOM_BITS.SCHEMA_VIOLATION] = 1.0;
    }
    if (lower.includes('score') || lower.includes('scoring') || lower.includes('determinism')) {
      vec[SYMPTOM_BITS.SCORING_DRIFT] = 1.0;
    }
    if (lower.includes('propagat') || lower.includes('chain')) {
      vec[SYMPTOM_BITS.WEAVE_PROPAGATION] = 1.0;
    }
    if (lower.includes('type') || lower.includes('typescript')) {
      vec[SYMPTOM_BITS.TYPE_ERROR] = 1.0;
    }
    if (lower.includes('import') || lower.includes('require')) {
      vec[SYMPTOM_BITS.IMPORT_FAILURE] = 1.0;
    }
    if (lower.includes('promise') || lower.includes('reject')) {
      vec[SYMPTOM_BITS.PROMISE_REJECTION] = 1.0;
    }
    if (lower.includes('xss') || (lower.includes('injection') && !lower.includes('sql')) || lower.includes('sanitiz')) {
      vec[SYMPTOM_BITS.XSS_VECTOR] = 1.0;
    }
    if (lower.includes('sql') && (lower.includes('inject') || lower.includes('injection'))) {
      vec[SYMPTOM_BITS.SQL_INJECTION] = 1.0;
    }
    if (lower.includes('memory') || lower.includes('leak')) {
      vec[SYMPTOM_BITS.MEMORY_LEAK] = 1.0;
    }
    if (lower.includes('race condition') || lower.includes('data race')) {
      vec[SYMPTOM_BITS.RACE_CONDITION] = 1.0;
    }
    if (lower.includes('deadlock')) {
      vec[SYMPTOM_BITS.DEADLOCK_OBSERVED] = 1.0;
    }
  }
  
  // Normalize to unit vector
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dim; i++) vec[i] /= norm;
  
  return vec;
}

/** THE LAYER DETECTOR — Deduces the realm from file paths */
export function detectLayer(filePaths = [], layerHint = null) {
  const vec = new Float32Array(8);
  
  if (layerHint) {
    const lower = layerHint.toLowerCase();
    for (const [name, index] of Object.entries(LAYER_INDEX)) {
      if (lower.includes(name.toLowerCase().replace('_', ' '))) {
        vec[index] = 1.0;
        return vec;
      }
    }
  }
  
  for (const path of filePaths) {
    const lower = path.toLowerCase();
    if (lower.includes('codex/core')) vec[LAYER_INDEX.CODEX_CORE] = 1.0;
    else if (lower.includes('codex/services')) vec[LAYER_INDEX.CODEX_SERVICES] = 1.0;
    else if (lower.includes('src/hooks')) vec[LAYER_INDEX.SRC_HOOKS] = 1.0;
    else if (lower.includes('src/pages')) vec[LAYER_INDEX.SRC_PAGES] = 1.0;
    else if (lower.includes('src/components')) vec[LAYER_INDEX.SRC_COMPONENTS] = 1.0;
    else if (lower.includes('src/lib')) vec[LAYER_INDEX.SRC_LIB] = 1.0;
    else if (lower.includes('scripts')) vec[LAYER_INDEX.SCRIPTS] = 1.0;
    else if (lower.includes('config') || lower.includes('.env')) vec[LAYER_INDEX.CONFIG] = 1.0;
  }
  
  let norm = 0;
  for (let i = 0; i < 8; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < 8; i++) vec[i] /= norm;
  
  return vec;
}

/** THE LAW VIOLATION SCANNER — Marks which sacred texts were broken */
export function detectLawViolations(errorMessages = [], symptoms = []) {
  const vec = new Float32Array(8);
  const combined = [...errorMessages, ...symptoms].map(s => s.toLowerCase()).join(' ');
  
  if (combined.includes('vaelrix')) vec[LAW_BITS.VAELRIX_LAW] = 1.0;
  if (combined.includes('schema') || combined.includes('contract')) vec[LAW_BITS.SCHEMA_CONTRACT] = 1.0;
  if (combined.includes('security') || combined.includes('xss')) vec[LAW_BITS.ARCH_CONTRACT_SECURITY] = 1.0;
  if (combined.includes('codex')) vec[LAW_BITS.CODEX_DOCUMENTATION] = 1.0;
  if (combined.includes('gemini') || combined.includes('mechanic')) vec[LAW_BITS.GEMINI_SPECS] = 1.0;
  if (combined.includes('claude') || combined.includes('ui')) vec[LAW_BITS.CLAUDE_CONTEXT] = 1.0;
  if (combined.includes('type') || combined.includes('typescript')) vec[LAW_BITS.TYPE_SAFETY] = 1.0;
  if (combined.includes('naming')) vec[LAW_BITS.NAMING_CONVENTION] = 1.0;
  
  return vec;
}

/** THE AGENT ASSIGNER — Maps bugs to their rightful owners */
export function assignAgent(layerVec, symptoms = []) {
  const vec = new Float32Array(5);
  const combined = symptoms.map(s => s.toLowerCase()).join(' ');
  
  let dominantLayer = -1, maxVal = 0;
  for (let i = 0; i < 8; i++) {
    if (layerVec[i] > maxVal) { maxVal = layerVec[i]; dominantLayer = i; }
  }
  
  switch (dominantLayer) {
    case LAYER_INDEX.CODEX_CORE:
    case LAYER_INDEX.CODEX_SERVICES:
    case LAYER_INDEX.SRC_LIB:
      vec[AGENT_INDEX.CODEX] = 1.0; break;
    case LAYER_INDEX.SRC_HOOKS:
    case LAYER_INDEX.SRC_PAGES:
    case LAYER_INDEX.SRC_COMPONENTS:
      vec[AGENT_INDEX.CLAUDE] = 1.0; break;
    case LAYER_INDEX.SCRIPTS:
    case LAYER_INDEX.CONFIG:
      vec[AGENT_INDEX.GEMINI] = 1.0; break;
    default:
      vec[AGENT_INDEX.UNKNOWN] = 1.0;
  }
  
  if (combined.includes('xss') || combined.includes('security')) vec[AGENT_INDEX.CLAUDE] = 1.0;
  if (combined.includes('test') || combined.includes('coverage')) vec[AGENT_INDEX.BLACKBOX] = 1.0;
  if (combined.includes('scoring') || combined.includes('determinism')) vec[AGENT_INDEX.CODEX] = 1.0;
  
  return vec;
}

/**
 * Dims 112–127: deterministic signature of raw symptom/path/error text so sparse
 * reports do not collapse to identical vectors (false CONFIRMED).
 */
function mixContentSignature(vec, bugReport, seed) {
  const payload = [
    ...(bugReport.symptoms || []),
    ...(bugReport.filePaths || []),
    ...(bugReport.errorMessages || [])
  ].join('\x1e');
  let h = (seed ^ Math.imul(payload.length, 0x9e3779b1)) >>> 0;
  for (let c = 0; c < payload.length; c++) {
    h = (Math.imul(h ^ payload.charCodeAt(c), 0x85ebca6b) + c) >>> 0;
  }
  for (let i = 0; i < 16; i++) {
    h = Math.imul(h ^ (h >>> 11), 0x6b8e9cf3 + i) >>> 0;
    vec[112 + i] = (h / 0xffffffff) * 2 - 1;
  }
}

/**
 * THE COMPLETE SIGNATURE RITUAL — Combines all vectors into 128-dim profile
 *
 * Dimension layout:
 * 0-31:  Symptom cluster
 * 32-39: Layer attribution
 * 40-55: Propagation chain (spread from layer)
 * 56-63: Schema violations
 * 64-71: Temporal pattern (placeholder)
 * 72-79: Agent attribution
 * 80-111: Heuristic match (scoring-related)
 * 112-127: Content signature (hash of raw report fields)
 */
export function bugToVector(bugReport, seed = 42) {
  const {
    symptoms = [],
    filePaths = [],
    layerHint = null,
    layer = null,
    errorMessages: errArr = [],
    errorMessage = ''
  } = bugReport;
  const errorMessages = errArr.length ? errArr : (errorMessage ? [errorMessage] : []);
  const hint = layerHint || layer;
  
  const symptomVec = symptomsToVector(symptoms, 32);
  const layerVec = detectLayer(filePaths, hint);
  const lawVec = detectLawViolations(errorMessages, symptoms);
  const agentVec = assignAgent(layerVec, symptoms);
  
  const vec = new Float32Array(VECTOR_DIMENSIONS);
  
  // Assemble the genetic profile
  for (let i = 0; i < 32; i++) vec[i] = symptomVec[i] || 0;
  for (let i = 0; i < 8; i++) vec[32 + i] = layerVec[i] || 0;
  for (let i = 0; i < 16; i++) vec[40 + i] = layerVec[i % 8] * 0.5 || 0;
  for (let i = 0; i < 8; i++) vec[56 + i] = lawVec[i] || 0;
  for (let i = 0; i < 8; i++) vec[64 + i] = 0; // temporal placeholder
  for (let i = 0; i < 8; i++) vec[72 + i] = i < 5 ? (agentVec[i] || 0) : 0;
  if (symptoms.some(s => s.toLowerCase().includes('score'))) {
    for (let i = 0; i < 32; i++) vec[80 + i] = 0.5;
  }
  mixContentSignature(vec, { symptoms, filePaths, errorMessages }, seed);

  // SIGN FLIP — Deterministic destruction of directional bias
  for (let i = 0; i < VECTOR_DIMENSIONS; i++) {
    let value = seed ^ i, setBits = 0;
    while (value > 0) { value &= value - 1; setBits += 1; }
    if (setBits % 2 === 1 && vec[i] !== 0) vec[i] *= -1.0;
  }
  
  return vec;
}

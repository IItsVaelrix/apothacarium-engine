/**
 * VerseIR Microprocessor Factory
 *
 * Central registry for atomic, stateless data transformation units.
 * Designed to slim down "fat" orchestrators (Amps) and provide
 * a clean path for WebWorker-compatible processing pipelines.
 *
 * All errors emitted as PB-ERR-v1 bytecode for AI-parsable diagnostics.
 */

import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../pixelbrain/bytecode-error.js';

const MOD = MODULE_IDS.EXT_REGISTRY;

export function createMicroprocessorFactory() {
  const registry = new Map();

  return {
    /**
     * Register a new microprocessor
     * @param {string} id - Unique identifier (e.g., 'nlu.classifyIntent')
     * @param {Function} processorFn - Stateless processing function
     */
    register(id, processorFn) {
      if (typeof processorFn !== 'function') {
        throw new BytecodeError(
          ERROR_CATEGORIES.TYPE, ERROR_SEVERITY.CRIT, MOD,
          ERROR_CODES.TYPE_MISMATCH,
          { parameter: 'processorFn', expectedType: 'function', actualType: typeof processorFn, microprocessorId: id },
        );
      }
      registry.set(id, processorFn);
    },

    /**
     * Execute a single microprocessor by ID
     * UNIFIED: Always returns a Promise to maintain consistent API across contexts.
     *
     * @param {string} id - The microprocessor ID
     * @param {any} payload - The input data
     * @param {Object} context - Additional configuration or context
     * @returns {Promise<any>} The processed output
     */
    async execute(id, payload, context = {}) {
      const processor = registry.get(id);
      if (!processor) {
        throw new BytecodeError(
          ERROR_CATEGORIES.EXT, ERROR_SEVERITY.CRIT, MOD,
          ERROR_CODES.EXT_NOT_FOUND,
          { extensionId: id, operation: 'execute' },
        );
      }

      // Wrapping in try/await to ensure all processors are treated as async
      try {
        return await Promise.resolve(processor(payload, context));
      } catch (error) {
        throw new BytecodeError(
          ERROR_CATEGORIES.HOOK, ERROR_SEVERITY.CRIT, MOD,
          ERROR_CODES.HOOK_CHAIN_BREAK,
          { hookType: id, reason: error.message },
        );
      }
    },

    /**
     * Execute a sequence of microprocessors
     * UNIFIED: Always returns a Promise.
     * 
     * @param {string[]} sequence - Array of microprocessor IDs
     * @param {any} initialPayload - Starting input data
     * @param {Object} context - Shared context across the pipeline
     * @returns {Promise<any>} The final processed output
     */
    async executePipeline(sequence, initialPayload, context = {}) {
      if (!Array.isArray(sequence)) return initialPayload;
      
      let currentPayload = initialPayload;
      for (const id of sequence) {
        currentPayload = await this.execute(id, currentPayload, context);
      }
      return currentPayload;
    },
    
    /**
     * Check if a processor is registered
     */
    has(id) {
      return registry.has(id);
    },
    
    /**
     * List all registered processors
     */
    list() {
      return Array.from(registry.keys());
    }
  };
}

// Global instance for VerseIR architecture
export const verseIRMicroprocessors = createMicroprocessorFactory();

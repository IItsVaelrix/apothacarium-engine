/**
 * UNIFIED PROCESSOR BRIDGE
 *
 * Consistent async interface for microprocessors across environments.
 * - Browser: offloads to WebWorker, falls back gracefully on failure.
 * - Node.js: executes directly via factory (lazy import avoids bundling Node APIs in browser).
 */

// Safe fallback results — keep the pipeline alive when a processor fails
const FALLBACKS = {
  'pixel.trace':    () => ({ coordinates: [] }),
  'pixel.resample': ({ pixelData, dimensions }) => ({ pixelData, dimensions }),
  'pixel.quantize': ({ colors }) => ({ quantizedColors: Array.isArray(colors) ? colors : [] }),
  'pixel.decode':   () => ({ pixelData: new Uint8ClampedArray(0), dimensions: { width: 0, height: 0 } }),
};

// AMP runtime imports (lazy to avoid bundling issues)
let ampRuntime = null;

async function getAmpRuntime() {
  if (!ampRuntime) {
    ampRuntime = await import('../../runtime/amp.pipeline.js');
  }
  return ampRuntime;
}

class ProcessorBridge {
  async execute(id, payload, context = {}, options = {}) {
    // AMP special handler - delegates to animation AMP
    if (id === 'amp.run') {
      const { runAnimationAmp } = await import('../animation/amp/runAnimationAmp.js');
      return await runAnimationAmp(payload);
    }

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      // Browser: use worker, fall back on any error
      try {
        const { workerClient } = await import('./microprocessor.worker-client.js');
        return await workerClient.execute(id, payload, context, options);
      } catch (err) {
        console.warn(`[ProcessorBridge] Worker failed for [${id}] — using fallback. Reason: ${err.message}`);
        const fallback = FALLBACKS[id];
        if (fallback) return fallback(payload, context);
        throw err;
      }
    } else {
      // Node.js (or browser without Worker support): lazy import avoids bundling Node-only APIs
      const { verseIRMicroprocessors } = await import('../microprocessors/index.js');
      return await verseIRMicroprocessors.execute(id, payload, context);
    }
  }

  async executePipeline(sequence, payload, context = {}, options = {}) {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const { workerClient } = await import('./microprocessor.worker-client.js');
        return await workerClient.executePipeline(sequence, payload, context, options);
      } catch (err) {
        console.warn(`[ProcessorBridge] Pipeline failed [${sequence.join(' → ')}]: ${err.message}`);
        throw err;
      }
    } else {
      const { verseIRMicroprocessors } = await import('../microprocessors/index.js');
      return await verseIRMicroprocessors.executePipeline(sequence, payload, context);
    }
  }
}

export const processorBridge = new ProcessorBridge();

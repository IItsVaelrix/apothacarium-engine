/**
 * MICROPROCESSOR WEB WORKER
 * 
 * background thread for heavy data transformations.
 * Prevents UI "stasis" during image processing or complex NLU.
 */

import { verseIRMicroprocessors } from '../../microprocessors/index.js';

self.onmessage = async (event) => {
  const { id, type, payload, sequence, context, taskId } = event.data;

  try {
    let result;

    if (type === 'EXECUTE') {
      result = await verseIRMicroprocessors.execute(id, payload, context);
    } else if (type === 'PIPELINE') {
      result = await verseIRMicroprocessors.executePipeline(sequence, payload, context);
    } else {
      throw new Error(`UNKNOWN_WORKER_COMMAND: ${type}`);
    }

    // Return result with the original taskId for promise resolution
    self.postMessage({
      taskId,
      success: true,
      result
    });
  } catch (error) {
    self.postMessage({
      taskId,
      success: false,
      error: error.message || 'Worker execution failed'
    });
  }
};

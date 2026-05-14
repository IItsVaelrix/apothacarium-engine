/**
 * MICROPROCESSOR WORKER CLIENT
 * 
 * Orchestrates communication with the Microprocessor WebWorker.
 * Turns message-passing into clean Async/Await promises.
 */

const DEFAULT_TIMEOUT_MS = 10000; // 10s default safety shield

class MicroprocessorWorkerClient {
  constructor() {
    this.worker = null;
    this.pendingTasks = new Map();
    this.nextTaskId = 1;
    this._initialized = false;
  }

  /**
   * Initialize the worker thread
   */
  init() {
    if (this._initialized) return;
    
    // Create worker using Vite's URL constructor pattern
    this.worker = new Worker(
      new URL('./workers/microprocessor.worker.js', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (event) => {
      const { taskId, success, result, error } = event.data;
      const task = this.pendingTasks.get(taskId);

      if (task) {
        if (task.timeoutId) clearTimeout(task.timeoutId);
        
        if (success) {
          task.resolve(result);
        } else {
          task.reject(new Error(error));
        }
        this.pendingTasks.delete(taskId);
      }
    };

    this.worker.onerror = (error) => {
      console.error('[Worker] Fatal Error:', error);
      // Reject all pending tasks on fatal worker error
      for (const [taskId, task] of this.pendingTasks.entries()) {
        if (task.timeoutId) clearTimeout(task.timeoutId);
        task.reject(new Error('FATAL_WORKER_ERROR'));
        this.pendingTasks.delete(taskId);
      }
    };

    this._initialized = true;
  }

  /**
   * Execute a single microprocessor in the background
   */
  execute(id, payload, context = {}, options = {}) {
    this.init();
    const taskId = this.nextTaskId++;
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`TASK_TIMEOUT: Microprocessor [${id}] timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingTasks.set(taskId, { resolve, reject, timeoutId });
      
      this.worker.postMessage({
        type: 'EXECUTE',
        id,
        payload,
        context,
        taskId
      });
    });
  }

  /**
   * Execute a pipeline of microprocessors in the background
   */
  executePipeline(sequence, payload, context = {}, options = {}) {
    this.init();
    const taskId = this.nextTaskId++;
    const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS;
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingTasks.has(taskId)) {
          this.pendingTasks.delete(taskId);
          reject(new Error(`PIPELINE_TIMEOUT: Sequence [${sequence.join('->')}] timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.pendingTasks.set(taskId, { resolve, reject, timeoutId });
      
      this.worker.postMessage({
        type: 'PIPELINE',
        sequence,
        payload,
        context,
        taskId
      });
    });
  }

  /**
   * Terminate the worker (rarely needed)
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this._initialized = false;
    }
  }
}

export const workerClient = new MicroprocessorWorkerClient();

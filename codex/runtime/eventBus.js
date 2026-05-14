/**
 * A simple, structured event bus for CODEx.
 * Allows different parts of the application to communicate without direct dependencies.
 *
 * @see AI_Architecture_V2.md section 5.2
 */

const listeners = new Map();

/**
 * Emits an event to all registered listeners.
 * @param {string} eventName The name of the event to emit.
 * @param {any} [data] The data to pass to the listeners.
 */
export function emit(eventName, data) {
  if (listeners.has(eventName)) {
    listeners.get(eventName).forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        console.error(`Error in event listener for "${eventName}":`, e);
      }
    });
  }
}

/**
 * Registers a listener for a specific event.
 * @param {string} eventName The name of the event to listen for.
 * @param {function(any): void} callback The function to call when the event is emitted.
 * @returns {function(): void} A function to unsubscribe the listener.
 */
export function on(eventName, callback) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, []);
  }
  listeners.get(eventName).push(callback);

  // Return an unsubscribe function
  return () => {
    const eventListeners = listeners.get(eventName);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  };
}

/**
 * Clears all listeners, useful for testing or full application resets.
 */
export function clearAllListeners() {
    listeners.clear();
}
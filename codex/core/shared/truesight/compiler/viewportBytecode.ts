/**
 * Viewport Bytecode Channel — Authoritative Logic
 * 
 * Synchronizes physical browser viewport dimensions with the Codex 
 * Microprocessor pipeline. Enables responsive layout calculations 
 * that are bit-identical between UI and Core logic.
 * 
 * @see PDR-2026-05-09-CELL-WALL-INFRASTRUCTURE
 */

export interface ViewportState {
  width: number;
  height: number;
  deviceClass: 'desktop' | 'tablet' | 'mobile-ios' | 'mobile-android';
  orientation: 'landscape' | 'portrait' | 'square';
  pixelRatio: number;
}

export const DEFAULT_VIEWPORT_STATE: ViewportState = {
  width: 1920,
  height: 1080,
  deviceClass: 'desktop',
  orientation: 'landscape',
  pixelRatio: 1
};

/**
 * Detects device class based on width breakpoints.
 */
export function detectDeviceClass(viewportWidth: number): ViewportState['deviceClass'] {
  if (viewportWidth >= 1024) return 'desktop';
  if (viewportWidth >= 768) return 'tablet';
  if (viewportWidth >= 375) return 'mobile-ios';
  return 'mobile-android';
}

/**
 * Detects viewport orientation.
 */
export function detectOrientation(width: number, height: number): ViewportState['orientation'] {
  if (width === height) return 'square';
  return width > height ? 'landscape' : 'portrait';
}

/**
 * Encodes viewport state into a compact bytecode format.
 */
export function encodeViewportBytecode(state: ViewportState): string {
  const orientationBit = state.orientation === 'landscape' ? 0 : (state.orientation === 'portrait' ? 1 : 2);
  const deviceBits = ['desktop', 'tablet', 'mobile-ios', 'mobile-android'].indexOf(state.deviceClass);
  return `V${state.width}X${state.height}O${orientationBit}D${deviceBits}R${Math.round(state.pixelRatio * 10)}`;
}

/**
 * The ViewportChannel singleton acts as the state store for the Vacuum Layer.
 */
class ViewportChannelInstance {
  private state: ViewportState = { ...DEFAULT_VIEWPORT_STATE };

  update(newState: Partial<ViewportState>) {
    this.state = { ...this.state, ...newState };
    // Trigger any registered observers if needed in the future
  }

  getState(): ViewportState {
    return { ...this.state };
  }
}

export const ViewportChannel = new ViewportChannelInstance();

export function createViewportChannel(initialState?: Partial<ViewportState>) {
  const channel = new ViewportChannelInstance();
  if (initialState) channel.update(initialState);
  return channel;
}

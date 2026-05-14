/**
 * LAYER 3: PHYSICS EXTENSION - Stretch & Squash
 *
 * Applies cartoon physics principles to pixel art coordinates.
 * Simulates elastic deformation for dynamic visual effects.
 */

/**
 * Physics extension configuration
 */
const DEFAULT_CONFIG = Object.freeze({
  stretchFactor: 1.2,
  squashFactor: 0.8,
  animationDuration: 300, // ms
  elasticity: 0.7,
  damping: 0.85,
});

/**
 * Apply motion blur to pixel buffer
 * @param {Uint8ClampedArray} buffer - Pixel buffer
 * @param {number} durationMs - Animation duration
 * @returns {Uint8ClampedArray} Blurred buffer
 */
function applyMotionBlur(buffer, durationMs) {
  const result = new Uint8ClampedArray(buffer);
  const blurAmount = Math.min(8, Math.floor(durationMs / 50));
  
  // Simple horizontal motion blur
  for (let y = 0; y < Math.sqrt(buffer.length / 4); y++) {
    for (let x = blurAmount; x < Math.sqrt(buffer.length / 4); x++) {
      const i = (y * Math.sqrt(buffer.length / 4) + x) * 4;
      const srcI = ((y * Math.sqrt(buffer.length / 4) + (x - blurAmount)) * 4);
      
      result[i] = Math.round((result[i] + result[srcI]) / 2);
      result[i + 1] = Math.round((result[i + 1] + result[srcI + 1]) / 2);
      result[i + 2] = Math.round((result[i + 2] + result[srcI + 2]) / 2);
    }
  }
  
  return result;
}

/**
 * Physics extension for stretch/squash animation
 */
export const physicsStretchSquash = Object.assign(
  function(payload, context) {
    const coords = payload.coordinates || (Array.isArray(payload) ? payload : []);
    return {
      ...payload,
      coordinates: physicsStretchSquash.hooks.onCoordinateMap(coords, context)
    };
  },
  {
    id: 'physics-stretch-squash',
    type: 'PHYSICS',
    
    config: { ...DEFAULT_CONFIG }, // Remove Object.freeze to allow configure()
    
    /**
     * Update extension configuration
     * @param {Object} newConfig - New configuration values
     */
    configure(newConfig) {
      Object.assign(this.config, {
        ...DEFAULT_CONFIG,
        ...newConfig,
      });
    },
    
    hooks: {
      /**
       * Apply stretch/squash to coordinates
       * @param {Array} coords - Input coordinates
       * @param {Object} _context - Extension context
       * @returns {Array} Modified coordinates
       */
      onCoordinateMap(coords, _context) {
        if (!Array.isArray(coords) || coords.length === 0) return coords;
        
        const { stretchFactor, squashFactor } = physicsStretchSquash.config;
        const centerX = Math.max(...coords.map(c => c.x || 0)) / 2;
        const centerY = Math.max(...coords.map(c => c.y || 0)) / 2;
        
        return coords.map((coord, index) => {
          // Create wave-like stretch pattern
          const wavePhase = (index / coords.length) * Math.PI * 2;
          const stretchX = 1 + (Math.sin(wavePhase) * (stretchFactor - 1) * 0.5);
          const squashY = 1 - (Math.sin(wavePhase) * (1 - squashFactor) * 0.5);
          
          return {
            ...coord,
            x: Math.round(centerX + ((coord.x - centerX) * stretchX)),
            y: Math.round(centerY + ((coord.y - centerY) * squashY)),
          };
        });
      },
      
      /**
       * Apply motion blur for animation frames
       * @param {Uint8ClampedArray} buffer - Pixel buffer
       * @param {Object} _context - Extension context
       * @returns {Uint8ClampedArray} Modified buffer
       */
      onRender(buffer, _context) {
        if (!(buffer instanceof Uint8ClampedArray)) return buffer;
        
        const { animationDuration } = physicsStretchSquash.config;
        return applyMotionBlur(buffer, animationDuration);
      },
    },
    
    /**
     * Activate extension
     * @param {Object} context - Extension registry context
     */
    activate(context) {
      context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
      context.registerHook('render', this.hooks.onRender);
    },
    
    /**
     * Deactivate extension
     * @param {Object} context - Extension registry context
     */
    deactivate(context) {
      context.unregisterHook('coordinate-map');
      context.unregisterHook('render');
    },
  }
);

/**
 * Gravity simulation extension
 * Applies gravitational pull to coordinates
 */
export const physicsGravity = Object.assign(
  function(payload, context) {
    const coords = payload.coordinates || (Array.isArray(payload) ? payload : []);
    return {
      ...payload,
      coordinates: physicsGravity.hooks.onCoordinateMap(coords, context)
    };
  },
  {
    id: 'physics-gravity',
    type: 'PHYSICS',
    
    config: {
      gravity: 9.8, // m/s² equivalent
      timeStep: 0.016, // 60fps
      floorY: null, // Auto-detect if null
    },
    
    hooks: {
      onCoordinateMap(coords, _context) {
        if (!Array.isArray(coords) || coords.length === 0) return coords;
        
        const { gravity, timeStep, floorY } = physicsGravity.config;
        const maxY = Math.max(...coords.map(c => c.y || 0));
        const floor = floorY !== null ? floorY : maxY;
        
        return coords.map((coord) => {
          const height = floor - (coord.y || 0);
          const fallTime = Math.sqrt((2 * height) / gravity);
          const velocity = gravity * fallTime * timeStep;
          
          return {
            ...coord,
            y: Math.min(floor, (coord.y || 0) + velocity * 10),
            z: Math.max(0, (coord.z || 0) - velocity),
          };
        });
      },
    },
    
    activate(context) {
      context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
    },
    
    deactivate(context) {
      context.unregisterHook('coordinate-map');
    },
  }
);


/**
 * Bounce animation extension
 * Simulates bouncing ball physics
 */
export const physicsBounce = {
  id: 'physics-bounce',
  type: 'PHYSICS',
  
  config: Object.freeze({
    bounceHeight: 0.6,
    bounceCount: 3,
    floorY: null,
  }),
  
  hooks: {
    onCoordinateMap(coords, _context) {
      if (!Array.isArray(coords) || coords.length === 0) return coords;
      
      const { bounceHeight, bounceCount, floorY } = this.config;
      const maxY = Math.max(...coords.map(c => c.y || 0));
      const minY = Math.min(...coords.map(c => c.y || 0));
      const floor = floorY !== null ? floorY : maxY;
      const ceiling = minY;
      
      return coords.map((coord, index) => {
        const bouncePhase = (index / Math.max(1, coords.length - 1)) * Math.PI * bounceCount;
        const bounceAmplitude = (floor - ceiling) * bounceHeight;
        const bounceOffset = Math.sin(bouncePhase) * bounceAmplitude * Math.pow(0.7, Math.floor(bouncePhase / Math.PI));
        
        return {
          ...coord,
          y: Math.round(floor - bounceOffset),
        };
      });
    },
  },
  
  activate(context) {
    context.registerHook('coordinate-map', this.hooks.onCoordinateMap);
  },
  
  deactivate(context) {
    context.unregisterHook('coordinate-map');
  },
};

/**
 * Export all physics extensions
 */
export const PHYSICS_EXTENSIONS = Object.freeze([
  physicsStretchSquash,
  physicsGravity,
  physicsBounce,
]);

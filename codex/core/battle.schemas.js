/**
 * @typedef {Object} Position
 * @property {number} x - Grid X coordinate (0-indexed).
 * @property {number} y - Grid Y coordinate (0-indexed).
 */

/**
 * @typedef {Object} FieldEffect
 * @property {string} id - Unique ID.
 * @property {string} type - 'RESONANCE_BUFF' | 'POISON_SNARE'
 * @property {string} school - SONIC, VOID, etc.
 * @property {number} magnitude - Intensity of the effect (0.1 - 1.0).
 * @property {number} duration - Turns remaining (-1 for infinite).
 */

/**
 * @typedef {Object} GridCell
 * @property {Position} position
 * @property {string|null} school - The school dominating this cell (affects resonance).
 * @property {number} intensity - Resonance intensity (0.0-1.0).
 * @property {FieldEffect|null} fieldEffect - Active status effect on this cell.
 * @property {string|null} occupantId - ID of the entity currently standing here.
 */

/**
 * @typedef {Object} Range
 * @property {number} min - Minimum range from origin.
 * @property {number} max - Maximum range from origin.
 * @property {('radial'|'linear'|'arc'|'custom')} shape - Area of effect pattern.
 * @property {Position[]} [customCells] - Explicit relative coordinates for 'custom' shape.
 */

/**
 * @typedef {Object} BattleEntity
 * @property {string} id - Unique entity ID.
 * @property {string} name - Display name.
 * @property {string} school - Base school affinity.
 * @property {number} hp - Current HP.
 * @property {number} maxHp - Maximum HP.
 * @property {number} mp - Current MP.
 * @property {number} maxMp - Maximum MP.
 * @property {Position} position - Current grid position.
 * @property {number} orientation - Facing direction in degrees (0 = North/Up).
 * @property {string} status - 'online' | 'stunned' | 'silenced' | 'exhausted'.
 * @property {Object[]} statusEffects - List of active status effects.
 * @property {string} bytecodeEffectClass - PixelBrain effect class (INERT, RESONANT, etc.).
 * @property {number} glowIntensity - PixelBrain glow measurement (0.0-1.0).
 */

/**
 * @typedef {Object} BattleTurnResult
 * @property {string} entityId - ID of the entity who performed the action.
 * @property {string} actionType - 'move' | 'cast' | 'wait' | 'flee'.
 * @property {Position} origin - Starting position of the action.
 * @property {Position} [destination] - Ending position for 'move'.
 * @property {string} [spellText] - The verse cast (for 'cast').
 * @property {Position} [targetCell] - Targeted grid cell.
 * @property {Position[]} affectedCells - All cells caught in the effect.
 * @property {Object[]} damageMap - [{ targetId, amount, outcomeLabel, blocked }].
 * @property {string} narrativeLog - MUD-style spatial description of the result.
 */

/**
 * @typedef {Object} BattleState
 * @property {string} id - Session ID.
 * @property {number} gridWidth - Number of columns (e.g., 7).
 * @property {number} gridHeight - Number of rows (e.g., 7).
 * @property {GridCell[][]} grid - The 2D grid matrix.
 * @property {BattleEntity[]} entities - All active combatants (player, opponents, summons).
 * @property {string} activeEntityId - Whose turn it is.
 * @property {number} round - Current round number.
 * @property {string} phase - 'idle' | 'planning' | 'resolving' | 'victory' | 'defeat'.
 * @property {BattleTurnResult[]} history - Chronological log of all actions.
 * @property {Object} metadata - Contextual data (arena school, atmosphere intensity).
 */

export const INITIAL_GRID_SIZE = 9;

/**
 * Creates an empty Resonance Grid.
 * @param {number} width 
 * @param {number} height 
 * @returns {GridCell[][]}
 */
export function createEmptyGrid(width = INITIAL_GRID_SIZE, height = INITIAL_GRID_SIZE) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({
        position: { x, y },
        school: null,
        intensity: 0,
        fieldEffectId: null,
        occupantId: null,
      });
    }
    grid.push(row);
  }
  return grid;
}

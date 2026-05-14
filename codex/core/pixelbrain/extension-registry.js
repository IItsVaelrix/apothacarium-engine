/**
 * PixelBrain Extension Registry
 * 
 * Manages extension registration and hook execution with bytecode error handling.
 */

import {
  MODULE_IDS,
  createExtensionError,
  createHookError,
} from './bytecode-error.js';

const EXTENSION_TYPES = new Set(['PHYSICS', 'STYLE', 'CUSTOM_PROP']);
const HOOK_PROPERTY_TO_TYPE = Object.freeze({
  onCoordinateMap: 'coordinate-map',
  onColorByte: 'color-byte',
  onNoiseGen: 'noise-gen',
  onRender: 'render',
});

function normalizeExtensionType(type) {
  const normalized = String(type || '').trim().toUpperCase();
  if (!EXTENSION_TYPES.has(normalized)) {
    throw createExtensionError(MODULE_IDS.EXT_REGISTRY, 'UNSUPPORTED_TYPE', type, {
      providedType: type,
      allowedTypes: [...EXTENSION_TYPES],
    });
  }
  return normalized;
}

function normalizeHookType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (!Object.values(HOOK_PROPERTY_TO_TYPE).includes(normalized)) {
    throw createHookError(MODULE_IDS.EXT_REGISTRY, normalized, 'INVALID_TYPE', {
      providedType: type,
      allowedTypes: Object.values(HOOK_PROPERTY_TO_TYPE),
    });
  }
  return normalized;
}

function toPublicExtensionRecord(extension) {
  return Object.freeze({
    id: String(extension?.id || '').trim(),
    type: String(extension?.type || '').trim().toUpperCase(),
  });
}

function validateExtension(extension) {
  if (!extension || typeof extension !== 'object') {
    throw createExtensionError(MODULE_IDS.EXT_REGISTRY, 'INVALID_OBJECT', null, {
      providedValue: extension,
      expectedType: 'object',
    });
  }

  const id = String(extension.id || '').trim();
  if (!id) {
    throw createExtensionError(MODULE_IDS.EXT_REGISTRY, 'MISSING_ID', null, {
      providedId: extension.id,
      requirement: 'non-empty string',
    });
  }

  return Object.freeze({
    ...extension,
    id,
    type: normalizeExtensionType(extension.type),
    hooks: extension.hooks && typeof extension.hooks === 'object'
      ? { ...extension.hooks }
      : {},
    config: extension.config && typeof extension.config === 'object'
      ? { ...extension.config }
      : {},
  });
}

function compareHookRecords(left, right) {
  const sequenceDelta = left.sequence - right.sequence;
  if (sequenceDelta !== 0) return sequenceDelta;
  return left.extension.id.localeCompare(right.extension.id);
}

export function createExtensionRegistry(options = {}) {
  const extensions = new Map();
  const hooks = new Map([
    ['coordinate-map', []],
    ['color-byte', []],
    ['noise-gen', []],
    ['render', []],
  ]);
  let sequence = 0;

  function registerHookRecord(extension, type, hook) {
    const normalizedType = normalizeHookType(type);
    if (typeof hook !== 'function') {
      throw createHookError(MODULE_IDS.EXT_REGISTRY, normalizedType, 'NOT_FUNCTION', {
        hookType: normalizedType,
        extensionId: extension.id,
        actualType: typeof hook,
      });
    }

    hooks.get(normalizedType).push({
      sequence: sequence += 1,
      extension,
      hook,
    });
  }

  function removeHooksForExtension(extensionId, type = null) {
    const targetTypes = type ? [normalizeHookType(type)] : [...hooks.keys()];
    targetTypes.forEach((hookType) => {
      hooks.set(
        hookType,
        hooks.get(hookType).filter((entry) => entry.extension.id !== extensionId)
      );
    });
  }

  function createContext(extension) {
    return Object.freeze({
      registerHook(type, hook) {
        registerHookRecord(extension, type, hook);
      },
      unregisterHook(type) {
        removeHooksForExtension(extension.id, type);
      },
    });
  }

  function register(extension) {
    const normalized = validateExtension(extension);
    if (extensions.has(normalized.id)) {
      throw createExtensionError(MODULE_IDS.EXT_REGISTRY, 'ALREADY_REGISTERED', normalized.id, {
        extensionId: normalized.id,
        existingExtension: toPublicExtensionRecord(normalized),
      });
    }

    const context = createContext(normalized);
    extensions.set(normalized.id, {
      extension: normalized,
      context,
    });

    if (typeof normalized.activate === 'function') {
      normalized.activate(context);
    } else {
      Object.entries(HOOK_PROPERTY_TO_TYPE).forEach(([property, hookType]) => {
        const hook = normalized.hooks[property];
        if (typeof hook === 'function') {
          registerHookRecord(normalized, hookType, hook);
        }
      });
    }

    return toPublicExtensionRecord(normalized);
  }

  function unregister(extensionId) {
    const normalizedId = String(extensionId || '').trim();
    const record = extensions.get(normalizedId);
    if (!record) return false;

    if (typeof record.extension.deactivate === 'function') {
      record.extension.deactivate(record.context);
    }
    removeHooksForExtension(normalizedId);
    extensions.delete(normalizedId);
    return true;
  }

  function applyHooks(type, payload, context = {}) {
    const normalizedType = normalizeHookType(type);
    const queue = hooks.get(normalizedType)
      .slice()
      .sort(compareHookRecords);

    return queue.reduce((currentPayload, entry) => {
      const nextPayload = entry.hook.call(entry.extension, currentPayload, Object.freeze({
        ...context,
        extensionId: entry.extension.id,
        extensionType: entry.extension.type,
      }));
      return nextPayload === undefined ? currentPayload : nextPayload;
    }, payload);
  }

  const initialExtensions = Array.isArray(options?.extensions) ? options.extensions : [];
  initialExtensions.forEach((extension) => {
    register(extension);
  });

  return Object.freeze({
    register,
    unregister,
    has(extensionId) {
      return extensions.has(String(extensionId || '').trim());
    },
    list() {
      return Object.freeze(
        [...extensions.values()]
          .map((record) => toPublicExtensionRecord(record.extension))
          .sort((left, right) => left.id.localeCompare(right.id))
      );
    },
    getHooks(type) {
      const normalizedType = normalizeHookType(type);
      return Object.freeze(
        hooks.get(normalizedType)
          .slice()
          .sort(compareHookRecords)
          .map((entry) => Object.freeze({
            extensionId: entry.extension.id,
            type: normalizedType,
          }))
      );
    },
    applyHooks,
    clear() {
      [...extensions.keys()].forEach((extensionId) => {
        unregister(extensionId);
      });
    },
  });
}

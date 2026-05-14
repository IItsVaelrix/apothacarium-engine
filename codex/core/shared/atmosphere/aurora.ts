/**
 * Aurora Level Singleton
 * 
 * Manages the global aurora intensity level (OFF, DIM, FULL).
 * Persists to localStorage.
 */

import { useState, useEffect } from 'react';

const AURORA_STORAGE_KEY = 'scholomance-aurora-level';
export const AURORA_FACTORS = [0, 0.3, 1.0];

function readStoredAuroraLevel(): number {
  if (typeof window === 'undefined') return 2;
  try {
    const stored = localStorage.getItem(AURORA_STORAGE_KEY);
    const parsed = parseInt(stored ?? '2', 10);
    return (parsed >= 0 && parsed <= 2) ? parsed : 2;
  } catch {
    return 2;
  }
}

let _auroraLevel = readStoredAuroraLevel();
const _auroraListeners = new Set<(level: number) => void>();

export function getAuroraLevel(): number {
  return _auroraLevel;
}

export function cycleAuroraLevel(): number {
  // FULL(2) → DIM(1) → OFF(0) → FULL(2)
  _auroraLevel = _auroraLevel === 2 ? 1 : _auroraLevel === 1 ? 0 : 2;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(AURORA_STORAGE_KEY, String(_auroraLevel));
    } catch {
      // noop
    }
  }
  _auroraListeners.forEach(fn => fn(_auroraLevel));
  return _auroraLevel;
}

export function subscribeToAuroraLevel(fn: (level: number) => void): () => void {
  _auroraListeners.add(fn);
  return () => {
    _auroraListeners.delete(fn);
  };
}

export function useAuroraLevel(): number {
  const [level, setLevel] = useState(_auroraLevel);
  useEffect(() => {
    _auroraListeners.add(setLevel);
    return () => {
      _auroraListeners.delete(setLevel);
    };
  }, []);
  return level;
}

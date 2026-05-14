/**
 * Atmosphere Reactive Microprocessor
 * 
 * Drives global atmospheric CSS variables and signal-level modulation.
 * Decouples atmospheric rendering from the React tree.
 * 
 * Stage: Reactive
 * Domain: PixelBrain / Atmosphere
 */

import { MotionProcessor, MotionWorkingState, AnimationIntent } from '../../contracts/animation.types.ts';
import { getAmbientPlayerService, AMBIENT_PLAYER_STATES } from '../../../shared/ambient/ambientPlayer.service.js';
import { SCHOOLS, generateSchoolColor } from '../../../constants/schools.js';
import { getAuroraLevel, subscribeToAuroraLevel, AURORA_FACTORS } from '../../../shared/atmosphere/aurora.ts';

// ─── Singleton State ────────────────────────────────────────────────────────

let isInitialized = false;
let rafId: number | null = null;
let currentAmbientState = { schoolId: null as string | null, isActive: false };
let detectedId: string | null = null;
let lastAppliedSchoolId: string | null = null;
const lastBlendedHsl: any = null;

// ─── Internal Implementation ────────────────────────────────────────────────

function applyAtmosphereVariables(overrides: any = {}) {
  const service = getAmbientPlayerService();
  if (!service) return; // Guard for non-browser environments if service isn't available

  const ambientState = service.getState?.() || { schoolId: null };
  const auroraLevel = typeof getAuroraLevel === 'function' ? getAuroraLevel() : 0;
  
  // Priority: Overridden Dominant School > Detected School (Sonic Energy) > Active ambient station > Active song > Last selected ambient > Default
  const activeSchoolId = (overrides.dominantSchool
    || detectedId
    || (currentAmbientState.isActive && currentAmbientState.schoolId)
    || ambientState.schoolId
    || "SONIC") as keyof typeof SCHOOLS;

  const school = SCHOOLS[activeSchoolId];
  if (!school) return;
  
  // LAW 15: Processors must be environment-agnostic.
  // We calculate the values, but only apply to document if it exists.
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  
  // Use overridden blended HSL if provided, otherwise use school default
  const h = overrides.blendedHsl ? overrides.blendedHsl.h : school.colorHsl.h;
  const baseS = overrides.blendedHsl ? overrides.blendedHsl.s : school.colorHsl.s;
  const baseL = overrides.blendedHsl ? overrides.blendedHsl.l : school.colorHsl.l;
  
  const atmo = school.atmosphere;
  const isActive = currentAmbientState.isActive;

  // Bytecode Resonance Model: high energy for active tracks
  const saturation = isActive ? Math.min(100, baseS + 15) : baseS;
  const lightness = isActive ? Math.min(90, baseL + 5) : baseL;
  const glowAlpha = isActive ? 0.6 : 0.35;

  if (root) {
    root.style.setProperty("--active-school-color", generateSchoolColor(school.id));
    root.style.setProperty("--active-school-h", String(h));
    root.style.setProperty("--active-school-s", `${saturation}%`);
    root.style.setProperty("--active-school-l", `${lightness}%`);
    root.style.setProperty("--active-school-glow", `hsla(${h}, ${saturation}%, ${lightness}%, ${glowAlpha})`);
    root.style.setProperty("--active-aurora-intensity", String(atmo.auroraIntensity * AURORA_FACTORS[auroraLevel]));
    root.style.setProperty("--active-saturation", `${atmo.saturation}%`);
    root.style.setProperty("--active-vignette-strength", String(atmo.vignetteStrength));
    root.style.setProperty("--active-scanline-opacity", String(atmo.scanlineOpacity));
  }
  
  lastAppliedSchoolId = activeSchoolId;
}

function startAtmosphereLoop() {
  const raf = typeof window !== 'undefined' ? window.requestAnimationFrame : (typeof globalThis !== 'undefined' ? globalThis.requestAnimationFrame : null);
  if (!raf) return;
  if (rafId) return;

  const service = getAmbientPlayerService();
  if (!service) return;
  
  const tick = () => {
    const level = service.getSignalLevel() || 0;
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty("--active-signal-level", level.toFixed(3));
    }
    rafId = raf(tick);
  };

  rafId = raf(tick);
}

function initialize() {
  if (isInitialized || typeof window === 'undefined') return;

  const service = getAmbientPlayerService();
  if (!service) return;
  
  // 1. Subscribe to Ambient Player Service
  service.subscribe((state: any) => {
    const isActive =
      state.status === AMBIENT_PLAYER_STATES.PLAYING ||
      state.status === AMBIENT_PLAYER_STATES.TUNING;
    
    if (currentAmbientState.schoolId !== state.schoolId || currentAmbientState.isActive !== isActive) {
      currentAmbientState = { schoolId: state.schoolId, isActive };
      applyAtmosphereVariables();
      
      if (typeof document !== 'undefined') {
        document.documentElement.style.setProperty(
          "--is-music-active",
          isActive ? "1" : "0"
        );
      }
    }
  });

  // 2. Subscribe to Aurora Level
  if (typeof subscribeToAuroraLevel === 'function') {
    subscribeToAuroraLevel(() => {
      applyAtmosphereVariables();
    });
  }

  // 3. Start RAF Loop for signal modulation
  startAtmosphereLoop();

  // 4. Detected School Polling
  const pollDetectedSchool = async () => {
    if (currentAmbientState.isActive) {
      const id = await service.getDetectedSchoolId?.();
      if (id && id !== detectedId) {
        detectedId = id;
        applyAtmosphereVariables();
      }
    } else if (detectedId !== null) {
      detectedId = null;
      applyAtmosphereVariables();
    }
    setTimeout(pollDetectedSchool, 1000); // Polling detected school at lower freq
  };
  pollDetectedSchool();

  isInitialized = true;
  console.log('[AtmosphereProcessor] Global atmosphere driver initialized');
}

// ─── Motion Processor Implementation ────────────────────────────────────────

export const atmosphereProcessor: MotionProcessor = {
  id: 'mp.reactive.atmosphere',
  stage: 'reactive',
  priority: 100,
  
  supports(intent: AnimationIntent): boolean {
    return intent.targetId === 'global:atmosphere' || 
           intent.trigger === 'audio' || 
           intent.trigger === 'route-change' ||
           intent.trigger === 'mount' ||
           intent.trigger === 'state-change';
  },
  
  run(input: MotionWorkingState): MotionWorkingState {
    if (!isInitialized) {
      initialize();
    }

    const state = { ...input };
    const intent = state.intent;

    // Handle Route-based pausing (from Phase 1 plan)
    if (intent.trigger === 'route-change' && intent.state?.pathname) {
      const pathname = intent.state.pathname as string;
      const isWatchPage = pathname === "/watch" || pathname === "/";
      if (isWatchPage) {
        const service = getAmbientPlayerService();
        if (service.getState().status !== AMBIENT_PLAYER_STATES.PAUSED && 
            service.getState().status !== AMBIENT_PLAYER_STATES.IDLE) {
          void service.pause();
        }
      }
    }

    // Handle Adaptive Overrides (if any)
    if (intent.state?.blendedHsl || intent.state?.dominantSchool) {
      applyAtmosphereVariables({
        blendedHsl: intent.state.blendedHsl,
        dominantSchool: intent.state.dominantSchool
      });
      state.diagnostics.push('Atmosphere overrides applied via intent state');
    }

    return state;
  },
};

import { getTrackEmbedConfig } from "../musicEmbeds.js";
import { SCHOOLS } from "../../constants/schools.js";
import { freshRng } from "../math/seededRng.js";
import {
  getDefaultSchoolId,
  getRandomizedStationTrackUrl,
  getSchoolAudioConfig,
} from "./schoolAudio.config.js";
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from "../../pixelbrain/bytecode-error.js";

const MOD = MODULE_IDS.SHARED;

const SETTINGS_STORAGE_KEY = "scholomance.ambient.settings.v1";

const DEFAULT_SETTINGS = Object.freeze({
  schoolId: null,
  volume: 0.5,
  autoplayAmbient: false,
  cyclingEnabled: true,
  sinkId: "", // Default system output
});

const DEFAULT_OPTIONS = Object.freeze({
  tuningDurationMs: 1500,
  tuningDurationMinMs: 1500,
  tuningDurationMaxMs: 1500,
  tuningCompletionTimeoutMs: 8000,
  fadeOutMs: 350,
  fadeInMs: 700,
  dialLockMs: 300,
});

const DEFAULT_PROVIDER_CAPABILITIES = Object.freeze({
  canAnalyze: false,
  canSetVolumeSmooth: false,
  supportsSeek: false,
});

const CONTEXT_RECOVERY_EVENTS = Object.freeze(["pointerdown", "keydown", "touchstart"]);

function createProviderCapabilities(overrides = {}) {
  return {
    ...DEFAULT_PROVIDER_CAPABILITIES,
    ...overrides,
  };
}

export const AMBIENT_PLAYER_STATES = Object.freeze({
  IDLE: "IDLE",
  PLAYING: "PLAYING",
  TUNING: "TUNING",
  PAUSED: "PAUSED",
  ERROR: "ERROR",
});

export const AMBIENT_PLAYER_EVENTS = Object.freeze({
  SELECT_SCHOOL: "SELECT_SCHOOL",
  TUNE_COMPLETE: "TUNE_COMPLETE",
  PLAY: "PLAY",
  PAUSE: "PAUSE",
  TRACK_ENDED: "TRACK_ENDED",
  ERROR: "ERROR",
});

function canUseBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now(); // EXEMPT
  }
  return Date.now(); // EXEMPT
}

const PERCUSSIVE_PULSE_CONFIG = Object.freeze({
  energyEmaAlpha: 0.26,
  floorRiseAlpha: 0.02,
  floorFallAlpha: 0.2,
  cooldownMs: 110, // ~9 Hz max pulse frequency from detected transients.
  holdMs: 42,
  decayMs: 220,
  hitScoreThreshold: 0.08,
  peakWeight: 1.85,
  transientWeight: 2.45,
  crestWeight: 1.15,
});

const BPM_TRACKING_CONFIG = Object.freeze({
  defaultBPM: 90, // Ambient baseline when no audio
  minBPM: 60,     // Minimum detectable tempo
  maxBPM: 180,    // Maximum detectable tempo
  smoothingAlpha: 0.15, // EMA smoothing for BPM stability
  beatWindowMs: 2000, // Window for beat detection
});

export function createPercussivePulseState(overrides = {}) {
  return {
    energyEma: 0,
    floorEma: 0.01,
    pulse: 0,
    lastHitMs: -Infinity,
    lastSampleMs: null,
    ...overrides,
  };
}

export function getPercussivePulseLevelFromWaveform(
  byteTimeData,
  pulseState,
  nowMs = getNowMs()
) {
  if (!pulseState || typeof pulseState !== "object") {
    return 0;
  }
  if (!(byteTimeData instanceof Uint8Array) || byteTimeData.length === 0) {
    return clamp01(pulseState.pulse || 0);
  }

  let absMean = 0;
  let absPeak = 0;
  for (let index = 0; index < byteTimeData.length; index += 1) {
    const normalized = Math.abs((byteTimeData[index] - 128) / 128);
    absMean += normalized;
    if (normalized > absPeak) absPeak = normalized;
  }
  absMean /= byteTimeData.length;

  const previousEnergy = pulseState.energyEma || 0;
  const previousFloor = pulseState.floorEma || 0.01;
  const previousPulse = pulseState.pulse || 0;
  const previousSampleMs = pulseState.lastSampleMs;
  const deltaMs = Number.isFinite(previousSampleMs) ? Math.max(0, nowMs - previousSampleMs) : 0;

  pulseState.energyEma =
    previousEnergy + (absMean - previousEnergy) * PERCUSSIVE_PULSE_CONFIG.energyEmaAlpha;

  const floorAlpha =
    absMean < previousFloor
      ? PERCUSSIVE_PULSE_CONFIG.floorFallAlpha
      : PERCUSSIVE_PULSE_CONFIG.floorRiseAlpha;
  pulseState.floorEma = previousFloor + (absMean - previousFloor) * floorAlpha;

  const transientEnergy = Math.max(0, absMean - previousEnergy);
  const crest = Math.max(0, absPeak - absMean);
  const adaptivePeakBase = pulseState.floorEma + 0.045;
  const peakExcursion = Math.max(0, absPeak - adaptivePeakBase);

  const hitScore =
    transientEnergy * PERCUSSIVE_PULSE_CONFIG.transientWeight +
    crest * PERCUSSIVE_PULSE_CONFIG.crestWeight +
    peakExcursion * PERCUSSIVE_PULSE_CONFIG.peakWeight;
  const isOffCooldown = nowMs - pulseState.lastHitMs >= PERCUSSIVE_PULSE_CONFIG.cooldownMs;
  const isPercussiveHit =
    isOffCooldown && hitScore >= PERCUSSIVE_PULSE_CONFIG.hitScoreThreshold;

  let nextPulse = previousPulse;
  if (isPercussiveHit) {
    pulseState.lastHitMs = nowMs;
    nextPulse = 1;
  } else if (deltaMs > 0) {
    const decay = Math.exp(-deltaMs / PERCUSSIVE_PULSE_CONFIG.decayMs);
    nextPulse = previousPulse * decay;
  }

  if (nowMs - pulseState.lastHitMs <= PERCUSSIVE_PULSE_CONFIG.holdMs) {
    nextPulse = Math.max(nextPulse, 0.92);
  }

  pulseState.pulse = clamp01(nextPulse);
  pulseState.lastSampleMs = nowMs;

  const normalizedEnergy = clamp01(
    (absMean - pulseState.floorEma * 0.82) / (0.27 + pulseState.floorEma)
  );
  return clamp01(normalizedEnergy * 0.42 + pulseState.pulse * 0.94);
}

function toPositiveMs(value, fallbackMs) {
  if (!Number.isFinite(value)) return fallbackMs;
  return Math.max(1, Math.round(value));
}

function clampMsWithinRange(value, minMs, maxMs) {
  return Math.max(minMs, Math.min(maxMs, Math.round(value)));
}

function safeJsonParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch {
    return fallbackValue;
  }
}

function getStorage(optionsStorage) {
  if (optionsStorage) return optionsStorage;
  if (!canUseBrowser()) return null;
  return window.localStorage || null;
}

function readPersistedSettings(storage) {
  if (!storage) return { ...DEFAULT_SETTINGS };
  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  const parsed = safeJsonParse(raw, {});
  return {
    schoolId: typeof parsed.schoolId === "string" ? parsed.schoolId : DEFAULT_SETTINGS.schoolId,
    volume: clamp01(parsed.volume ?? DEFAULT_SETTINGS.volume),
    autoplayAmbient: Boolean(parsed.autoplayAmbient),
    cyclingEnabled: parsed.cyclingEnabled ?? DEFAULT_SETTINGS.cyclingEnabled,
  };
}

function createAudioContext(sinkId = "") {
  if (!canUseBrowser()) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    const options = {};
    if (sinkId && typeof AudioCtx.prototype.setSinkId === "function") {
      options.sinkId = sinkId;
    }
    return new AudioCtx(options);
  } catch {
    return null;
  }
}
function createWhiteNoiseBuffer(audioContext, durationSec) {
  const length = Math.max(1, Math.floor(audioContext.sampleRate * durationSec));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  const rng = freshRng();
  for (let index = 0; index < length; index += 1) {
    channel[index] = rng() * 2 - 1;
  }
  return buffer;
}

function createCrackleCurve(steps = 256) {
  const curve = new Float32Array(steps);
  const rng = freshRng();
  for (let index = 0; index < steps; index += 1) {
    const baseNoise = Math.pow(rng(), 1.9) * 0.2;
    const hasBurst = rng() > 0.84;
    const burst = hasBurst ? 0.32 + rng() * 0.5 : 0;
    curve[index] = Math.min(1, baseNoise + burst);
  }
  curve[0] = 0;
  curve[steps - 1] = 0;
  return curve;
}

function defaultDialSfxPlayer(contextRef, settings = {}) {
  const { lockUntilRef, lockMs = DEFAULT_OPTIONS.dialLockMs, nowFn = Date.now } = settings;
  const now = nowFn();
  if (lockUntilRef.current > now) {
    return false;
  }
  lockUntilRef.current = now + lockMs;

  const audioContext = contextRef.current;
  if (!audioContext) {
    return false;
  }

  const requestedDurationMs = toPositiveMs(settings.durationMs, DEFAULT_OPTIONS.tuningDurationMinMs);
  const durationMs = clampMsWithinRange(requestedDurationMs, 450, 6000);
  const durationSec = durationMs / 1000;
  const startAt = audioContext.currentTime + 0.01;
  const stopAt = startAt + durationSec;
  const source = audioContext.createBufferSource();
  source.buffer = createWhiteNoiseBuffer(audioContext, durationSec + 0.12);

  const highPass = audioContext.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.setValueAtTime(220, startAt);
  highPass.frequency.exponentialRampToValueAtTime(110, stopAt);
  highPass.Q.setValueAtTime(0.55, startAt);

  const bandPass = audioContext.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.setValueAtTime(2900, startAt);
  bandPass.frequency.exponentialRampToValueAtTime(620, startAt + durationSec * 0.72);
  bandPass.frequency.linearRampToValueAtTime(940, stopAt);
  bandPass.Q.setValueAtTime(1.1, startAt);
  bandPass.Q.linearRampToValueAtTime(0.72, stopAt);

  const crackleGain = audioContext.createGain();
  crackleGain.gain.setValueAtTime(0.0001, startAt);
  crackleGain.gain.setValueCurveAtTime(createCrackleCurve(320), startAt, durationSec);

  const gain = audioContext.createGain();
  const attackEnd = startAt + Math.min(0.2, durationSec * 0.16);
  const bodyEnd = startAt + durationSec * 0.72;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(0.24, attackEnd);
  gain.gain.exponentialRampToValueAtTime(0.09, bodyEnd);
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  source.connect(highPass);
  highPass.connect(bandPass);
  bandPass.connect(crackleGain);
  crackleGain.connect(gain);
  gain.connect(audioContext.destination);
  source.start(startAt);
  source.stop(stopAt);

  source.onended = () => {
    source.disconnect();
    highPass.disconnect();
    bandPass.disconnect();
    crackleGain.disconnect();
    gain.disconnect();
  };
  return true;
}

async function createTrackController({
  container,
  trackUrl,
  volume,
  autoPlay,
  onTrackEnded,
  audioContext = null,
}) {
  const embed = getTrackEmbedConfig(trackUrl, { autoPlay });
  if (!embed?.src && !embed?.audioUrl) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.WARN, MOD,
      ERROR_CODES.INVALID_VALUE,
      { parameter: 'trackUrl', reason: 'Unsupported track URL' },
    );
  }

  if ((embed.provider === "suno" || embed.provider === "direct") && embed.audioUrl) {
    let audio = document.createElement("audio");
    audio.crossOrigin = "anonymous";
    audio.src = embed.audioUrl;
    audio.preload = "auto";
    audio.loop = true;
    audio.style.cssText = "width:0;height:0;opacity:0;pointer-events:none;position:absolute;";
    audio.setAttribute("aria-hidden", "true");
    container.appendChild(audio);

    const canUseSunoEmbedFallback = embed.provider === "suno" && Boolean(embed.src);
    let directAudioFailed = false;
    let fallbackIframe = null;
    let usingSunoEmbedFallback = false;

    let analyser = null;
    let analyserData = null;
    let mediaSource = null;
    let outputGain = null;
    const pulseState = createPercussivePulseState();

    const capabilities = createProviderCapabilities({
      canAnalyze: false,
      canSetVolumeSmooth: true,
      supportsSeek: true,
    });

    const disconnectGraph = () => {
      try {
        mediaSource?.disconnect();
        analyser?.disconnect();
        outputGain?.disconnect();
      } catch {
        // Ignore analyser graph teardown failures.
      }
      mediaSource = null;
      analyser = null;
      outputGain = null;
      analyserData = null;
    };

    let resolvedLoad = false;
    let loadTimeoutId = null;
    let resolveLoad = null;
    const handleCanPlay = () => {
      if (resolvedLoad) return;
      resolvedLoad = true;
      audio.removeEventListener("canplaythrough", handleCanPlay);
      if (loadTimeoutId !== null) {
        clearTimeout(loadTimeoutId);
      }
      loadTimeoutId = null;
      resolveLoad?.();
    };

    const handleEnded = () => onTrackEnded?.();

    let corsRetried = false;
    const handleAudioError = (e) => {
      if (!corsRetried && audio.hasAttribute("crossOrigin")) {
        corsRetried = true;
        
        disconnectGraph();
        audio.removeEventListener("error", handleAudioError);
        audio.removeEventListener("canplaythrough", handleCanPlay);
        if (typeof onTrackEnded === "function") {
          audio.removeEventListener("ended", handleEnded);
        }
        audio.pause();
        audio.removeAttribute("src");
        try {
          audio.load();
        } catch {
          // Ignore teardown load errors when retrying without CORS.
        }
        audio.remove();
        
        audio = document.createElement("audio");
        audio.src = embed.audioUrl;
        audio.preload = "auto";
        audio.loop = true;
        audio.style.cssText = "width:0;height:0;opacity:0;pointer-events:none;position:absolute;";
        audio.setAttribute("aria-hidden", "true");
        audio.volume = currentVolume;
        container.appendChild(audio);
        
        audio.addEventListener("error", handleAudioError);
        audio.addEventListener("canplaythrough", handleCanPlay);
        if (typeof onTrackEnded === "function") {
          audio.addEventListener("ended", handleEnded);
        }
        
        capabilities.canAnalyze = false;
        audio.load();
        
        return;
      }
      directAudioFailed = true;
      console.error("Audio playback error:", e?.target?.error || e);
    };
    audio.addEventListener("error", handleAudioError);

    const ensureSunoFallbackIframe = () => {
      if (!canUseSunoEmbedFallback) return null;
      if (fallbackIframe) return fallbackIframe;
      const iframe = document.createElement("iframe");
      iframe.allow = "autoplay";
      iframe.style.cssText = "width:0;height:0;border:0;position:absolute;pointer-events:none;";
      iframe.title = "Suno player";
      container.appendChild(iframe);
      fallbackIframe = iframe;
      return fallbackIframe;
    };

    const setSunoEmbedAutoplay = (enabled) => {
      const iframe = ensureSunoFallbackIframe();
      if (!iframe) return;
      try {
        const url = new URL(embed.src);
        if (enabled) {
          url.searchParams.set("autoplay", "1");
        } else {
          url.searchParams.delete("autoplay");
        }
        iframe.src = url.toString();
      } catch {
        iframe.src = embed.src;
      }
    };

    const stopSunoEmbedFallback = () => {
      if (!fallbackIframe) return;
      fallbackIframe.src = "about:blank";
    };

    let currentVolume = clamp01(volume);

    if (audioContext && typeof audioContext.createMediaElementSource === "function") {
      try {
        mediaSource = audioContext.createMediaElementSource(audio);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // High resolution for spectral analysis
        analyser.smoothingTimeConstant = 0.8;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        analyserData = new Uint8Array(analyser.frequencyBinCount);
        outputGain = audioContext.createGain();
        outputGain.gain.value = currentVolume;
        mediaSource.connect(analyser);
        analyser.connect(outputGain);
        outputGain.connect(audioContext.destination);
        capabilities.canAnalyze = true;
      } catch {
        disconnectGraph();
      }
    }

    if (typeof onTrackEnded === "function") {
      audio.addEventListener("ended", handleEnded);
    }

    const loadPromise = new Promise((resolve) => {
      resolveLoad = resolve;
      const resolveWhenReady = () => {
        if (resolvedLoad) {
          resolve();
          return;
        }
        handleCanPlay();
        resolve();
      };
      audio.addEventListener("canplaythrough", handleCanPlay);
      loadTimeoutId = setTimeout(resolveWhenReady, 5000);
      if (audio.readyState >= 3) {
        resolveWhenReady();
      }
    });

    let destroyed = false;

    const syncCapabilitiesForCurrentMode = () => {
      if (usingSunoEmbedFallback) {
        capabilities.canAnalyze = false;
        capabilities.canSetVolumeSmooth = false;
        capabilities.supportsSeek = false;
        return;
      }
      capabilities.canAnalyze = Boolean(analyser);
      capabilities.canSetVolumeSmooth = true;
      capabilities.supportsSeek = true;
    };

    const activateSunoEmbedFallback = () => {
      if (!canUseSunoEmbedFallback) return false;
      usingSunoEmbedFallback = true;
      syncCapabilitiesForCurrentMode();
      audio.pause();
      setSunoEmbedAutoplay(true);
      return true;
    };

    if (!outputGain) {
      audio.volume = currentVolume;
    } else {
      audio.volume = 1;
    }

    return {
      provider: embed.provider,
      capabilities,
      analyser,
      audio, // Expose for setSinkId
      schoolId: null,
      loadPromise,
      getVolume: () => currentVolume,
      getByteFrequencyData: (array) => {
        if (analyser) {
          analyser.getByteFrequencyData(array);
        }
      },
      setVolume: (value) => {
        currentVolume = clamp01(value);
        if (destroyed) return;
        if (usingSunoEmbedFallback) {
          return;
        }
        if (outputGain) {
          outputGain.gain.value = currentVolume;
        } else {
          audio.volume = currentVolume;
        }
      },
      getSignalLevel: () => {
        if (usingSunoEmbedFallback) {
          return null;
        }
        if (analyser && analyserData && typeof analyser.getByteTimeDomainData === "function") {
          analyser.getByteTimeDomainData(analyserData);
          return getPercussivePulseLevelFromWaveform(analyserData, pulseState, getNowMs());
        }
        return null;
      },
      play: async () => {
        await loadPromise;
        if (destroyed) return;
        if (usingSunoEmbedFallback || directAudioFailed) {
          activateSunoEmbedFallback();
          return;
        }
        if (audioContext && (audioContext.state === "suspended" || audioContext.state === "interrupted")) {
          try {
            await audioContext.resume();
          } catch {
            // Context resume failed.
          }
        }
        try {
          const playAttempt = audio.play();
          if (playAttempt && typeof playAttempt.then === "function") {
            let playTimeoutId = null;
            try {
              await Promise.race([
                playAttempt,
                new Promise((_, reject) => {
                  playTimeoutId = setTimeout(
                    () => reject(new Error("Audio play timed out")),
                    12000
                  );
                }),
              ]);
            } finally {
              if (playTimeoutId !== null) {
                clearTimeout(playTimeoutId);
              }
            }
          }
          if (usingSunoEmbedFallback) {
            usingSunoEmbedFallback = false;
            syncCapabilitiesForCurrentMode();
            stopSunoEmbedFallback();
          }
        } catch (err) {
          directAudioFailed = true;
          if (activateSunoEmbedFallback()) {
            return;
          }
          console.warn("Audio playback failed (user gesture?):", err);
          throw new BytecodeError(
            ERROR_CATEGORIES.UI_STASIS, ERROR_SEVERITY.WARN, MOD,
            ERROR_CODES.INVALID_STATE,
            { reason: 'Audio playback blocked. Please interact with the page.' },
          );
        }
      },
      seek: (offset) => {
        if (destroyed || usingSunoEmbedFallback || !audio) return;
        try {
          audio.currentTime = Math.max(0, audio.currentTime + offset);
        } catch {
          // Ignore seek errors
        }
      },
      pause: async () => {
        if (destroyed) return;
        if (usingSunoEmbedFallback) {
          stopSunoEmbedFallback();
          return;
        }
        audio.pause();
      },
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        resolveLoad?.();
        audio.pause();
        stopSunoEmbedFallback();
        fallbackIframe?.remove();
        fallbackIframe = null;
        audio.removeEventListener("error", handleAudioError);
        audio.removeEventListener("canplaythrough", handleCanPlay);
        if (typeof onTrackEnded === "function") {
          audio.removeEventListener("ended", handleEnded);
        }
        if (loadTimeoutId !== null) {
          clearTimeout(loadTimeoutId);
          loadTimeoutId = null;
        }
        disconnectGraph();
        audio.removeAttribute("src");
        try {
          audio.load();
        } catch {
          // Ignore late teardown load errors.
        }
        audio.remove();
      },
    };
  }

  // Suno embed fallback when direct audio URL cannot be derived.
  if (embed.provider === "suno" && embed.src) {
    const iframe = document.createElement("iframe");
    iframe.allow = "autoplay";
    iframe.style.cssText = "width:0;height:0;border:0;position:absolute;pointer-events:none;";
    iframe.title = "Suno player";
    container.appendChild(iframe);

    let sunoVolume = clamp01(volume);

    const setAutoplaySrc = (enabled) => {
      try {
        const url = new URL(embed.src);
        if (enabled) {
          url.searchParams.set("autoplay", "1");
        } else {
          url.searchParams.delete("autoplay");
        }
        iframe.src = url.toString();
      } catch {
        iframe.src = embed.src;
      }
    };

    if (autoPlay) {
      setAutoplaySrc(true);
    } else {
      iframe.src = embed.src;
    }

    return {
      provider: embed.provider,
      capabilities: createProviderCapabilities({
        canAnalyze: false,
        canSetVolumeSmooth: false,
        supportsSeek: false,
      }),
      schoolId: null,
      loadPromise: Promise.resolve(),
      getVolume: () => sunoVolume,
      setVolume: (value) => {
        sunoVolume = clamp01(value);
      },
      getSignalLevel: () => null,
      play: async () => {
        setAutoplaySrc(true);
      },
      pause: async () => {
        iframe.src = "about:blank";
      },
      destroy: () => {
        iframe.remove();
      },
    };
  }

  // Fallback for unsupported embeds or other iframe providers
  // This iframe cannot be controlled by JS, so it's a passive display
  const iframe = document.createElement("iframe");
  iframe.src = embed.src;
  iframe.allow = "autoplay";
  iframe.style.cssText = "width:0;height:0;border:0;position:absolute;pointer-events:none;";
  iframe.title = "Ambient player";
  container.appendChild(iframe);
  
  return {
    provider: embed.provider,
    capabilities: createProviderCapabilities({
      canAnalyze: false,
      canSetVolumeSmooth: false,
      supportsSeek: false,
    }),
    schoolId: null, // Not directly associated with a school for control purposes
    getVolume: () => 0, // Cannot control iframe volume directly
    setVolume: () => {}, // No-op
    getSignalLevel: () => null, // Cannot get signal from iframe
    play: async () => {}, // Cannot control iframe directly
    pause: async () => {}, // Cannot control iframe directly
    destroy: () => iframe.remove(),
  };
}

function createAmbientPlayerService(options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const storage = getStorage(options.storage);
  let dynamicSchools = [];
  const persisted = readPersistedSettings(storage);
  const initialSchoolId = persisted.schoolId; // Default to null if not persisted
  const schoolConfig = getSchoolConfig(initialSchoolId);

  let state = {
    status: AMBIENT_PLAYER_STATES.IDLE,
    schoolId: initialSchoolId,
    queuedSchoolId: null,
    trackUrl: schoolConfig?.trackUrl || null,
    isPlaying: false,
    isLoading: false,
    volume: persisted.volume,
    autoplayAmbient: Boolean(persisted.autoplayAmbient),
    cyclingEnabled: Boolean(persisted.cyclingEnabled),
    sinkId: persisted.sinkId || "",
    outputDevices: [],
    audioUnlocked: false,
    error: null,
    // BPM tracking state
    bpm: BPM_TRACKING_CONFIG.defaultBPM,
    lastBeatMs: 0,
    beatIntervalMs: 667, // Default ~90 BPM
  };

  const listeners = new Set();
  let playableSchoolIds = [];
  let pendingTuneTimer = null;
  let pendingTuneSchoolId = null;
  let pendingTuneOperationId = null;
  let fadeOutPromise = Promise.resolve();
  let currentController = null;
  let currentTrackSchoolId = null;
  let container = options.container || null;
  let pendingTuneDurationMs = null;
  // Lazy-init AudioContext only after an explicit user gesture.
  const audioContextRef = { current: null };
  const dialLockUntilRef = { current: 0 };
  const controllerFactory = options.controllerFactory;
  const dialSfxPlayer = options.dialSfxPlayer || ((settings) => defaultDialSfxPlayer(audioContextRef, settings));
  const nowFn = options.nowFn || Date.now;
  const randomFn = typeof options.randomFn === "function" ? options.randomFn : Math.random;
  const lastResolvedTrackUrlBySchool = new Map();
  let hasPlayedDialSfx = false;
  let tuneOperationId = 0;
  let activeTuneOperationId = 0;
  let contextRecoveryListenersAttached = false;
  let deviceChangeListenersAttached = false;

  // ─── Internal helpers ──────────────────────────────────────────────────────

  function getSchoolConfig(schoolId) {
    const dynamic = dynamicSchools.find((s) => s.id === schoolId);
    if (dynamic) return dynamic;
    return getSchoolAudioConfig(schoolId);
  }

  async function updateOutputDevices() {
    if (!canUseBrowser() || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || (d.deviceId === "default" ? "System Default" : `Output ${d.deviceId.slice(0, 4)}...`),
        }));
      setState({ outputDevices: audioOutputs });
    } catch (err) {
      console.warn("Failed to enumerate audio devices:", err);
    }
  }

  async function applySinkId(sinkId, ctrl = currentController) {
    const context = audioContextRef.current;
    const success = { context: false, audio: false };

    if (context && typeof context.setSinkId === "function") {
      try {
        await context.setSinkId(sinkId);
        success.context = true;
      } catch (err) {
        console.warn("Failed to set sink ID on AudioContext:", err);
      }
    }

    // Also try applying to provided or current controller's audio element
    const audio = ctrl?.audio;
    if (audio && typeof audio.setSinkId === "function") {
      try {
        await audio.setSinkId(sinkId);
        success.audio = true;
      } catch (err) {
        console.warn("Failed to set sink ID on HTMLAudioElement:", err);
      }
    }
    
    return success.context || success.audio;
  }

  function handleDeviceChange() {
    void updateOutputDevices();
  }

  function attachDeviceListeners() {
    if (!canUseBrowser() || !navigator.mediaDevices || deviceChangeListenersAttached) {
      return;
    }
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    deviceChangeListenersAttached = true;
    void updateOutputDevices();
  }

  function detachDeviceListeners() {
    if (!canUseBrowser() || !navigator.mediaDevices || !deviceChangeListenersAttached) {
      return;
    }
    navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    deviceChangeListenersAttached = false;
  }

  function resolveTrackUrlForSchool(schoolId, fallbackTrackUrl = null) {
    if (!schoolId) return fallbackTrackUrl || null;
    
    // All schools now use the randomized station track pool
    const previousTrackUrl = lastResolvedTrackUrlBySchool.get(schoolId) || null;
    const randomizedTrackUrl = getRandomizedStationTrackUrl(schoolId, { excludeUrl: previousTrackUrl });
    const resolvedTrackUrl = randomizedTrackUrl || fallbackTrackUrl || null;
    
    if (resolvedTrackUrl) {
      lastResolvedTrackUrlBySchool.set(schoolId, resolvedTrackUrl);
    }
    return resolvedTrackUrl;
  }

  function handleTrackEnded(schoolId) {
    transition(AMBIENT_PLAYER_EVENTS.TRACK_ENDED);
    if (!schoolId) {
      return;
    }
    if (state.status !== AMBIENT_PLAYER_STATES.PLAYING) {
      return;
    }
    void setSchool(schoolId, {
      forceRetune: true,
      skipTuning: true,
      playDialSfx: false,
    });
  }

  function ensureAudioContext() {
    const current = audioContextRef.current;
    if (current && current.state !== "closed") {
      return current;
    }
    audioContextRef.current = createAudioContext(state.sinkId);
    return audioContextRef.current;
  }

  async function ensureContextRunning({ createIfMissing = true } = {}) {
    const context = createIfMissing ? ensureAudioContext() : audioContextRef.current;
    if (!context) {
      return false;
    }
    if (context.state === "closed") {
      return false;
    }
    if (context.state === "running") {
      return true;
    }
    if (typeof context.resume !== "function") {
      return false;
    }
    try {
      // Add a 3-second timeout to context resume to prevent indefinite hanging.
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Context resume timeout")), 3000)),
      ]);
    } catch (err) {
      console.warn("Failed to resume AudioContext:", err);
      return false;
    }
    return context.state === "running";
  }

  function handleUserInteraction() {
    void ensureContextRunning();
  }

  function attachContextRecoveryListeners() {
    if (!canUseBrowser() || contextRecoveryListenersAttached) {
      return;
    }
    CONTEXT_RECOVERY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleUserInteraction, { passive: true });
    });
    contextRecoveryListenersAttached = true;
  }

  function detachContextRecoveryListeners() {
    if (!canUseBrowser() || !contextRecoveryListenersAttached) {
      return;
    }
    CONTEXT_RECOVERY_EVENTS.forEach((eventName) => {
      window.removeEventListener(eventName, handleUserInteraction);
    });
    contextRecoveryListenersAttached = false;
  }

  function nextTuneOperationId() {
    tuneOperationId += 1;
    activeTuneOperationId = tuneOperationId;
    return activeTuneOperationId;
  }

  function isTuneOperationCurrent(id) {
    return Number.isFinite(id) && id === activeTuneOperationId;
  }

  function isTuneOperationActive(id) {
    return state.status === AMBIENT_PLAYER_STATES.TUNING && isTuneOperationCurrent(id);
  }

  function destroyController(ctrl) {
    if (!ctrl || typeof ctrl.destroy !== "function") {
      return;
    }
    try {
      ctrl.destroy();
    } catch (err) {
      console.warn("Failed to destroy track controller:", err);
    }
  }

  function getControllerCapabilities(ctrl = currentController) {
    if (!ctrl || typeof ctrl !== "object") {
      return DEFAULT_PROVIDER_CAPABILITIES;
    }
    return createProviderCapabilities(ctrl.capabilities || {});
  }

  function computeSyntheticSignalLevel() {
    const clock = nowFn() * 0.001;
    const lfo = 0.24 + Math.abs(Math.sin(clock * 2.7)) * 0.44;
    const shimmer = randomFn() * 0.22;
    return clamp01(lfo + shimmer);
  }

  function emitState() {
    const snapshot = getState();
    listeners.forEach((listener) => listener(snapshot));
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emitState();
  }

  function persistSettings() {
    if (!storage) return;
    const payload = {
      schoolId: state.schoolId,
      volume: state.volume,
      autoplayAmbient: state.autoplayAmbient,
      cyclingEnabled: state.cyclingEnabled,
      sinkId: state.sinkId,
    };
    try {
      storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage errors.
    }
  }

  function applySchoolSelection(schoolId) {
    const config = getSchoolConfig(schoolId);
    setState({
      schoolId,
      trackUrl: config?.trackUrl || null,
    });
  }

  function transition(event, payload = {}) {
    switch (event) {
      case AMBIENT_PLAYER_EVENTS.SELECT_SCHOOL: {
        const { schoolId, queued = false, tuneOperationId: opId = activeTuneOperationId } = payload;
        if (Number.isFinite(opId)) {
          activeTuneOperationId = opId;
        }
        applySchoolSelection(schoolId);
        if (queued) {
          setState({
            queuedSchoolId: schoolId,
            isLoading: true,
            error: null,
          });
          return;
        }
        pendingTuneSchoolId = schoolId;
        setState({
          status: AMBIENT_PLAYER_STATES.TUNING,
          isLoading: true,
          isPlaying: false,
          queuedSchoolId: null,
          error: null,
        });
        return;
      }
      case AMBIENT_PLAYER_EVENTS.TUNE_COMPLETE: {
        setState({
          status: AMBIENT_PLAYER_STATES.PLAYING,
          isLoading: false,
          isPlaying: true,
          queuedSchoolId: null,
          error: null,
        });
        return;
      }
      case AMBIENT_PLAYER_EVENTS.PLAY: {
        setState({
          status: AMBIENT_PLAYER_STATES.PLAYING,
          isPlaying: true,
          isLoading: false,
          error: null,
        });
        return;
      }
      case AMBIENT_PLAYER_EVENTS.PAUSE: {
        setState({
          status: AMBIENT_PLAYER_STATES.PAUSED,
          isPlaying: false,
          isLoading: false,
        });
        return;
      }
      case AMBIENT_PLAYER_EVENTS.TRACK_ENDED: {
        setState({ isPlaying: true });
        return;
      }
      case AMBIENT_PLAYER_EVENTS.ERROR: {
        setState({
          status: AMBIENT_PLAYER_STATES.ERROR,
          isPlaying: false,
          isLoading: false,
          error: payload.error || "Unable to play ambient track",
        });
        return;
      }
      default:
        return;
    }
  }

  function resolveTuneDurationMs() {
    const fixedDurationMs = Number(opts.tuningDurationMs);
    if (Number.isFinite(fixedDurationMs) && fixedDurationMs > 0) {
      return toPositiveMs(fixedDurationMs, DEFAULT_OPTIONS.tuningDurationMinMs);
    }

    const minMs = toPositiveMs(opts.tuningDurationMinMs, DEFAULT_OPTIONS.tuningDurationMinMs);
    const maxCandidate = toPositiveMs(opts.tuningDurationMaxMs, DEFAULT_OPTIONS.tuningDurationMaxMs);
    const maxMs = Math.max(minMs, maxCandidate);
    const randomValue = clamp01(randomFn());
    const nextDuration = minMs + (maxMs - minMs) * randomValue;
    return Math.round(nextDuration);
  }

  async function awaitWithTimeout(task, timeoutMs, timeoutMessage = "Operation timed out") {
    const safeTimeoutMs = toPositiveMs(timeoutMs, DEFAULT_OPTIONS.tuningCompletionTimeoutMs);
    let timeoutId = null;
    try {
      return await Promise.race([
        Promise.resolve(task),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), safeTimeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    }
  }

  function startTuneTimer(durationMs, id = activeTuneOperationId) {
    if (pendingTuneTimer) {
      clearTimeout(pendingTuneTimer);
      pendingTuneTimer = null;
    }
    const tuneMs = toPositiveMs(durationMs, DEFAULT_OPTIONS.tuningDurationMinMs);
    pendingTuneDurationMs = tuneMs;
    pendingTuneOperationId = id;
    pendingTuneTimer = setTimeout(async () => {
      try {
        await awaitWithTimeout(
          completeTuning(id),
          opts.tuningCompletionTimeoutMs,
          "Tuning timed out"
        );
      } catch (error) {
        if (isTuneOperationCurrent(id)) {
          clearTuneTimer();
          nextTuneOperationId();
          transition(AMBIENT_PLAYER_EVENTS.ERROR, {
            error: error?.message || "Failed to complete tuning",
          });
        }
      }
    }, tuneMs);
  }

  function clearTuneTimer() {
    if (pendingTuneTimer) {
      clearTimeout(pendingTuneTimer);
      pendingTuneTimer = null;
    }
    pendingTuneSchoolId = null;
    pendingTuneOperationId = null;
    pendingTuneDurationMs = null;
    if (state.queuedSchoolId || state.isLoading) {
      setState({ queuedSchoolId: null, isLoading: false });
    }
  }

  function playDialSfx(durationMs) {
    if (hasPlayedDialSfx) {
      return;
    }
    hasPlayedDialSfx = true;
    dialSfxPlayer({
      lockUntilRef: dialLockUntilRef,
      lockMs: opts.dialLockMs,
      nowFn,
      durationMs,
    });
  }

  function computeSignalLevel() {
    if (state.status === AMBIENT_PLAYER_STATES.TUNING) {
      const clock = nowFn() * 0.001;
      const wobble = Math.abs(Math.sin(clock * 7.4)) * 0.32;
      const staticBurst = randomFn() * 0.45;
      return clamp01(0.22 + wobble + staticBurst);
    }

    if (!state.isPlaying) {
      return 0;
    }

    const capabilities = getControllerCapabilities();
    const sampledLevel = currentController?.getSignalLevel?.();
    if (capabilities.canAnalyze && Number.isFinite(sampledLevel)) {
      return clamp01(sampledLevel);
    }

    return computeSyntheticSignalLevel();
  }

  /**
   * Updates BPM tracking based on percussive pulse detection.
   * Uses exponential moving average for smooth tempo transitions.
   */
  function updateBPM(pulseLevel, nowMs) {
    if (!state.isPlaying || !Number.isFinite(pulseLevel) || pulseLevel < 0.3) {
      // No valid beat data — maintain default BPM
      return;
    }

    const previousBeatMs = state.lastBeatMs;
    const previousInterval = state.beatIntervalMs;
    const currentInterval = nowMs - previousBeatMs;

    // Validate interval is within reasonable BPM range (60-180 BPM = 1000-333ms)
    const isValidInterval = currentInterval >= 333 && currentInterval <= 1000;

    if (isValidInterval && previousBeatMs > 0) {
      // Smooth the interval with EMA
      const smoothedInterval = previousInterval * (1 - BPM_TRACKING_CONFIG.smoothingAlpha) +
                               currentInterval * BPM_TRACKING_CONFIG.smoothingAlpha;

      // Convert interval to BPM
      const detectedBPM = 60000 / smoothedInterval;
      const clampedBPM = Math.max(BPM_TRACKING_CONFIG.minBPM,
                          Math.min(BPM_TRACKING_CONFIG.maxBPM, detectedBPM));

      // Update state
      state.beatIntervalMs = smoothedInterval;
      state.bpm = clampedBPM;
    }

    state.lastBeatMs = nowMs;
  }

  /**
   * Returns the current detected BPM.
   * Falls back to default BPM when no audio is playing.
   */
  function getBPM() {
    if (!state.isPlaying) {
      return BPM_TRACKING_CONFIG.defaultBPM;
    }
    return state.bpm || BPM_TRACKING_CONFIG.defaultBPM;
  }

  async function completeTuning(id = activeTuneOperationId) {
    if (!isTuneOperationCurrent(id)) {
      // Stale operation — if we're stuck in TUNING with no pending timer,
      // recover by forcing an error transition so the user isn't locked out.
      if (state.status === AMBIENT_PLAYER_STATES.TUNING && !pendingTuneTimer) {
        transition(AMBIENT_PLAYER_EVENTS.ERROR, {
          error: "Tuning interrupted — tap play to retry",
        });
      }
      return;
    }

    if (pendingTuneOperationId === id) {
      if (pendingTuneTimer) {
        clearTimeout(pendingTuneTimer);
      }
      pendingTuneTimer = null;
      pendingTuneDurationMs = null;
      pendingTuneOperationId = null;
    }

    const targetSchoolId = state.queuedSchoolId || pendingTuneSchoolId || state.schoolId;
    if (!targetSchoolId) {
      if (isTuneOperationCurrent(id)) {
        transition(AMBIENT_PLAYER_EVENTS.ERROR, { error: "No school selected for tuning" });
      }
      return;
    }

    if (!isTuneOperationActive(id)) {
      return;
    }

    const targetConfig = getSchoolConfig(targetSchoolId);
    const targetTrackUrl = resolveTrackUrlForSchool(targetSchoolId, targetConfig?.trackUrl || null);
    if (!targetTrackUrl) {
      if (isTuneOperationCurrent(id)) {
        transition(AMBIENT_PLAYER_EVENTS.ERROR, { error: "Selected school has no track" });
      }
      return;
    }

    // Add 5s timeout to fadeOutPromise to prevent hanging on a ghost track
    try {
      await Promise.race([
        fadeOutPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Fade out timeout")), 5000)),
      ]);
    } catch (err) {
      console.warn("completeTuning: fadeOutPromise timed out or failed", err);
    }

    if (!isTuneOperationActive(id)) {
      return;
    }

    const isAlreadyLoaded =
      currentController &&
      currentTrackSchoolId === targetSchoolId &&
      currentController.trackUrl === targetTrackUrl;
    if (!isAlreadyLoaded) {
      await fadeOutCurrentTrackIfNeeded();

      if (!isTuneOperationActive(id)) {
        return;
      }

      const didLoadTrack = await loadSchoolTrack(targetSchoolId, targetTrackUrl, id);
      if (!didLoadTrack || !isTuneOperationActive(id)) {
        return;
      }
    } else {
      try {
        await currentController.play();
      } catch (err) {
        console.warn("Failed to play existing controller:", err);
      }
      if (!isTuneOperationActive(id)) {
        return;
      }
    }

    if (isTuneOperationActive(id)) {
      pendingTuneSchoolId = null;
      transition(AMBIENT_PLAYER_EVENTS.TUNE_COMPLETE);
    }
  }

  async function fadeOutCurrentTrackIfNeeded() {
    if (!currentController) return;
    const ctrl = currentController;

    try {
      await Promise.race([
        fadeControllerVolume(ctrl, 0, opts.fadeOutMs),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Fade out timeout")), opts.fadeOutMs + 1000)
        ),
      ]);
    } catch (err) {
      console.warn("fadeOutCurrentTrackIfNeeded: fade failed", err);
    }

    try {
      await ctrl.pause();
    } catch (err) {
      console.warn("Error pausing controller during fade out:", err);
    }

    destroyController(ctrl);
    if (currentController === ctrl) {
      currentController = null;
      currentTrackSchoolId = null;
    }
  }

  async function loadSchoolTrack(schoolId, trackUrl, id = activeTuneOperationId) {
    if (!controllerFactory) {
      if (!container || !container.isConnected) {
        throw new BytecodeError(
          ERROR_CATEGORIES.STATE, ERROR_SEVERITY.WARN, MOD,
          ERROR_CODES.INVALID_STATE,
          { reason: 'Ambient container is not mounted' },
        );
      }
    }

    const audioContext = ensureAudioContext();

    const ctrl = controllerFactory
      ? await controllerFactory({
          schoolId,
          container,
          trackUrl,
          volume: 0,
          autoPlay: true,
          onTrackEnded: () => handleTrackEnded(schoolId),
          audioContext,
        })
      : await createTrackController({
          container,
          trackUrl,
          volume: 0,
          autoPlay: true,
          onTrackEnded: () => handleTrackEnded(schoolId),
          audioContext,
        });

    if (!isTuneOperationActive(id)) {
      destroyController(ctrl);
      return false;
    }

    // Apply currently selected hardware output
    if (state.sinkId) {
      await applySinkId(state.sinkId, ctrl);
    }

    ctrl.schoolId = schoolId;
    ctrl.trackUrl = trackUrl;
    ctrl.setVolume(0);
    currentController = ctrl;
    currentTrackSchoolId = schoolId;
    setState({ trackUrl });

    if (ctrl.loadPromise) {
      await ctrl.loadPromise;
    }

    if (!isTuneOperationActive(id)) {
      if (currentController === ctrl) {
        currentController = null;
        currentTrackSchoolId = null;
      }
      destroyController(ctrl);
      return false;
    }

    try {
      await ctrl.play();
      if (!isTuneOperationActive(id)) {
        if (currentController === ctrl) {
          currentController = null;
          currentTrackSchoolId = null;
        }
        destroyController(ctrl);
        return false;
      }
      await fadeControllerVolume(ctrl, state.volume, opts.fadeInMs);
      if (!isTuneOperationActive(id)) {
        if (currentController === ctrl) {
          currentController = null;
          currentTrackSchoolId = null;
        }
        destroyController(ctrl);
        return false;
      }
      return true;
    } catch (err) {
      if (currentController === ctrl) {
        currentController = null;
        currentTrackSchoolId = null;
      }
      destroyController(ctrl);
      console.error("Failed to play track after loading:", err);
      throw err;
    }
  }

  function fadeControllerVolume(ctrl, targetVolume, durationMs) {
    const target = clamp01(targetVolume);
    if (!ctrl || durationMs <= 0) {
      ctrl?.setVolume(target);
      return Promise.resolve();
    }

    const capabilities = getControllerCapabilities(ctrl);
    if (!capabilities.canSetVolumeSmooth) {
      ctrl.setVolume(target);
      return Promise.resolve();
    }

    const from = clamp01(ctrl.getVolume ? ctrl.getVolume() : state.volume);
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? () => performance.now() // EXEMPT
        : () => Date.now(); // EXEMPT
    const frame =
      typeof requestAnimationFrame === "function"
        ? (cb) => requestAnimationFrame(cb)
        : (cb) => setTimeout(() => cb(now()), 16);
    const startAt = now();

    return new Promise((resolve) => {
      const tick = (timestamp) => {
        const elapsed = timestamp - startAt;
        const progress = Math.min(1, elapsed / durationMs);
        const nextVolume = from + (target - from) * progress;
        ctrl.setVolume(nextVolume);
        if (progress < 1) {
          frame(tick);
        } else {
          resolve();
        }
      };
      frame(tick);
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    listeners.add(listener);
    listener(getState());
    return () => {
      listeners.delete(listener);
    };
  }

  function getState() {
    return { ...state };
  }

  function setContainer(cont) {
    if (cont instanceof Element) {
      container = cont;
    } else if (cont === null || cont === undefined) {
      container = null;
    }
  }

  function getSignalLevel() {
    return computeSignalLevel();
  }

  let lockedDetectedSchool = null;

  /**
   * Performs real-time spectral analysis to detect the dominant school.
   * Locks the first clear detection per play session.
   */
  async function getDetectedSchoolId() {
    // If already locked for this session, stay locked
    if (lockedDetectedSchool) return lockedDetectedSchool;

    if (!currentController?.analyser) return null;
    
    const audioContext = audioContextRef.current;
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (e) {
        // Ignore resume errors during analysis
      }
    }
    
    const bufferLength = currentController.analyser.frequencyBinCount;
    const data = new Uint8Array(bufferLength);
    currentController.analyser.getByteFrequencyData(data);

    const schoolEnergy = { VOID: 0, SONIC: 0, WILL: 0, ALCHEMY: 0, PSYCHIC: 0 };
    const schoolBins = { VOID: 0, SONIC: 0, WILL: 0, ALCHEMY: 0, PSYCHIC: 0 };

    for (let i = 0; i < bufferLength; i++) {
      const v = data[i] / 255.0;
      const freq = (i * 22050) / bufferLength;

      // SPEC V1.8: Pink-Noise Compensated Weighting (Tilt)
      // We multiply higher frequencies to account for natural 1/f energy decay
      let weight = 1.0;
      let band = null;

      if (freq >= 20 && freq < 150) { 
        band = 'VOID'; 
        weight = 1.0; 
      } else if (freq >= 150 && freq < 500) { 
        band = 'SONIC'; 
        weight = 1.4; // Mid-range compensation
      } else if (freq >= 500 && freq < 2000) { 
        band = 'WILL'; 
        weight = 2.2; 
      } else if (freq >= 2000 && freq < 6500) { 
        band = 'ALCHEMY'; 
        weight = 3.5; 
      } else if (freq >= 6500) { 
        band = 'PSYCHIC'; 
        weight = 5.0; // Heavy tilt for high-frequency air
      }

      if (band) {
        schoolEnergy[band] += v * weight;
        schoolBins[band] += 1;
      }
    }

    const averages = {};
    let totalAvg = 0;
    let maxAvg = 0;
    let winner = null;
    
    Object.entries(schoolEnergy).forEach(([key, energy]) => {
      const avg = energy / (schoolBins[key] || 1);
      averages[key] = avg;
      totalAvg += avg;
      if (avg > maxAvg) {
        maxAvg = avg;
        winner = key;
      }
    });

    // RELATIVE DOMINANCE CHECK (Spec v1.8)
    // A school wins if its average energy is significantly higher than the mean of other bands
    const otherAvg = (totalAvg - maxAvg) / 4;
    
    if (winner && maxAvg > otherAvg * 1.8 && maxAvg > 0.05) {
      lockedDetectedSchool = winner;
      return winner;
    }
    
    return null;
  }

  function getAnalyser() {
    return currentController?.analyser || null;
  }

  function getByteFrequencyData(array) {
    if (currentController && currentController.getByteFrequencyData) {
      currentController.getByteFrequencyData(array);
    } else if (currentController?.analyser) {
      currentController.analyser.getByteFrequencyData(array);
    }
  }

  function setDynamicSchools(schools = []) {
    dynamicSchools = Array.isArray(schools) ? schools : [];
    emitState();
  }

  function setPlayableSchools(ids = []) {
    playableSchoolIds = Array.isArray(ids) ? [...ids] : [];

    if (playableSchoolIds.length === 0) {
      clearTuneTimer();
      nextTuneOperationId();
      if (state.schoolId !== null) {
        setState({ schoolId: null, trackUrl: null });
        persistSettings();
      }
      if (currentController) {
        destroyController(currentController);
        currentController = null;
        currentTrackSchoolId = null;
      }
      return;
    }

    if (!state.schoolId || !playableSchoolIds.includes(state.schoolId)) {
      const fallbackSchoolId = getDefaultSchoolId(playableSchoolIds);
      applySchoolSelection(fallbackSchoolId);
      persistSettings();
    }
  }

  async function unlockAudio() {
    try {
      await ensureContextRunning();
      if (state.sinkId) {
        await applySinkId(state.sinkId);
      }
    } catch (err) {
      console.warn("unlockAudio: ensureContextRunning failed", err);
    }

    if (state.audioUnlocked) return true;

    const silentAudio = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
    );
    try {
      const playPromise = silentAudio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch {
      // Ignore sync errors.
    }

    setState({ audioUnlocked: true });
    if (
      state.autoplayAmbient &&
      state.status === AMBIENT_PLAYER_STATES.IDLE &&
      state.schoolId
    ) {
      // Don't await here to prevent potential mount-time blocking
      void play();
    }
    return true;
  }

  async function setSchool(schoolId, schoolOptions = {}) {
    if (!schoolId || !playableSchoolIds.includes(schoolId)) {
      transition(AMBIENT_PLAYER_EVENTS.ERROR, { error: "School is not playable" });
      return false;
    }

    await unlockAudio();

    const opId = nextTuneOperationId();

    if (state.status === AMBIENT_PLAYER_STATES.TUNING) {
      transition(AMBIENT_PLAYER_EVENTS.SELECT_SCHOOL, {
        schoolId,
        queued: true,
        tuneOperationId: opId,
      });
      const queuedTuneDurationMs = pendingTuneDurationMs || resolveTuneDurationMs();
      pendingTuneDurationMs = queuedTuneDurationMs;
      startTuneTimer(queuedTuneDurationMs, opId);
      return true;
    }

    const isSameTrackActive = currentController && currentTrackSchoolId === schoolId;
    const forceRetune = Boolean(schoolOptions.forceRetune);
    const skipTuning = Boolean(schoolOptions.skipTuning);
    const shouldPlayDialSfx = schoolOptions.playDialSfx !== false;

    transition(AMBIENT_PLAYER_EVENTS.SELECT_SCHOOL, {
      schoolId,
      queued: false,
      tuneOperationId: opId,
    });
    if (skipTuning) {
      pendingTuneDurationMs = null;
      if (shouldPlayDialSfx) {
        playDialSfx(420);
      }
    } else {
      const tuneDurationMs = resolveTuneDurationMs();
      pendingTuneDurationMs = tuneDurationMs;
      startTuneTimer(tuneDurationMs, opId);
      if (shouldPlayDialSfx) {
        playDialSfx(tuneDurationMs);
      }
    }

    if (!isSameTrackActive || forceRetune) {
      fadeOutPromise = fadeOutCurrentTrackIfNeeded();
    } else {
      fadeOutPromise = Promise.resolve();
    }

    persistSettings();
    if (skipTuning) {
      try {
        await awaitWithTimeout(
          completeTuning(opId),
          opts.tuningCompletionTimeoutMs,
          "Tuning timed out"
        );
      } catch (err) {
        if (isTuneOperationCurrent(opId)) {
          transition(AMBIENT_PLAYER_EVENTS.ERROR, {
            error: err?.message || "Failed to complete tuning",
          });
        }
        return false;
      }
    }
    return true;
  }

  async function cycleSchool(direction = 1) {
    if (playableSchoolIds.length === 0) return false;
    if (!state.cyclingEnabled) {
      return await setSchool(state.schoolId || playableSchoolIds[0], { forceRetune: true });
    }
    const currentSchoolId = state.schoolId || playableSchoolIds[0];
    const currentIndex = playableSchoolIds.indexOf(currentSchoolId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + playableSchoolIds.length) % playableSchoolIds.length;
    const nextSchoolId = playableSchoolIds[nextIndex];
    return await setSchool(nextSchoolId);
  }

  async function play() {
    await unlockAudio();

    if (state.status === AMBIENT_PLAYER_STATES.TUNING) {
      // If already tuning, just let it finish.
      // Only interrupt if something is clearly wrong or we want to force re-tuning.
      if (!pendingTuneTimer) {
        clearTuneTimer();
        nextTuneOperationId();
        transition(AMBIENT_PLAYER_EVENTS.PAUSE);
      } else {
        return;
      }
    }

    if (currentController) {
      try {
        await currentController.play();
        transition(AMBIENT_PLAYER_EVENTS.PLAY);
        return;
      } catch (err) {
        console.warn("Failed to play existing controller, will re-tune:", err);
      }
    }

    const schoolId = state.schoolId || getDefaultSchoolId(playableSchoolIds);
    if (!schoolId) return;

    // Always start a fresh tuning if we don't have a working controller
    await setSchool(schoolId, { forceRetune: true, skipTuning: true, playDialSfx: true });
  }

  async function pause() {
    clearTuneTimer();
    nextTuneOperationId(); // Invalidate any pending tuning operations
    lockedDetectedSchool = null; // Reset fingerprint lock on pause
    if (currentController) {
      try {
        await currentController.pause();
      } catch (err) {
        console.warn("Error pausing controller:", err);
      }
    }
    transition(AMBIENT_PLAYER_EVENTS.PAUSE);
  }

  async function togglePlayPause() {
    if (state.status === AMBIENT_PLAYER_STATES.PLAYING) {
      await pause();
      return;
    }
    // If we are tuning, a toggle should act as a "stop tuning" / pause.
    if (state.status === AMBIENT_PLAYER_STATES.TUNING) {
      await pause();
      return;
    }
    await play();
  }

  function setVolume(volume) {
    const clamped = clamp01(volume);
    setState({ volume: clamped });
    if (currentController) {
      currentController.setVolume(clamped);
    }
    persistSettings();
  }

  function setAutoplayAmbient(enabled) {
    const nextValue = Boolean(enabled);
    setState({ autoplayAmbient: nextValue });
    persistSettings();
    if (
      nextValue &&
      state.audioUnlocked &&
      state.status === AMBIENT_PLAYER_STATES.IDLE &&
      state.schoolId
    ) {
      play();
    }
  }

  function toggleAutoplayAmbient() {
    setAutoplayAmbient(!state.autoplayAmbient);
  }

  function setCyclingEnabled(enabled) {
    setState({ cyclingEnabled: Boolean(enabled) });
    persistSettings();
  }

  function toggleCyclingEnabled() {
    setCyclingEnabled(!state.cyclingEnabled);
  }

  async function setOutputDevice(deviceId) {
    const nextSinkId = deviceId || "";
    setState({ sinkId: nextSinkId });
    persistSettings();
    await applySinkId(nextSinkId);
  }

  function seek(offset) {
    if (currentController && typeof currentController.seek === "function") {
      currentController.seek(offset);
    }
  }

  function destroy() {
    clearTuneTimer();
    if (currentController) {
      destroyController(currentController);
      currentController = null;
      currentTrackSchoolId = null;
    }
    container = null;
    detachContextRecoveryListeners();
    detachDeviceListeners();
    pendingTuneOperationId = null;
    nextTuneOperationId();
    const context = audioContextRef.current;
    if (context && typeof context.close === "function" && context.state !== "closed") {
      context.close().catch(() => {});
    }
    audioContextRef.current = null;
    listeners.clear();
  }

  // Initialize
  attachContextRecoveryListeners();
  attachDeviceListeners();

  return {
    subscribe,
    getState,
    setContainer,
    getSignalLevel,
    getBPM,
    updateBPM,
    setDynamicSchools,
    setPlayableSchools,
    unlockAudio,
    setSchool,
    cycleSchool,
    play,
    pause,
    togglePlayPause,
    seek,
    setVolume,
    setAutoplayAmbient,
    toggleAutoplayAmbient,
    setCyclingEnabled,
    toggleCyclingEnabled,
    setOutputDevice,
    updateOutputDevices,
    destroy,
    ensureContextRunning,
    getAnalyser,
    getByteFrequencyData,
    getDetectedSchoolId,
  };
}

// Compatibility shim: `new AmbientPlayerService(options)` still works because
// a constructor that returns a non-null object overrides the `new` expression result.
export function AmbientPlayerService(options = {}) {
  return createAmbientPlayerService(options);
}

let ambientPlayerServiceInstance = null;

export function getAmbientPlayerService() {
  if (!ambientPlayerServiceInstance) {
    ambientPlayerServiceInstance = createAmbientPlayerService();
  }
  return ambientPlayerServiceInstance;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (ambientPlayerServiceInstance) {
      ambientPlayerServiceInstance.destroy();
      ambientPlayerServiceInstance = null;
    }
  });
}

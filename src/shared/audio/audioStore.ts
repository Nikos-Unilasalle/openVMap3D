/**
 * Web Audio API manager for OpenVMap3D — manages AudioContext, media element players,
 * FFT spectrum analysers, synth oscillators, filters, and microphone streams.
 */

import { createNodeCache } from "../graph/nodeCaches";

let globalAudioCtx: AudioContext | null = null;
let gestureListenerInstalled = false;

/** Players that want to play but whose AudioContext is (or was) suspended. Retried on the first user gesture, when the autoplay policy is relaxed. */
const pendingPlayers = new Set<PlayerState>();

function ensureAudioUnblocked(): void {
  if (!globalAudioCtx) return;
  if (globalAudioCtx.state === "running") return;
  globalAudioCtx.resume().catch(() => {});
}

/**
 * Web Audio starts suspended until a user gesture (the autoplay policy). The
 * context may first be created — and resume() attempted — before any gesture,
 * at which point the browser refuses. Install a one-shot gesture listener so
 * the first real pointer/keyboard interaction retries: resume the context and
 * then kick off every player that wanted to play but was parked while
 * suspended. Without this, audio stays silent in stricter environments (the
 * Tauri WKWebView) until a node happens to be re-evaluated after a click.
 *
 * The plays are kicked off *synchronously* inside the gesture handler (not
 * after awaiting resume()): WKWebView only treats a play() as user-gesture
 * approved when it runs within the gesture's own call stack.
 */
function installFirstGestureResume(): void {
  if (gestureListenerInstalled || typeof window === "undefined") return;
  gestureListenerInstalled = true;
  const wake = () => {
    ensureAudioUnblocked();
    for (const p of pendingPlayers) {
      p.audioEl.play().catch(() => {});
    }
    pendingPlayers.clear();
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
    window.removeEventListener("mousedown", wake);
    window.removeEventListener("touchstart", wake);
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
  window.addEventListener("mousedown", wake);
  window.addEventListener("touchstart", wake);
}

/** Stop a media-element player and drop any pending retry for it. */
export function requestPause(player: PlayerState): void {
  pendingPlayers.delete(player);
  player.audioEl.pause();
}

/**
 * Start a media-element player. If the AudioContext is running this just plays;
 * if it is suspended (autoplay policy, before any gesture) the context is
 * resumed and the play parked so it can be retried on the first real user
 * gesture. Attempts play immediately either way — the resume makes the sound
 * start as soon as the policy allows instead of waiting for a later gesture.
 */
export function requestPlay(player: PlayerState): void {
  const ctx = globalAudioCtx;
  if (ctx) {
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
      pendingPlayers.add(player);
    }
    player.audioEl.play().catch(() => {});
  } else {
    player.audioEl.play().catch(() => {});
  }
}

/**
 * The single bus every sound-producing node connects to instead of
 * `ctx.destination`. It feeds the speakers as before, and — once
 * `getAudioExportStream()` has been called — a MediaStreamDestination as well,
 * which is what lets the video export carry an audio track. Connecting nodes
 * straight to `destination` made the audio physically unreachable from
 * MediaRecorder: exported files were silent no matter what the graph played.
 */
let outputBus: GainNode | null = null;
let exportDestination: MediaStreamAudioDestinationNode | null = null;

export function getAudioOutput(): AudioNode | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (!outputBus) {
    outputBus = ctx.createGain();
    outputBus.gain.value = 1;
    outputBus.connect(ctx.destination);
    if (exportDestination) outputBus.connect(exportDestination);
  }
  return outputBus;
}

/**
 * A live MediaStream carrying everything the graph is playing, for the video
 * export to merge into its recording. Created on first use and kept — a
 * MediaStreamDestination is cheap and tearing it down mid-session would drop
 * the tap for any export that follows.
 */
export function getAudioExportStream(): MediaStream | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const bus = getAudioOutput();
  if (!bus) return null;
  if (!exportDestination) {
    exportDestination = ctx.createMediaStreamDestination();
    bus.connect(exportDestination);
  }
  return exportDestination.stream;
}

export function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!globalAudioCtx) {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
    }
  }
  installFirstGestureResume();
  ensureAudioUnblocked();
  return globalAudioCtx;
}

export interface PlayerState {
  audioEl: HTMLAudioElement;
  sourceNode?: MediaElementAudioSourceNode;
  gainNode?: GainNode;
  loadedPath?: string;
  isPlaying: boolean;
  /** Last value of the Trigger input — used to detect the rising edge (one-shot start). */
  lastTrigger?: boolean;
  /** A trigger-driven playback is running to completion: the trigger can't re-fire and the Play input is ignored until the sound ends. */
  triggerLocked?: boolean;
}

const playerCache = createNodeCache<PlayerState>((state) => {
  if (state.loadedPath) {
    try {
      URL.revokeObjectURL(state.loadedPath);
    } catch {}
  }
  try {
    state.audioEl.pause();
    state.audioEl.src = "";
  } catch {}
  state.sourceNode?.disconnect();
  state.gainNode?.disconnect();
});

export function getOrCreatePlayer(nodeId: string): PlayerState {
  const existing = playerCache.get(nodeId);
  if (existing) return existing;

  const audioEl: HTMLAudioElement =
    typeof Audio !== "undefined"
      ? new Audio()
      : ({
          crossOrigin: "anonymous",
          loop: false,
          volume: 1,
          playbackRate: 1,
          duration: 0,
          currentTime: 0,
          paused: true,
          src: "",
          play: () => Promise.resolve(),
          pause: () => {},
        } as unknown as HTMLAudioElement);

  audioEl.crossOrigin = "anonymous";

  // Some WebViews won't start an <audio> element (even through a Web Audio
  // MediaElementSource) until it is actually in the document — a detached
  // `new Audio()` can sit silently forever. Attach it hidden.
  if (typeof document !== "undefined" && document.body) {
    audioEl.style.display = "none";
    audioEl.setAttribute("hidden", "");
    audioEl.muted = false;
    document.body.appendChild(audioEl);
  }

  const state: PlayerState = {
    audioEl,
    isPlaying: false,
  };

  const ctx = getAudioContext();
  if (ctx) {
    try {
      const sourceNode = ctx.createMediaElementSource(audioEl);
      const gainNode = ctx.createGain();
      sourceNode.connect(gainNode);
      gainNode.connect(getAudioOutput() ?? ctx.destination);
      state.sourceNode = sourceNode;
      state.gainNode = gainNode;
    } catch {
      // Audio element source might already be connected or non-standard
    }
  }

  playerCache.set(nodeId, state);
  return state;
}

export interface AnalyserState {
  analyser: AnalyserNode;
  dataArray: Uint8Array;
}

const analyserCache = createNodeCache<AnalyserState>((state) => {
  try {
    state.analyser.disconnect();
  } catch {}
});

export function getOrCreateAnalyser(nodeId: string, fftSize = 128): AnalyserState | null {
  const ctx = getAudioContext();
  if (!ctx) return null;

  let state = analyserCache.get(nodeId);
  if (state && state.analyser.fftSize !== fftSize) {
    try {
      state.analyser.disconnect();
    } catch {}
    state = undefined;
  }
  if (!state) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.8;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    state = { analyser, dataArray };
    analyserCache.set(nodeId, state);
  }
  return state;
}

export interface MicState {
  stream?: MediaStream;
  sourceNode?: MediaStreamAudioSourceNode;
  gainNode?: GainNode;
}

const micCache = createNodeCache<MicState>((state) => {
  try {
    state.sourceNode?.disconnect();
  } catch {}
  try {
    state.gainNode?.disconnect();
  } catch {}
  if (state.stream) state.stream.getTracks().forEach((track) => track.stop());
});

export function getOrCreateMic(nodeId: string): MicState {
  let existing = micCache.get(nodeId);
  if (!existing) {
    existing = {};
    micCache.set(nodeId, existing);
  }
  return existing;
}

export function enableMicrophone(nodeId: string): Promise<MicState> {
  const state = getOrCreateMic(nodeId);
  if (state.stream) return Promise.resolve(state);

  const ctx = getAudioContext();
  if (!ctx || !navigator?.mediaDevices?.getUserMedia) return Promise.resolve(state);

  return navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      state.stream = stream;
      state.sourceNode = ctx.createMediaStreamSource(stream);
      state.gainNode = ctx.createGain();
      state.sourceNode.connect(state.gainNode);
      return state;
    })
    .catch((err) => {
      console.warn("Microphone access denied or error:", err);
      return state;
    });
}

export interface SynthState {
  osc?: OscillatorNode;
  gainNode?: GainNode;
  isPlaying: boolean;
}

const synthCache = createNodeCache<SynthState>((state) => {
  try {
    state.osc?.stop();
  } catch {}
  try {
    state.osc?.disconnect();
  } catch {}
  try {
    state.gainNode?.disconnect();
  } catch {}
  state.osc = undefined;
  state.isPlaying = false;
});

export function getOrCreateSynth(nodeId: string): SynthState {
  let existing = synthCache.get(nodeId);
  if (!existing) {
    existing = { isPlaying: false };
    synthCache.set(nodeId, existing);
  }
  return existing;
}

export interface PeakState {
  lastValue: number;
  envelope: number;
  isBeat: boolean;
}

const peakCache = createNodeCache<PeakState>();

export function getOrCreatePeakDetector(nodeId: string): PeakState {
  let existing = peakCache.get(nodeId);
  if (!existing) {
    existing = { lastValue: 0, envelope: 0, isBeat: false };
    peakCache.set(nodeId, existing);
  }
  return existing;
}

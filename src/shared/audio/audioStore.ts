/**
 * Web Audio API manager for OpenVMap3D — manages AudioContext, media element players,
 * FFT spectrum analysers, synth oscillators, filters, and microphone streams.
 */

let globalAudioCtx: AudioContext | null = null;

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
  if (globalAudioCtx && globalAudioCtx.state === "suspended") {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export interface PlayerState {
  audioEl: HTMLAudioElement;
  sourceNode?: MediaElementAudioSourceNode;
  gainNode?: GainNode;
  loadedPath?: string;
  isPlaying: boolean;
}

const playerCache = new Map<string, PlayerState>();

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
      gainNode.connect(ctx.destination);
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

const analyserCache = new Map<string, AnalyserState>();

export function getOrCreateAnalyser(nodeId: string, fftSize = 128): AnalyserState | null {
  const ctx = getAudioContext();
  if (!ctx) return null;

  let state = analyserCache.get(nodeId);
  if (!state || state.analyser.fftSize !== fftSize) {
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

const micCache = new Map<string, MicState>();

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

const synthCache = new Map<string, SynthState>();

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

const peakCache = new Map<string, PeakState>();

export function getOrCreatePeakDetector(nodeId: string): PeakState {
  let existing = peakCache.get(nodeId);
  if (!existing) {
    existing = { lastValue: 0, envelope: 0, isBeat: false };
    peakCache.set(nodeId, existing);
  }
  return existing;
}

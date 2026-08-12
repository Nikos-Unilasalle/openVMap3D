import {
  enableMicrophone,
  getAudioContext,
  getOrCreateAnalyser,
  getOrCreateMic,
  getOrCreatePeakDetector,
  getOrCreatePlayer,
  getOrCreateSynth,
} from "../../audio/audioStore";
import { NodeDefinition } from "../types";

/** Audio Player node — loads and plays local audio files (.mp3, .wav, .ogg) with playback controls. */
export const AUDIO_PLAYER_NODE: NodeDefinition = {
  type: "sound/player",
  label: "Audio Player",
  category: "sound",
  inputs: [
    { id: "play", label: "Play", type: "value" },
    { id: "volume", label: "Volume", type: "value" },
    { id: "playbackRate", label: "Speed", type: "value" },
    { id: "seek", label: "Seek (s)", type: "value" },
  ],
  outputs: [
    { id: "audio", label: "Audio", type: "any" },
    { id: "volume", label: "Volume", type: "value" },
    { id: "duration", label: "Duration", type: "value" },
    { id: "position", label: "Position", type: "value" },
  ],
  defaultParams: { filePath: "", loop: 1, volume: 1, playbackRate: 1 },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "Audio File",
      kind: "file",
      accept: [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"],
      onLoaded: (nodeId, _path, content) => {
        const player = getOrCreatePlayer(nodeId);
        const blob = new Blob([content], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        player.audioEl.src = url;
        player.loadedPath = url;
      },
    },
    { id: "loop", label: "Loop", kind: "boolean" },
    { id: "volume", label: "Volume", kind: "number", step: 0.05 },
    { id: "playbackRate", label: "Speed", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params, ctx) => {
    const player = getOrCreatePlayer(ctx.nodeId);
    const audioEl = player.audioEl;

    const playInput = inputs.play !== undefined ? Number(inputs.play) > 0 : false;
    const volume = Math.max(0, Math.min(1, inputs.volume !== undefined ? Number(inputs.volume) : Number(params.volume) ?? 1));
    const rate = Math.max(0.25, Math.min(4, inputs.playbackRate !== undefined ? Number(inputs.playbackRate) : Number(params.playbackRate) ?? 1));
    const loop = params.loop !== undefined ? Boolean(params.loop) : true;

    audioEl.loop = loop;
    audioEl.volume = volume;
    audioEl.playbackRate = rate;

    if (player.gainNode) {
      player.gainNode.gain.value = volume;
    }

    if (inputs.seek !== undefined && !isNaN(Number(inputs.seek))) {
      const targetPos = Math.max(0, Math.min(audioEl.duration || 0, Number(inputs.seek)));
      if (Math.abs(audioEl.currentTime - targetPos) > 0.5) {
        audioEl.currentTime = targetPos;
      }
    }

    if (playInput && audioEl.paused && audioEl.src) {
      audioEl.play().catch(() => {});
      player.isPlaying = true;
    } else if (!playInput && !audioEl.paused) {
      audioEl.pause();
      player.isPlaying = false;
    }

    return {
      audio: player,
      volume: audioEl.paused ? 0 : volume,
      duration: isNaN(audioEl.duration) ? 0 : audioEl.duration,
      position: isNaN(audioEl.currentTime) ? 0 : audioEl.currentTime,
    };
  },
};

/** Resamples a numeric array to a target length via linear interpolation */
function resampleArray(source: number[], targetLength: number): number[] {
  if (targetLength <= 0) return [];
  if (source.length === targetLength) return source;
  if (source.length === 0) return new Array(targetLength).fill(0);
  if (targetLength === 1) {
    const sum = source.reduce((a, b) => a + b, 0);
    return [sum / source.length];
  }

  const result: number[] = new Array(targetLength);
  for (let i = 0; i < targetLength; i++) {
    const srcIndex = (i / (targetLength - 1)) * (source.length - 1);
    const low = Math.floor(srcIndex);
    const high = Math.min(source.length - 1, Math.ceil(srcIndex));
    const frac = srcIndex - low;
    result[i] = source[low] * (1 - frac) + source[high] * frac;
  }
  return result;
}

/** Audio Spectrum (FFT) node — performs real-time frequency analysis and outputs spectrum array & bass/mid/treble volume levels. */
export const AUDIO_SPECTRUM_NODE: NodeDefinition = {
  type: "sound/spectrum",
  label: "Audio Spectrum (FFT)",
  category: "sound",
  inputs: [
    { id: "audio", label: "Audio In", type: "any" },
    { id: "bins", label: "Bins", type: "value" },
    { id: "smoothing", label: "Smoothing", type: "value" },
  ],
  outputs: [
    { id: "spectrum", label: "Spectrum List", type: "list" },
    { id: "bass", label: "Bass", type: "value" },
    { id: "mid", label: "Mid", type: "value" },
    { id: "treble", label: "Treble", type: "value" },
    { id: "volume", label: "Volume", type: "value" },
  ],
  defaultParams: { bins: 32, smoothing: 0.8 },
  paramFields: [
    { id: "bins", label: "Frequency Bins", kind: "number", step: 1 },
    { id: "smoothing", label: "Smoothing", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const targetBins = Math.max(1, Math.min(256, Math.floor(Number(inputs.bins) || Number(params.bins) || 32)));
    // Web Audio FFT size must be a power of 2 >= 32
    const fftSize = Math.max(32, Math.pow(2, Math.ceil(Math.log2(Math.max(16, targetBins * 2)))));
    const smoothing = Math.max(0, Math.min(0.99, inputs.smoothing !== undefined ? Number(inputs.smoothing) : Number(params.smoothing) ?? 0.8));

    const analyserState = getOrCreateAnalyser(ctx.nodeId, fftSize);

    if (!analyserState) {
      const dummySpectrum = new Array(targetBins).fill(0);
      return { spectrum: dummySpectrum, bass: 0, mid: 0, treble: 0, volume: 0 };
    }

    const { analyser, dataArray } = analyserState;
    analyser.smoothingTimeConstant = smoothing;

    const audioInput = inputs.audio as { sourceNode?: AudioNode; gainNode?: AudioNode } | undefined;
    if (audioInput?.gainNode) {
      try {
        audioInput.gainNode.connect(analyser);
      } catch {}
    } else if (audioInput?.sourceNode) {
      try {
        audioInput.sourceNode.connect(analyser);
      } catch {}
    }

    analyser.getByteFrequencyData(dataArray);

    const rawSpectrum: number[] = [];
    let sumTotal = 0;
    let sumBass = 0;
    let sumMid = 0;
    let sumTreble = 0;

    const len = dataArray.length;
    const bassEnd = Math.floor(len * 0.15);
    const midEnd = Math.floor(len * 0.65);

    for (let i = 0; i < len; i++) {
      const norm = dataArray[i] / 255;
      rawSpectrum.push(norm);
      sumTotal += norm;

      if (i <= bassEnd) sumBass += norm;
      else if (i <= midEnd) sumMid += norm;
      else sumTreble += norm;
    }

    const volume = len > 0 ? sumTotal / len : 0;
    const bass = bassEnd > 0 ? sumBass / (bassEnd + 1) : 0;
    const mid = midEnd > bassEnd ? sumMid / (midEnd - bassEnd) : 0;
    const treble = len > midEnd ? sumTreble / (len - midEnd) : 0;

    // Resample raw FFT spectrum to EXACTLY targetBins count
    const spectrum = resampleArray(rawSpectrum, targetBins);

    return { spectrum, bass, mid, treble, volume };
  },
};

/** Microphone Input node — captures live audio input from the user's microphone. */
export const MICROPHONE_INPUT_NODE: NodeDefinition = {
  type: "sound/microphone",
  label: "Microphone Input",
  category: "sound",
  inputs: [
    { id: "enable", label: "Enable", type: "value" },
    { id: "gain", label: "Gain", type: "value" },
  ],
  outputs: [
    { id: "audio", label: "Audio", type: "any" },
    { id: "volume", label: "Volume", type: "value" },
  ],
  defaultParams: { enable: 1, gain: 1 },
  paramFields: [
    { id: "enable", label: "Enable Mic", kind: "boolean" },
    { id: "gain", label: "Gain", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params, ctx) => {
    const enable = inputs.enable !== undefined ? Number(inputs.enable) > 0 : Boolean(params.enable ?? true);
    const gain = Math.max(0, inputs.gain !== undefined ? Number(inputs.gain) : Number(params.gain) ?? 1);

    const micState = getOrCreateMic(ctx.nodeId);

    if (enable && !micState.stream) {
      enableMicrophone(ctx.nodeId).catch(() => {});
    }

    if (micState.gainNode) {
      micState.gainNode.gain.value = gain;
    }

    return {
      audio: micState,
      volume: enable ? 1 : 0,
    };
  },
};

/** Audio Peak / Beat Detector node — triggers a pulse and peak envelope when volume exceeds threshold. */
export const AUDIO_PEAK_DETECTOR_NODE: NodeDefinition = {
  type: "sound/peak-detector",
  label: "Audio Peak Detector",
  category: "sound",
  inputs: [
    { id: "volume", label: "Volume In", type: "value" },
    { id: "threshold", label: "Threshold", type: "value" },
    { id: "decay", label: "Decay", type: "value" },
  ],
  outputs: [
    { id: "trigger", label: "Beat Pulse", type: "value" },
    { id: "peak", label: "Envelope", type: "value" },
  ],
  defaultParams: { threshold: 0.5, decay: 0.9 },
  paramFields: [
    { id: "threshold", label: "Threshold (0..1)", kind: "number", step: 0.05 },
    { id: "decay", label: "Decay Speed", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const val = Math.max(0, Number(inputs.volume) || 0);
    const threshold = Math.max(0, Math.min(1, inputs.threshold !== undefined ? Number(inputs.threshold) : Number(params.threshold) ?? 0.5));
    const decay = Math.max(0.1, Math.min(0.99, inputs.decay !== undefined ? Number(inputs.decay) : Number(params.decay) ?? 0.9));

    const peakState = getOrCreatePeakDetector(ctx.nodeId);

    peakState.envelope = Math.max(val, peakState.envelope * decay);

    const isOverThreshold = val >= threshold;
    const isRising = val > peakState.lastValue + 0.05;
    const trigger = isOverThreshold && isRising && !peakState.isBeat ? 1 : 0;

    peakState.isBeat = isOverThreshold;
    peakState.lastValue = val;

    return {
      trigger,
      peak: peakState.envelope,
    };
  },
};

const WAVEFORM_OPTIONS = ["sine", "square", "sawtooth", "triangle"];

/** Audio Synth node — generates synthetic audio tones with controllable frequency, waveform, and volume. */
export const AUDIO_SYNTH_NODE: NodeDefinition = {
  type: "sound/synth",
  label: "Audio Synth",
  category: "sound",
  inputs: [
    { id: "frequency", label: "Pitch (Hz)", type: "value" },
    { id: "trigger", label: "Gate", type: "value" },
    { id: "volume", label: "Volume", type: "value" },
  ],
  outputs: [
    { id: "audio", label: "Audio", type: "any" },
    { id: "volume", label: "Volume", type: "value" },
  ],
  defaultParams: { waveform: "sine", frequency: 440, volume: 0.5 },
  paramFields: [
    { id: "waveform", label: "Waveform", kind: "select", options: WAVEFORM_OPTIONS },
    { id: "frequency", label: "Frequency (Hz)", kind: "number", step: 10 },
    { id: "volume", label: "Volume", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const synthState = getOrCreateSynth(ctx.nodeId);
    const ctxWeb = getAudioContext();

    const freq = Math.max(20, Math.min(20000, inputs.frequency !== undefined ? Number(inputs.frequency) : Number(params.frequency) ?? 440));
    const volume = Math.max(0, Math.min(1, inputs.volume !== undefined ? Number(inputs.volume) : Number(params.volume) ?? 0.5));
    const gate = inputs.trigger !== undefined ? Number(inputs.trigger) > 0 : true;
    const waveform = (params.waveform as OscillatorType) || "sine";

    if (ctxWeb && gate) {
      if (!synthState.osc) {
        try {
          const osc = ctxWeb.createOscillator();
          const gain = ctxWeb.createGain();
          osc.type = waveform;
          osc.frequency.value = freq;
          gain.gain.value = volume;
          osc.connect(gain);
          gain.connect(ctxWeb.destination);
          osc.start();
          synthState.osc = osc;
          synthState.gainNode = gain;
          synthState.isPlaying = true;
        } catch {}
      } else {
        if (synthState.osc.type !== waveform) synthState.osc.type = waveform;
        synthState.osc.frequency.value = freq;
        if (synthState.gainNode) synthState.gainNode.gain.value = volume;
      }
    } else if (!gate && synthState.osc) {
      try {
        synthState.osc.stop();
        synthState.osc.disconnect();
      } catch {}
      synthState.osc = undefined;
      synthState.isPlaying = false;
    }

    return {
      audio: synthState,
      volume: gate ? volume : 0,
    };
  },
};

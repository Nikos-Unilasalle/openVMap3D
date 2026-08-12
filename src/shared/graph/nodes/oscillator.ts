import { NodeDefinition } from "../types";
import { toBoolean } from "../sockets";

const WAVEFORMS = ["sine", "saw", "square", "triangle"];

/**
 * Oscillator node — generates a periodic waveform (sine, saw, square, triangle) over time.
 * Replaces OpenVMap's hardcoded animation types (strobe, colour-slide, pan, rotation-spin, scale-pingpong).
 */
export const OSCILLATOR_NODE: NodeDefinition = {
  type: "animation/oscillator",
  label: "Oscillator",
  category: "time",
  inputs: [
    { id: "frequency", label: "Frequency", type: "value" },
    { id: "phase", label: "Phase", type: "value" },
    { id: "amplitude", label: "Amplitude", type: "value" },
    { id: "offset", label: "Offset", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { type: "sine", frequency: 1, phase: 0, amplitude: 1, offset: 0 },
  paramFields: [
    { id: "type", label: "Waveform", kind: "select", options: WAVEFORMS },
    { id: "frequency", label: "Frequency (Hz)", kind: "number" },
    { id: "phase", label: "Phase (0..1)", kind: "number" },
    { id: "amplitude", label: "Amplitude", kind: "number" },
    { id: "offset", label: "Offset", kind: "number" },
  ],
  evaluate: (inputs, params, ctx) => {
    const type = String(params.type || "sine");
    const freq = inputs.frequency !== undefined ? Number(inputs.frequency) || 0 : Number(params.frequency) || 1;
    const phase = inputs.phase !== undefined ? Number(inputs.phase) || 0 : Number(params.phase) || 0;
    const amp = inputs.amplitude !== undefined ? Number(inputs.amplitude) || 0 : Number(params.amplitude) || 1;
    const offset = inputs.offset !== undefined ? Number(inputs.offset) || 0 : Number(params.offset) || 0;

    const t = ctx.time * freq + phase;
    const normT = ((t % 1) + 1) % 1; // normalized time 0..1

    let wave = 0;
    switch (type) {
      case "sine":
        wave = Math.sin(t * Math.PI * 2);
        break;
      case "saw":
        wave = normT * 2 - 1;
        break;
      case "square":
        wave = normT < 0.5 ? 1 : -1;
        break;
      case "triangle":
        wave = Math.abs(normT * 4 - 2) - 1;
        break;
      default:
        wave = Math.sin(t * Math.PI * 2);
    }

    return { out: wave * amp + offset };
  },
};

/** State cache for Envelope node: nodeId -> { triggerTime: number, releasing: boolean, releaseStartTime: number, levelAtRelease: number } */
interface EnvelopeState {
  lastTime: number;
  prevTrigger: boolean;
  triggerTime: number;
  releasing: boolean;
  releaseStartTime: number;
  levelAtRelease: number;
}

const envelopeCache = new Map<string, EnvelopeState>();

/**
 * Envelope node — Attack / Release envelope generator.
 * Triggers on rising edge of trigger input, ramps up to 1 over Attack seconds, ramps down to 0 over Release seconds.
 */
export const ENVELOPE_NODE: NodeDefinition = {
  type: "animation/envelope",
  label: "Envelope",
  category: "time",
  inputs: [
    { id: "trigger", label: "Trigger", type: "value" },
    { id: "attack", label: "Attack", type: "value" },
    { id: "release", label: "Release", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { attack: 0.1, release: 0.5 },
  paramFields: [
    { id: "attack", label: "Attack (s)", kind: "number" },
    { id: "release", label: "Release (s)", kind: "number" },
  ],
  evaluate: (inputs, params, ctx) => {
    const trig = toBoolean(inputs.trigger);
    const attack = Math.max(0.001, inputs.attack !== undefined ? Number(inputs.attack) || 0 : Number(params.attack) || 0.1);
    const release = Math.max(0.001, inputs.release !== undefined ? Number(inputs.release) || 0 : Number(params.release) || 0.5);

    let state = envelopeCache.get(ctx.nodeId);
    if (!state) {
      state = {
        lastTime: ctx.time,
        prevTrigger: false,
        triggerTime: -1000,
        releasing: false,
        releaseStartTime: -1000,
        levelAtRelease: 0,
      };
    }

    // Check rising edge or falling edge
    if (trig && !state.prevTrigger) {
      state.triggerTime = ctx.time;
      state.releasing = false;
    } else if (!trig && state.prevTrigger && !state.releasing) {
      // Gate dropped: calculate level at drop point
      const elapsedAttack = ctx.time - state.triggerTime;
      state.levelAtRelease = Math.min(1, Math.max(0, elapsedAttack / attack));
      state.releasing = true;
      state.releaseStartTime = ctx.time;
    }

    state.prevTrigger = trig;
    state.lastTime = ctx.time;
    envelopeCache.set(ctx.nodeId, state);

    let level = 0;
    if (trig) {
      const elapsed = ctx.time - state.triggerTime;
      level = Math.min(1, Math.max(0, elapsed / attack));
    } else if (state.releasing) {
      const elapsedRelease = ctx.time - state.releaseStartTime;
      const releaseRatio = Math.min(1, Math.max(0, elapsedRelease / release));
      level = state.levelAtRelease * (1 - releaseRatio);
      if (releaseRatio >= 1) state.releasing = false;
    }

    return { out: level };
  },
};

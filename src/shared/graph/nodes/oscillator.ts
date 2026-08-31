import { NodeDefinition, EasingType } from "../types";
import { toBoolean } from "../sockets";
import { createSessionCache, sessionState } from "../nodeCaches";
import { computeSegmentEasing } from "../evaluate";
import { EASE_OPTIONS } from "./motion";

const WAVEFORMS = ["sine", "saw", "square", "triangle"];

/**
 * Oscillator node — generates a periodic waveform (sine, saw, square, triangle) over time.
 * Replaces OpenVMap's hardcoded animation types (strobe, colour-slide, pan, rotation-spin, scale-pingpong).
 *
 * Curve reshapes the pacing *within* each cycle before the waveform is
 * evaluated — same easing engine the timeline's keyframes use — so a saw or
 * triangle can ease in/out of its ramp instead of moving at a constant rate,
 * and a sine can linger at its extremes instead of always moving fastest
 * through the middle. "linear" is a no-op: identical output to before Curve
 * existed, so every prior project keeps behaving exactly the same.
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
  defaultParams: {
    type: "sine",
    frequency: 1,
    phase: 0,
    amplitude: 1,
    offset: 0,
    curve: "linear",
    curveStrength: 1,
  },
  paramFields: [
    { id: "type", label: "Waveform", kind: "select", options: WAVEFORMS },
    { id: "frequency", label: "Frequency (Hz)", kind: "number" },
    { id: "phase", label: "Phase (0..1)", kind: "number" },
    { id: "amplitude", label: "Amplitude", kind: "number" },
    { id: "offset", label: "Offset", kind: "number" },
    { id: "curve", label: "Curve", kind: "select", options: EASE_OPTIONS },
    { id: "curveStrength", label: "Curve Strength", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const type = String(params.type || "sine");
    const freq = inputs.frequency !== undefined ? Number(inputs.frequency) || 0 : Number(params.frequency) || 1;
    const phase = inputs.phase !== undefined ? Number(inputs.phase) || 0 : Number(params.phase) || 0;
    const amp = inputs.amplitude !== undefined ? Number(inputs.amplitude) || 0 : Number(params.amplitude) || 1;
    const offset = inputs.offset !== undefined ? Number(inputs.offset) || 0 : Number(params.offset) || 0;
    const curve = String(params.curve || "linear") as EasingType;
    const curveStrength = Number.isFinite(Number(params.curveStrength)) ? Number(params.curveStrength) : 1;

    const t = ctx.time * freq + phase;
    const normT = ((t % 1) + 1) % 1; // normalized time 0..1
    const curvedT = curve === "linear" ? normT : computeSegmentEasing(normT, curve, curveStrength);

    let wave = 0;
    switch (type) {
      case "sine":
        wave = Math.sin(curvedT * Math.PI * 2);
        break;
      case "saw":
        wave = curvedT * 2 - 1;
        break;
      case "square":
        wave = curvedT < 0.5 ? 1 : -1;
        break;
      case "triangle":
        wave = Math.abs(curvedT * 4 - 2) - 1;
        break;
      default:
        wave = Math.sin(curvedT * Math.PI * 2);
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

const envelopeCache = createSessionCache<EnvelopeState>();

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

    // Per-session state: two panes evaluate the same graph on their own
    // clocks, and a shared slot made the second pane miss the rising edge
    // (its prev had already been overwritten by the first pane's pass).
    const state = sessionState(envelopeCache, ctx.nodeId, ctx.sessionId ?? "default", () => ({
      lastTime: ctx.time,
      prevTrigger: false,
      triggerTime: -1000,
      releasing: false,
      releaseStartTime: -1000,
      levelAtRelease: 0,
    }));

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

/** State cache for Pulse node: nodeId -> { lastTime, prevTrigger, energy } */
interface PulseState {
  lastTime: number;
  prevTrigger: boolean;
  energy: number;
}

const pulseStateCache = createSessionCache<PulseState>();

/**
 * Pulse node — simulates a physical impulse. A rising edge on `trigger` adds
 * `amplitude` to the node's internal energy, which then decays exponentially
 * toward 0 with time constant `decay`. Retriggering while still decaying
 * stacks on top of the current energy instead of resetting it.
 */
export const PULSE_NODE: NodeDefinition = {
  type: "time/pulse",
  label: "Pulse",
  category: "time",
  inputs: [
    { id: "trigger", label: "Trigger", type: "value" },
    { id: "decay", label: "Decay", type: "value" },
  ],
  outputs: [{ id: "out", label: "Out", type: "value" }],
  defaultParams: { decay: 0.3, amplitude: 1 },
  paramFields: [
    { id: "decay", label: "Decay (s)", kind: "number", group: "General" },
    { id: "amplitude", label: "Amplitude", kind: "number", group: "General" },
  ],
  evaluate: (inputs, params, ctx) => {
    const trig = toBoolean(inputs.trigger);
    const decay = Math.max(0.001, inputs.decay !== undefined ? Number(inputs.decay) || 0 : Number(params.decay) || 0.3);
    const amplitude = Number(params.amplitude) || 0;

    // Per-session state (see Envelope): a shared slot dropped the second
    // pane's rising edges when two viewports rendered the same graph.
    const state = sessionState(pulseStateCache, ctx.nodeId, ctx.sessionId ?? "default", () => ({
      lastTime: ctx.time,
      prevTrigger: false,
      energy: 0,
    }));

    // Scrub backwards: reseed rather than let a negative dt blow up the decay.
    const rewound = ctx.time < state.lastTime - 0.5;
    const dt = rewound ? 0 : Math.max(0, ctx.time - state.lastTime);
    if (rewound) state.energy = 0;

    state.energy *= Math.exp(-dt / decay);

    if (trig && !state.prevTrigger) {
      state.energy += amplitude;
    }

    state.prevTrigger = trig;
    state.lastTime = ctx.time;

    return { out: state.energy };
  },
};

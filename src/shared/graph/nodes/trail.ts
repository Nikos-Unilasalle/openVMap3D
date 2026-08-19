import * as THREE from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asColor, numberInput, primitiveOutputs } from "./object";

interface TrailSample {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface TrailState {
  line?: Line2;
  material?: LineMaterial;
  samples: TrailSample[];
  lastTime?: number;
}

const trailCache = createNodeCache<TrailState>((s) => {
  if (s.line?.geometry) s.line.geometry.dispose();
  if (s.material) s.material.dispose();
});

function getTrailState(nodeId: string): TrailState {
  let state = trailCache.get(nodeId);
  if (!state) {
    state = { samples: [] };
    trailCache.set(nodeId, state);
  }
  return state;
}

/**
 * Trail Node — a fat line that follows an animated object through recent
 * history (the classic motion-design trail). Feed it the object's geometry and
 * the time clock; it samples the world position as time advances and draws a
 * Line2 through the last `history` seconds, capped at `segments` points.
 *
 * The trail resets when time rewinds (scrubbing back, or an export restarting
 * at frame 0), so a fresh export starts with a clean trail.
 */
export const TRAIL_NODE: NodeDefinition = {
  type: "structure/trail",
  label: "Trail",
  category: "structure",
  inputs: [
    // NOT owns: the trail only *reads* the object's position, like a Look At
    // target — declaring ownership would yank the source object out of the
    // scene whenever it isn't merged somewhere else too.
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "time", label: "Time", type: "value" },
    { id: "history", label: "History (s)", type: "value" },
    { id: "segments", label: "Segments", type: "value" },
    { id: "linewidth", label: "Width", type: "value" },
    { id: "opacity", label: "Opacity", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "points", label: "Points (World)", type: "list" },
  ],
  defaultParams: {
    time: 0,
    history: 2,
    segments: 96,
    linewidth: 2,
    opacity: 0.8,
    worldUnits: false,
    color: new THREE.Color(0x38bdf8),
  },
  dynamicParamFields: () => [
    { id: "time", label: "Time", kind: "number", step: 0.05 },
    { id: "history", label: "History (s)", kind: "number", step: 0.1 },
    { id: "segments", label: "Segments", kind: "number", step: 8 },
    { id: "linewidth", label: "Width", kind: "number", step: 0.1, group: "Line" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Line" },
    { id: "worldUnits", label: "World Units (width in scene units)", kind: "boolean", group: "Line" },
    { id: "color", label: "Color", kind: "color", group: "Line" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getTrailState(ctx.nodeId);

    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const time = inputs.time !== undefined ? numberInput(inputs.time, params.time, 0) : (ctx.time ?? 0);
    const history = Math.max(0.05, numberInput(inputs.history, params.history, 2));
    const segments = Math.max(3, Math.min(400, Math.round(numberInput(inputs.segments, params.segments, 96))));
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0x38bdf8)));

    if (!state.material) {
      state.material = new LineMaterial({ color: 0xffffff, transparent: true });
    }
    const material = state.material;
    material.color.set(color);
    const opacity = Math.max(0, Math.min(1, numberInput(inputs.opacity, params.opacity, 0.8)));
    material.uniforms.opacity.value = opacity;
    material.transparent = opacity < 0.999;
    material.linewidth = Math.max(0.1, numberInput(inputs.linewidth, params.linewidth, 2));
    const worldUnits = Boolean(params.worldUnits);
    if (state.material.worldUnits !== worldUnits) {
      material.worldUnits = worldUnits;
      material.needsUpdate = true;
    }
    const size = new THREE.Vector2(1920, 1080);
    if (ctx.renderer) {
      ctx.renderer.getSize(size);
      if (size.x <= 0 || size.y <= 0) size.set(1920, 1080);
    }
    material.resolution.copy(size);

    if (!state.line) {
      state.line = new Line2(new LineGeometry(), material);
      state.line.matrixAutoUpdate = false;
      state.line.matrix.identity();
      state.line.frustumCulled = false;
      state.line.userData.nodeId = ctx.nodeId;
    }

    if (object) {
      object.updateWorldMatrix(true, false, true);
      const pos = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);

      // Time went backward (scrub / export restart): start the trail afresh.
      // The threshold is deliberately loose — the editor and output panes both
      // evaluate this node with their own clocks, so the shared state sees
      // small interleaved backward steps every frame; only a real rewind
      // (> 0.5s) wipes the trail, otherwise the reset would empty it forever.
      if (state.lastTime !== undefined && time < state.lastTime - 0.5) {
        state.samples = [];
      }
      state.lastTime = time;

      // Prune samples that fell out of the window.
      if (state.samples.length > 0 && time - state.samples[0].t > history) {
        state.samples = state.samples.filter((s) => time - s.t <= history);
      }

      // Append a sample only when time actually advanced.
      if (state.samples.length === 0 || time - state.samples[state.samples.length - 1].t > 1e-4) {
        state.samples.push({ t: time, x: pos.x, y: pos.y, z: pos.z });
      }
      if (state.samples.length > segments) {
        state.samples.splice(0, state.samples.length - segments);
      }

      const points = state.samples.map((s) => new THREE.Vector3(s.x, s.y, s.z));
      (state.line.geometry as LineGeometry).setFromPoints(points);

      return { ...primitiveOutputs(state.line), points };
    }

    (state.line.geometry as LineGeometry).setFromPoints([]);
    return { ...primitiveOutputs(state.line), points: [] };
  },
};

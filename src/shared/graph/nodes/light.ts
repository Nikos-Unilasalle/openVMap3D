import * as THREE from "three";
import { NodeDefinition } from "../types";

const lightCache = new Map<string, THREE.Light>();

function asColor(v: unknown, fallback: THREE.Color): THREE.Color {
  if (v instanceof THREE.Color) return v;
  if (typeof v === "string" || typeof v === "number") {
    try {
      return new THREE.Color(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/** Directional Light node — simulates distant sun lighting with directional shadow mapping. */
export const LIGHT_DIRECTIONAL_NODE: NodeDefinition = {
  type: "light/directional",
  label: "Directional Light",
  category: "lighting",
  inputs: [
    { id: "color", label: "Color", type: "color" },
    { id: "intensity", label: "Intensity", type: "value" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "castShadow", label: "Shadows", type: "value" },
  ],
  outputs: [{ id: "light", label: "Light", type: "geometry" }],
  defaultParams: {
    color: new THREE.Color(0xffffff),
    intensity: 1.5,
    castShadow: 1,
  },
  paramFields: [
    { id: "color", label: "Color", kind: "color" },
    { id: "intensity", label: "Intensity", kind: "number", step: 0.1 },
    { id: "castShadow", label: "Cast Shadows", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    let light = lightCache.get(ctx.nodeId) as THREE.DirectionalLight | undefined;
    if (!light) {
      light = new THREE.DirectionalLight(0xffffff, 1.5);
      light.shadow.mapSize.width = 2048;
      light.shadow.mapSize.height = 2048;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 50;
      const d = 10;
      light.shadow.camera.left = -d;
      light.shadow.camera.right = d;
      light.shadow.camera.top = d;
      light.shadow.camera.bottom = -d;
      light.shadow.bias = -0.0005;
      light.userData.nodeId = ctx.nodeId;
      lightCache.set(ctx.nodeId, light);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const intensity = Math.max(0, inputs.intensity !== undefined ? Number(inputs.intensity) : Number(params.intensity) ?? 1.5);
    const castShadow = inputs.castShadow !== undefined ? Number(inputs.castShadow) > 0 : Boolean(params.castShadow ?? true);

    light.color.copy(color);
    light.intensity = intensity;
    light.castShadow = castShadow;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      if (!inputs.matrix) {
        // Default position if no matrix connected
        matrix.setPosition(5, 10, 7);
      }
      light.matrixAutoUpdate = false;
      light.matrix.copy(matrix);
    }

    return { light };
  },
};

/** Point Light node — omnidirectional point light source with distance attenuation and shadow mapping. */
export const LIGHT_POINT_NODE: NodeDefinition = {
  type: "light/point",
  label: "Point Light",
  category: "lighting",
  inputs: [
    { id: "color", label: "Color", type: "color" },
    { id: "intensity", label: "Intensity", type: "value" },
    { id: "distance", label: "Distance", type: "value" },
    { id: "decay", label: "Decay", type: "value" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "castShadow", label: "Shadows", type: "value" },
  ],
  outputs: [{ id: "light", label: "Light", type: "geometry" }],
  defaultParams: {
    color: new THREE.Color(0xffffff),
    intensity: 2.0,
    distance: 15,
    decay: 2,
    castShadow: 1,
  },
  paramFields: [
    { id: "color", label: "Color", kind: "color" },
    { id: "intensity", label: "Intensity", kind: "number", step: 0.1 },
    { id: "distance", label: "Distance", kind: "number", step: 0.5 },
    { id: "decay", label: "Decay", kind: "number", step: 0.1 },
    { id: "castShadow", label: "Cast Shadows", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    let light = lightCache.get(ctx.nodeId) as THREE.PointLight | undefined;
    if (!light) {
      light = new THREE.PointLight(0xffffff, 2.0, 15, 2);
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.bias = -0.001;
      light.userData.nodeId = ctx.nodeId;
      lightCache.set(ctx.nodeId, light);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const intensity = Math.max(0, inputs.intensity !== undefined ? Number(inputs.intensity) : Number(params.intensity) ?? 2.0);
    const distance = Math.max(0, inputs.distance !== undefined ? Number(inputs.distance) : Number(params.distance) ?? 15);
    const decay = Math.max(0, inputs.decay !== undefined ? Number(inputs.decay) : Number(params.decay) ?? 2);
    const castShadow = inputs.castShadow !== undefined ? Number(inputs.castShadow) > 0 : Boolean(params.castShadow ?? true);

    light.color.copy(color);
    light.intensity = intensity;
    light.distance = distance;
    light.decay = decay;
    light.castShadow = castShadow;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      if (!inputs.matrix) {
        matrix.setPosition(0, 5, 0);
      }
      light.matrixAutoUpdate = false;
      light.matrix.copy(matrix);
    }

    return { light };
  },
};

/** Spot Light node — focused cone light beam (projector) with cone angle, penumbra edge softness, and shadows. */
export const LIGHT_SPOT_NODE: NodeDefinition = {
  type: "light/spot",
  label: "Spot Light",
  category: "lighting",
  inputs: [
    { id: "color", label: "Color", type: "color" },
    { id: "intensity", label: "Intensity", type: "value" },
    { id: "angle", label: "Angle (°)", type: "value" },
    { id: "penumbra", label: "Penumbra", type: "value" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "castShadow", label: "Shadows", type: "value" },
  ],
  outputs: [{ id: "light", label: "Light", type: "geometry" }],
  defaultParams: {
    color: new THREE.Color(0xffffff),
    intensity: 3.0,
    angle: 45,
    penumbra: 0.3,
    castShadow: 1,
  },
  paramFields: [
    { id: "color", label: "Color", kind: "color" },
    { id: "intensity", label: "Intensity", kind: "number", step: 0.1 },
    { id: "angle", label: "Cone Angle (°)", kind: "number", step: 5 },
    { id: "penumbra", label: "Soft Edge (0..1)", kind: "number", step: 0.05 },
    { id: "castShadow", label: "Cast Shadows", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    let light = lightCache.get(ctx.nodeId) as THREE.SpotLight | undefined;
    if (!light) {
      light = new THREE.SpotLight(0xffffff, 3.0);
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      light.shadow.bias = -0.0005;
      light.userData.nodeId = ctx.nodeId;
      lightCache.set(ctx.nodeId, light);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const intensity = Math.max(0, inputs.intensity !== undefined ? Number(inputs.intensity) : Number(params.intensity) ?? 3.0);
    const angleDeg = Math.max(1, Math.min(89, inputs.angle !== undefined ? Number(inputs.angle) : Number(params.angle) ?? 45));
    const penumbra = Math.max(0, Math.min(1, inputs.penumbra !== undefined ? Number(inputs.penumbra) : Number(params.penumbra) ?? 0.3));
    const castShadow = inputs.castShadow !== undefined ? Number(inputs.castShadow) > 0 : Boolean(params.castShadow ?? true);

    light.color.copy(color);
    light.intensity = intensity;
    light.angle = (angleDeg * Math.PI) / 180;
    light.penumbra = penumbra;
    light.castShadow = castShadow;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      if (!inputs.matrix) {
        matrix.setPosition(0, 6, 4);
      }
      light.matrixAutoUpdate = false;
      light.matrix.copy(matrix);
    }

    return { light };
  },
};

/** Ambient Light node — global ambient fill light. */
export const LIGHT_AMBIENT_NODE: NodeDefinition = {
  type: "light/ambient",
  label: "Ambient Light",
  category: "lighting",
  inputs: [
    { id: "color", label: "Color", type: "color" },
    { id: "intensity", label: "Intensity", type: "value" },
  ],
  outputs: [{ id: "light", label: "Light", type: "geometry" }],
  defaultParams: {
    color: new THREE.Color(0xffffff),
    intensity: 0.4,
  },
  paramFields: [
    { id: "color", label: "Color", kind: "color" },
    { id: "intensity", label: "Intensity", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params, ctx) => {
    let light = lightCache.get(ctx.nodeId) as THREE.AmbientLight | undefined;
    if (!light) {
      light = new THREE.AmbientLight(0xffffff, 0.4);
      light.userData.nodeId = ctx.nodeId;
      lightCache.set(ctx.nodeId, light);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const intensity = Math.max(0, inputs.intensity !== undefined ? Number(inputs.intensity) : Number(params.intensity) ?? 0.4);

    light.color.copy(color);
    light.intensity = intensity;

    return { light };
  },
};

import * as THREE from "three";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition } from "../types";
import { ForceFieldDescriptor } from "../particleRuntime";
import { asColor, numberInput, primitiveOutputs } from "./object";
import { composeNativeMatrix } from "./transform";
import { toBoolean } from "../sockets";

interface AttractorState {
  object?: THREE.Object3D;
}

const attractorCache = createNodeCache<AttractorState>((s) => {
  if (s.object) disposeObject3D(s.object);
});

function asVector(v: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (v instanceof THREE.Vector3) return v;
  return fallback;
}

/**
 * 1. Dedicated Curl Noise Force Field Node for Particle Simulation
 */
export const PARTICLE_CURL_NOISE_NODE: NodeDefinition = {
  type: "particles/curl-noise",
  label: "Curl Noise Field",
  category: "particles",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "position", label: "Position", type: "vector" },
    { id: "strength", label: "Fluid Strength", type: "value" },
    { id: "scale", label: "Swirl Scale", type: "value" },
    { id: "speed", label: "Flow Speed", type: "value" },
    { id: "radius", label: "Radius (0 = inf)", type: "value" },
  ],
  outputs: [{ id: "field", label: "Field", type: "any" }],
  defaultParams: {
    position: new THREE.Vector3(0, 0, 0),
    strength: 3.0,
    scale: 0.8,
    speed: 0.2,
    radius: 0,
  },
  paramFields: [
    { id: "position", label: "Position", kind: "vector" },
    { id: "strength", label: "Fluid Strength", kind: "number", step: 0.5 },
    { id: "scale", label: "Swirl Scale", kind: "number", step: 0.1 },
    { id: "speed", label: "Flow Speed", kind: "number", step: 0.05 },
    { id: "radius", label: "Radius (0 = inf)", kind: "number", step: 0.5 },
  ],
  evaluate: (inputs, params): { field: ForceFieldDescriptor } => {
    const basePos = asVector(inputs.position, asVector(params.position, new THREE.Vector3()));
    const pos = basePos.clone();
    const axis = new THREE.Vector3(0, 1, 0);

    if (inputs.matrix instanceof THREE.Matrix4) {
      pos.applyMatrix4(inputs.matrix);
      axis.transformDirection(inputs.matrix).normalize();
    }

    const strength = numberInput(inputs.strength, params.strength, 3.0);
    const scale = Math.max(0.01, numberInput(inputs.scale, params.scale, 0.8));
    const speed = numberInput(inputs.speed, params.speed, 0.2);
    const radius = Math.max(0, numberInput(inputs.radius, params.radius, 0));

    return {
      field: {
        type: "turbulence",
        position: pos,
        axis,
        strength,
        radius,
        scale,
        speed,
      },
    };
  },
};

/**
 * 2. Strange Attractors Node (Lorenz, Aizawa, Thomas)
 */
export const PARTICLE_STRANGE_ATTRACTOR_NODE: NodeDefinition = {
  type: "particles/strange-attractor",
  label: "Strange Attractor",
  category: "particles",
  inputs: [
    { id: "visible", label: "Visible", type: "value" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "location", label: "Location", type: "vector" },
    { id: "rotation", label: "Rotation", type: "vector" },
    { id: "scale", label: "Scale", type: "vector" },
    { id: "steps", label: "Point Count", type: "value" },
    { id: "stepSize", label: "dt Step", type: "value" },
    { id: "attractorScale", label: "Attractor Size", type: "value" },
    { id: "speed", label: "Evolution Speed", type: "value" },
    { id: "colorSpeed", label: "Color Speed", type: "value" },
    { id: "color", label: "Color", type: "color" },
    { id: "pointSize", label: "Point Size", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "points", label: "Points List", type: "list" },
  ],
  defaultParams: {
    visible: true,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    showPivot: false,
    pivot: new THREE.Vector3(0, 0, 0),
    inheritRotation: true,
    inheritScale: true,
    attractorType: "lorenz",
    steps: 2500,
    stepSize: 0.01,
    attractorScale: 0.12,
    speed: 1.0,
    colorSpeed: 1.0,
    renderMode: "points",
    color: new THREE.Color(0x00ffff),
    pointSize: 3.0,
  },
  paramFields: [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
    { id: "showPivot", label: "Show Pivot", kind: "boolean", group: "Transform" },
    { id: "pivot", label: "Pivot Offset", kind: "vector", group: "Transform" },
    { id: "inheritRotation", label: "Inherit Rotation", kind: "boolean", group: "Transform" },
    { id: "inheritScale", label: "Inherit Scale", kind: "boolean", group: "Transform" },

    {
      id: "attractorType",
      label: "Attractor System",
      kind: "select",
      options: ["lorenz", "aizawa", "thomas"],
      group: "Attractor",
    },
    {
      id: "renderMode",
      label: "Render Mode",
      kind: "select",
      options: ["points", "line"],
      group: "Attractor",
    },
    { id: "steps", label: "Steps / Count", kind: "number", step: 500, group: "Attractor" },
    { id: "stepSize", label: "dt Step", kind: "number", step: 0.002, group: "Attractor" },
    { id: "attractorScale", label: "Attractor Size", kind: "number", step: 0.02, group: "Attractor" },
    { id: "speed", label: "Evolution Speed", kind: "number", step: 0.1, group: "Attractor" },
    { id: "colorSpeed", label: "Color Speed", kind: "number", step: 0.1, group: "Attractor" },
    { id: "color", label: "Color", kind: "color", group: "Attractor" },
    { id: "pointSize", label: "Point Size", kind: "number", step: 0.5, group: "Attractor" },
  ],
  evaluate: (inputs, params, ctx) => {
    const isVisible = toBoolean(inputs.visible !== undefined ? inputs.visible : (params.visible ?? true));
    const type = String(params.attractorType || "lorenz").toLowerCase();
    const renderMode = String(params.renderMode || "points").toLowerCase();
    const steps = Math.min(20000, Math.max(100, Math.round(numberInput(inputs.steps, params.steps, 2500))));
    const dt = Math.max(0.0005, numberInput(inputs.stepSize, params.stepSize, 0.01));
    const scale = numberInput(inputs.attractorScale, params.attractorScale ?? params.scale, 0.12);
    const speed = numberInput(inputs.speed, params.speed, 1.0);
    const colorSpeed = numberInput(inputs.colorSpeed, params.colorSpeed, 1.0);
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0x00ffff)));
    const pointSize = numberInput(inputs.pointSize, params.pointSize, 3.0);
    const time = (ctx.time ?? 0) * speed;

    let state = attractorCache.get(ctx.nodeId);
    if (!state) {
      state = {};
      attractorCache.set(ctx.nodeId, state);
    }
    if (state.object) {
      disposeObject3D(state.object);
      state.object = undefined;
    }

    const positions = new Float32Array(steps * 3);
    const colors = new Float32Array(steps * 3);
    const pointsList: THREE.Vector3[] = [];

    // Starting seed perturbed slightly by evolution time
    let x = 0.1 + Math.sin(time * 0.2) * 0.05;
    let y = 0.1 + Math.cos(time * 0.2) * 0.05;
    let z = 0.1;

    // Run-up to settle onto the attractor manifold
    for (let i = 0; i < 150; i++) {
      if (type === "aizawa") {
        const dx = (z - 0.7) * x - 3.5 * y;
        const dy = 3.5 * x + (z - 0.7) * y;
        const dz = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z);
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      } else if (type === "thomas") {
        const b = 0.208186;
        const dx = Math.sin(y) - b * x;
        const dy = Math.sin(z) - b * y;
        const dz = Math.sin(x) - b * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      } else {
        // Lorenz
        const sigma = 10.0;
        const rho = 28.0;
        const beta = 8.0 / 3.0;
        const dx = sigma * (y - x);
        const dy = x * (rho - z) - y;
        const dz = x * y - beta * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      }
    }

    // Trajectory generation
    for (let i = 0; i < steps; i++) {
      if (type === "aizawa") {
        const dx = (z - 0.7) * x - 3.5 * y;
        const dy = 3.5 * x + (z - 0.7) * y;
        const dz = 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z);
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      } else if (type === "thomas") {
        const b = 0.208186;
        const dx = Math.sin(y) - b * x;
        const dy = Math.sin(z) - b * y;
        const dz = Math.sin(x) - b * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      } else {
        // Lorenz
        const sigma = 10.0;
        const rho = 28.0;
        const beta = 8.0 / 3.0;
        const dx = sigma * (y - x);
        const dy = x * (rho - z) - y;
        const dz = x * y - beta * z;
        x += dx * dt;
        y += dy * dt;
        z += dz * dt;
      }

      const px = x * scale;
      const py = y * scale;
      const pz = (z - (type === "lorenz" ? 25 : 0)) * scale;

      positions[i * 3] = px;
      positions[i * 3 + 1] = py;
      positions[i * 3 + 2] = pz;

      // Color gradient along the curve with animated color cycle
      const t = Math.abs((i / steps + time * colorSpeed * 0.1) % 1.0);
      colors[i * 3] = color.r * (0.4 + 0.6 * t);
      colors[i * 3 + 1] = color.g * (0.6 + 0.4 * Math.sin(t * Math.PI));
      colors[i * 3 + 2] = color.b * (1.0 - 0.5 * t);

      if (i % 5 === 0) {
        pointsList.push(new THREE.Vector3(px, py, pz));
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    let obj: THREE.Object3D;
    if (renderMode === "line") {
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
      obj = new THREE.Line(geometry, mat);
    } else {
      const mat = new THREE.PointsMaterial({
        size: pointSize,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      obj = new THREE.Points(geometry, mat);
    }

    obj.userData = { nodeId: ctx.nodeId };
    obj.visible = isVisible;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      obj.matrixAutoUpdate = false;
      const loc = inputs.location !== undefined ? inputs.location : params.location;
      const rot = inputs.rotation !== undefined ? inputs.rotation : params.rotation;
      const scl = inputs.scale !== undefined ? inputs.scale : params.scale;
      const m = composeNativeMatrix(inputs.matrix, loc, rot, scl, params);
      obj.matrix.copy(m);
      m.decompose(obj.position, obj.quaternion, obj.scale);
      obj.matrixWorldNeedsUpdate = true;
    }

    state.object = obj;

    return {
      ...primitiveOutputs(obj),
      points: pointsList,
    };
  },
};

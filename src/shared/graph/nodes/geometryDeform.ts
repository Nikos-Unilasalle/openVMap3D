import * as THREE from "three";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { NodeDefinition } from "../types";
import { clearMeshWarning, findFirstMesh, warnMeshRequired } from "../meshRequired";
import { primitiveOutputs } from "./object";
import { numberInput } from "./object";

interface DeformState {
  mesh?: THREE.Mesh;
}

const twistCache = createNodeCache<DeformState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});
const waveCache = createNodeCache<DeformState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});
const explodeCache = createNodeCache<DeformState>((s) => {
  if (s.mesh) disposeObject3D(s.mesh);
});

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Resolves the effective transformation matrix of an input geometry,
 * preferring explicit `inputs.matrix`, then the source object's world matrix or local matrix.
 */
function resolveObjectMatrix(
  inputs: Record<string, unknown>,
  raw: unknown,
  srcMesh: THREE.Mesh,
): THREE.Matrix4 {
  if (inputs.matrix instanceof THREE.Matrix4) {
    return inputs.matrix.clone();
  }
  const inputObj = raw instanceof THREE.Object3D ? raw : srcMesh;
  inputObj.updateMatrixWorld(true);
  return inputObj.matrixWorld?.clone() ?? inputObj.matrix?.clone() ?? srcMesh.matrix?.clone() ?? new THREE.Matrix4();
}

/**
 * Applies transform and metadata to the deformed result mesh.
 */
function applyResultTransform(
  resultMesh: THREE.Mesh,
  matrix: THREE.Matrix4,
  nodeId: string,
  srcMesh: THREE.Mesh,
) {
  resultMesh.castShadow = srcMesh.castShadow;
  resultMesh.receiveShadow = srcMesh.receiveShadow;
  resultMesh.userData = { ...srcMesh.userData, nodeId };
  resultMesh.matrixAutoUpdate = false;
  resultMesh.matrix.copy(matrix);
  matrix.decompose(resultMesh.position, resultMesh.quaternion, resultMesh.scale);
  resultMesh.matrixWorldNeedsUpdate = true;
}

/**
 * 1. Twist, Bend & Taper Parametric Geometry Modifier
 */
export const GEOMETRY_TWIST_BEND_TAPER_NODE: NodeDefinition = {
  type: "geometry/twist-bend-taper",
  label: "Twist / Bend / Taper",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "twist", label: "Twist (°)", type: "value" },
    { id: "bend", label: "Bend (°)", type: "value" },
    { id: "taper", label: "Taper", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    twist: 0,
    bend: 0,
    taper: 0,
    axis: "y",
  },
  paramFields: [
    { id: "twist", label: "Twist (°)", kind: "number", step: 5.0 },
    { id: "bend", label: "Bend (°)", kind: "number", step: 5.0 },
    { id: "taper", label: "Taper", kind: "number", step: 0.1 },
    {
      id: "axis",
      label: "Deform Axis",
      kind: "select",
      options: ["y", "x", "z"],
    },
  ],
  evaluate: (inputs, params, ctx) => {
    const raw = inputs.geometry;
    const srcMesh = raw instanceof THREE.Object3D ? findFirstMesh(raw) : null;
    if (!srcMesh) {
      if (raw) warnMeshRequired(ctx.nodeId, "Twist/Bend/Taper", raw instanceof THREE.Object3D ? raw : null);
      return { geometry: raw, matrix: (raw as any)?.matrix };
    }
    clearMeshWarning(ctx.nodeId);

    const objMatrix = resolveObjectMatrix(inputs, raw, srcMesh);
    const twistDeg = numberInput(inputs.twist, params.twist, 0);
    const bendDeg = numberInput(inputs.bend, params.bend, 0);
    const taperVal = numberInput(inputs.taper, params.taper, 0);
    const axis = String(params.axis || "y").toLowerCase();

    // Fast pass-through if no deformation is requested
    if (Math.abs(twistDeg) < 1e-4 && Math.abs(bendDeg) < 1e-4 && Math.abs(taperVal) < 1e-4) {
      applyResultTransform(srcMesh, objMatrix, ctx.nodeId, srcMesh);
      return primitiveOutputs(srcMesh);
    }

    let state = twistCache.get(ctx.nodeId);
    if (!state) {
      state = {};
      twistCache.set(ctx.nodeId, state);
    }
    if (state.mesh) {
      disposeObject3D(state.mesh);
      state.mesh = undefined;
    }

    const srcGeom = srcMesh.geometry;
    const geom = srcGeom.clone();
    const pos = geom.attributes.position;
    const count = pos.count;

    const twistRad = (twistDeg * Math.PI) / 180;
    const bendRad = (bendDeg * Math.PI) / 180;

    // Determine bounds along chosen axis
    const axisIdx = axis === "x" ? 0 : axis === "z" ? 2 : 1;
    const uIdx = (axisIdx + 1) % 3;
    const vIdx = (axisIdx + 2) % 3;

    let minAxis = Infinity;
    let maxAxis = -Infinity;
    for (let i = 0; i < count; i++) {
      const val = pos.getComponent(i, axisIdx);
      if (val < minAxis) minAxis = val;
      if (val > maxAxis) maxAxis = val;
    }
    const height = Math.max(1e-4, maxAxis - minAxis);

    for (let i = 0; i < count; i++) {
      let hVal = pos.getComponent(i, axisIdx);
      let uVal = pos.getComponent(i, uIdx);
      let vVal = pos.getComponent(i, vIdx);

      const normH = (hVal - minAxis) / height; // 0..1

      // 1. Taper: scale cross-section
      if (Math.abs(taperVal) > 1e-4) {
        const s = Math.max(0.001, 1.0 + taperVal * normH);
        uVal *= s;
        vVal *= s;
      }

      // 2. Twist: rotate cross-section
      if (Math.abs(twistRad) > 1e-4) {
        const angle = twistRad * normH;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const nextU = uVal * cosA - vVal * sinA;
        const nextV = uVal * sinA + vVal * cosA;
        uVal = nextU;
        vVal = nextV;
      }

      // 3. Bend: curve along axis
      if (Math.abs(bendRad) > 1e-4) {
        const radius = height / bendRad;
        const alpha = bendRad * normH;
        hVal = minAxis + radius * Math.sin(alpha);
        uVal += radius * (1.0 - Math.cos(alpha));
      }

      pos.setComponent(i, axisIdx, hVal);
      pos.setComponent(i, uIdx, uVal);
      pos.setComponent(i, vIdx, vVal);
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();

    const resultMesh = new THREE.Mesh(geom, srcMesh.material);
    applyResultTransform(resultMesh, objMatrix, ctx.nodeId, srcMesh);
    state.mesh = resultMesh;

    return primitiveOutputs(resultMesh);
  },
};

/**
 * 2. Wave & Ripple Parametric Geometry Modifier
 */
export const GEOMETRY_WAVE_RIPPLE_NODE: NodeDefinition = {
  type: "geometry/wave-ripple",
  label: "Wave / Ripple",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "amplitude", label: "Amplitude", type: "value" },
    { id: "frequency", label: "Frequency", type: "value" },
    { id: "speed", label: "Speed", type: "value" },
    { id: "decay", label: "Decay (Ripple)", type: "value" },
    { id: "centerX", label: "Center X", type: "value" },
    { id: "centerZ", label: "Center Z", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    amplitude: 0.3,
    frequency: 3.0,
    speed: 2.0,
    decay: 0.2,
    centerX: 0,
    centerZ: 0,
    mode: "ripple",
    space: "local",
  },
  paramFields: [
    { id: "amplitude", label: "Amplitude", kind: "number", step: 0.05 },
    { id: "frequency", label: "Frequency", kind: "number", step: 0.2 },
    { id: "speed", label: "Speed", kind: "number", step: 0.2 },
    { id: "decay", label: "Decay", kind: "number", step: 0.05 },
    { id: "centerX", label: "Center X", kind: "number", step: 0.2 },
    { id: "centerZ", label: "Center Z", kind: "number", step: 0.2 },
    {
      id: "mode",
      label: "Wave Mode",
      kind: "select",
      options: ["ripple", "linear"],
    },
    {
      id: "space",
      label: "Deform Space",
      kind: "select",
      options: ["local", "world"],
    },
  ],
  evaluate: (inputs, params, ctx) => {
    const raw = inputs.geometry;
    const srcMesh = raw instanceof THREE.Object3D ? findFirstMesh(raw) : null;
    if (!srcMesh) {
      if (raw) warnMeshRequired(ctx.nodeId, "Wave/Ripple", raw instanceof THREE.Object3D ? raw : null);
      return { geometry: raw, matrix: (raw as any)?.matrix };
    }
    clearMeshWarning(ctx.nodeId);

    const objMatrix = resolveObjectMatrix(inputs, raw, srcMesh);
    const objScale = new THREE.Vector3();
    const objQuat = new THREE.Quaternion();
    const objPos = new THREE.Vector3();
    objMatrix.decompose(objPos, objQuat, objScale);

    const amp = numberInput(inputs.amplitude, params.amplitude, 0.3);
    const freq = numberInput(inputs.frequency, params.frequency, 3.0);
    const speed = numberInput(inputs.speed, params.speed, 2.0);
    const decay = numberInput(inputs.decay, params.decay, 0.2);
    const cx = numberInput(inputs.centerX, params.centerX, 0);
    const cz = numberInput(inputs.centerZ, params.centerZ, 0);
    const mode = String(params.mode || "ripple").toLowerCase();
    const space = String(params.space || "local").toLowerCase();
    const time = ctx.time ?? 0;

    let state = waveCache.get(ctx.nodeId);
    if (!state) {
      state = {};
      waveCache.set(ctx.nodeId, state);
    }
    if (state.mesh) {
      disposeObject3D(state.mesh);
      state.mesh = undefined;
    }

    const srcGeom = srcMesh.geometry;
    const geom = srcGeom.clone();
    const pos = geom.attributes.position;
    const count = pos.count;

    const invMatrix = space === "world" ? objMatrix.clone().invert() : null;
    const sx = Math.abs(objScale.x) > 1e-4 ? objScale.x : 1;
    const sz = Math.abs(objScale.z) > 1e-4 ? objScale.z : 1;

    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      if (space === "world") {
        // Evaluates ripple in world coordinates taking object's full matrix into account
        const worldPt = new THREE.Vector3(x, y, z).applyMatrix4(objMatrix);
        let displacement = 0;
        if (mode === "ripple") {
          const dx = worldPt.x - cx;
          const dz = worldPt.z - cz;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const attenuation = Math.exp(-dist * decay);
          displacement = amp * Math.sin(dist * freq - time * speed) * attenuation;
        } else {
          displacement = amp * Math.sin(worldPt.x * freq - time * speed);
        }
        worldPt.y += displacement;
        const localPt = worldPt.applyMatrix4(invMatrix!);
        pos.setXYZ(i, localPt.x, localPt.y, localPt.z);
      } else {
        // Local space: takes matrix scaling into account so ripples remain isotropic
        let displacement = 0;
        if (mode === "ripple") {
          const dx = x * sx - cx;
          const dz = z * sz - cz;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const attenuation = Math.exp(-dist * decay);
          displacement = amp * Math.sin(dist * freq - time * speed) * attenuation;
        } else {
          displacement = amp * Math.sin(x * sx * freq - time * speed);
        }
        pos.setY(i, y + displacement);
      }
    }

    pos.needsUpdate = true;
    geom.computeVertexNormals();

    const resultMesh = new THREE.Mesh(geom, srcMesh.material);
    applyResultTransform(resultMesh, objMatrix, ctx.nodeId, srcMesh);
    state.mesh = resultMesh;

    return primitiveOutputs(resultMesh);
  },
};

/**
 * 3. Facet Explode Geometry Modifier
 */
export const GEOMETRY_FACET_EXPLODE_NODE: NodeDefinition = {
  type: "geometry/facet-explode",
  label: "Facet Explode",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "distance", label: "Explosion Dist", type: "value" },
    { id: "randomFactor", label: "Random Spread", type: "value" },
    { id: "scale", label: "Facet Scale", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    distance: 0.5,
    randomFactor: 0.5,
    scale: 0.9,
  },
  paramFields: [
    { id: "distance", label: "Explosion Dist", kind: "number", step: 0.05 },
    { id: "randomFactor", label: "Random Spread", kind: "number", step: 0.05 },
    { id: "scale", label: "Facet Scale", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const raw = inputs.geometry;
    const srcMesh = raw instanceof THREE.Object3D ? findFirstMesh(raw) : null;
    if (!srcMesh) {
      if (raw) warnMeshRequired(ctx.nodeId, "Facet Explode", raw instanceof THREE.Object3D ? raw : null);
      return { geometry: raw, matrix: (raw as any)?.matrix };
    }
    clearMeshWarning(ctx.nodeId);

    const objMatrix = resolveObjectMatrix(inputs, raw, srcMesh);
    const dist = numberInput(inputs.distance, params.distance, 0.5);
    const randFactor = numberInput(inputs.randomFactor, params.randomFactor, 0.5);
    const scale = numberInput(inputs.scale, params.scale, 0.9);

    let state = explodeCache.get(ctx.nodeId);
    if (!state) {
      state = {};
      explodeCache.set(ctx.nodeId, state);
    }
    if (state.mesh) {
      disposeObject3D(state.mesh);
      state.mesh = undefined;
    }

    const srcGeom = srcMesh.geometry;
    // To separate each triangle, we ensure non-indexed geometry
    const nonIndexed = srcGeom.index ? srcGeom.toNonIndexed() : srcGeom.clone();
    const pos = nonIndexed.attributes.position;
    const faceCount = Math.floor(pos.count / 3);

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();

    for (let f = 0; f < faceCount; f++) {
      const idxA = f * 3;
      const idxB = f * 3 + 1;
      const idxC = f * 3 + 2;

      vA.fromBufferAttribute(pos, idxA);
      vB.fromBufferAttribute(pos, idxB);
      vC.fromBufferAttribute(pos, idxC);

      // Face Centroid
      centroid.set(0, 0, 0).add(vA).add(vB).add(vC).divideScalar(3);

      // Face Normal
      edge1.subVectors(vB, vA);
      edge2.subVectors(vC, vA);
      normal.crossVectors(edge1, edge2).normalize();

      // Deterministic pseudo-random variation per face
      const r = pseudoRandom(f + 1);
      const faceDist = dist * (1.0 + (r - 0.5) * randFactor);

      // Displacement
      const displacement = normal.clone().multiplyScalar(faceDist);

      // Apply scale relative to centroid + displacement
      vA.sub(centroid).multiplyScalar(scale).add(centroid).add(displacement);
      vB.sub(centroid).multiplyScalar(scale).add(centroid).add(displacement);
      vC.sub(centroid).multiplyScalar(scale).add(centroid).add(displacement);

      pos.setXYZ(idxA, vA.x, vA.y, vA.z);
      pos.setXYZ(idxB, vB.x, vB.y, vB.z);
      pos.setXYZ(idxC, vC.x, vC.y, vC.z);
    }

    pos.needsUpdate = true;
    nonIndexed.computeVertexNormals();

    const resultMesh = new THREE.Mesh(nonIndexed, srcMesh.material);
    applyResultTransform(resultMesh, objMatrix, ctx.nodeId, srcMesh);
    state.mesh = resultMesh;

    return primitiveOutputs(resultMesh);
  },
};

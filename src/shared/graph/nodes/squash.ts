import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { numberInput } from "./object";

const squashGroupCache = createNodeCache<THREE.Group>();

function getSquashGroup(nodeId: string): THREE.Group {
  let group = squashGroupCache.get(nodeId);
  if (!group) {
    group = new THREE.Group();
    group.userData.nodeId = nodeId;
    squashGroupCache.set(nodeId, group);
  }
  return group;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Squash & Stretch Node — non-uniformly deforms an object along a world axis,
 * pinned at the object's origin so it doesn't drift. The classic landing/
 * impact animation: wire a raycast's proximity or a keyframed value into
 * `squash` (0 = none, 1 = squashed to 40% along the axis) and `stretch`
 * (0..1 widens the perpendicular axes). The deformation is a pure scale on a
 * wrapper group — cheap every frame, no geometry rebuild.
 */
export const SQUASH_STRETCH_NODE: NodeDefinition = {
  type: "modifier/squash-stretch",
  label: "Squash & Stretch",
  category: "structure",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "squash", label: "Squash", type: "value" },
    { id: "stretch", label: "Stretch", type: "value" },
    { id: "axis", label: "Axis", type: "vector" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    squash: 0,
    stretch: 0,
    axis: new THREE.Vector3(0, 1, 0),
  },
  dynamicParamFields: () => [
    { id: "squash", label: "Squash (0–1)", kind: "number", step: 0.05 },
    { id: "stretch", label: "Stretch (0–1)", kind: "number", step: 0.05 },
    { id: "axis", label: "Axis", kind: "vector" },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getSquashGroup(ctx.nodeId);
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;

    const squash = clamp01(numberInput(inputs.squash, params.squash, 0));
    const stretch = clamp01(numberInput(inputs.stretch, params.stretch, 0));

    let axis = params.axis instanceof THREE.Vector3 ? params.axis.clone() : new THREE.Vector3(0, 1, 0);
    if (inputs.axis instanceof THREE.Vector3) axis = inputs.axis.clone();
    if (axis.lengthSq() < 1e-9) axis.set(0, 1, 0);
    axis.normalize();

    group.clear();
    if (!object) return { geometry: group };
    group.add(object);

    const axisScale = 1 - squash * 0.6;
    const perpScale = 1 + stretch * 0.5;

    // Orthonormal basis built on the axis; scale along it, perpendicular plane by perp.
    const ref = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(axis, ref).normalize();
    const w = new THREE.Vector3().crossVectors(axis, v).normalize();

    const U = new THREE.Matrix4().makeBasis(axis, v, w);
    const D = new THREE.Matrix4().makeScale(axisScale, perpScale, perpScale);
    const Uinv = new THREE.Matrix4().copy(U).invert();
    const S = new THREE.Matrix4().multiplyMatrices(U, D).multiply(Uinv);

    // Pin the deformation at the object's world origin so it squashes in place.
    object.updateWorldMatrix(true, false, true);
    const P = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
    const T = new THREE.Matrix4().makeTranslation(P.x, P.y, P.z);
    const Tneg = new THREE.Matrix4().makeTranslation(-P.x, -P.y, -P.z);

    group.matrixAutoUpdate = false;
    group.matrix.multiplyMatrices(T, S).multiply(Tneg);

    return { geometry: group };
  },
};

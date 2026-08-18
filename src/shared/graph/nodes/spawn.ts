import * as THREE from "three";
import { createNodeCache } from "../nodeCaches";
import { NodeDefinition } from "../types";

const RAD = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const groupCache = createNodeCache<THREE.Group>();

function getGroup(nodeId: string): THREE.Group {
  const existing = groupCache.get(nodeId);
  if (existing) return existing;
  const group = new THREE.Group();
  groupCache.set(nodeId, group);
  return group;
}

/** Deterministic pseudo-random number generator (Park-Miller LCG) */
function createPrng(seed: number) {
  let s = Math.floor(Math.abs(seed)) % 2147483647;
  if (s <= 0) s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

interface TriangleSample {
  meshMatrix: THREE.Matrix4;
  meshNormalMatrix: THREE.Matrix3;
  pA: THREE.Vector3;
  pB: THREE.Vector3;
  pC: THREE.Vector3;
  nA: THREE.Vector3;
  nB: THREE.Vector3;
  nC: THREE.Vector3;
  area: number;
}

function collectTriangles(object: THREE.Object3D): TriangleSample[] {
  const triangles: TriangleSample[] = [];

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;

    const geo = child.geometry;
    const posAttr = geo.attributes.position;
    if (!posAttr) return;

    const normAttr = geo.attributes.normal;
    const index = geo.index;

    // NOT updateMatrix(). Every graph-driven mesh has matrixAutoUpdate off
    // and its `matrix` written directly by its node (see object.ts), leaving
    // position/quaternion/scale at their untouched defaults — so
    // updateMatrix() recomputes `matrix` from those defaults and destroys
    // the transform the graph just set, on a mesh that is shared and still
    // being drawn elsewhere. updateWorldMatrix guards that call behind
    // matrixAutoUpdate and still refreshes matrixWorld, which is the part
    // actually needed here.
    // `force` (3rd arg) is required: three skips the recompute unless
    // matrixWorldNeedsUpdate is set, and matrix.copy() never sets it.
    child.updateWorldMatrix(true, false, true);
    const meshMatrix = child.matrixWorld.clone();
    const meshNormalMatrix = new THREE.Matrix3().getNormalMatrix(meshMatrix);

    const getPos = (idx: number) => new THREE.Vector3().fromBufferAttribute(posAttr, idx);
    const getNorm = (idx: number) => {
      if (normAttr) return new THREE.Vector3().fromBufferAttribute(normAttr, idx);
      return new THREE.Vector3(0, 1, 0);
    };

    const triCount = index ? index.count / 3 : posAttr.count / 3;

    for (let i = 0; i < triCount; i++) {
      const idxA = index ? index.getX(i * 3) : i * 3;
      const idxB = index ? index.getX(i * 3 + 1) : i * 3 + 1;
      const idxC = index ? index.getX(i * 3 + 2) : i * 3 + 2;

      const pA = getPos(idxA);
      const pB = getPos(idxB);
      const pC = getPos(idxC);

      const nA = getNorm(idxA);
      const nB = getNorm(idxB);
      const nC = getNorm(idxC);

      // Compute area
      const edge1 = new THREE.Vector3().subVectors(pB, pA);
      const edge2 = new THREE.Vector3().subVectors(pC, pA);
      const cross = new THREE.Vector3().crossVectors(edge1, edge2);
      const area = cross.length() * 0.5;

      if (area > 0.000001) {
        triangles.push({
          meshMatrix,
          meshNormalMatrix,
          pA,
          pB,
          pC,
          nA,
          nB,
          nC,
          area,
        });
      }
    }
  });

  return triangles;
}

function extractItems(rawItems: unknown): THREE.Object3D[] {
  const items: THREE.Object3D[] = [];
  const stack = Array.isArray(rawItems) ? [...rawItems] : [rawItems];

  // Every top-level object is ONE spawnable unit — a Merge's Group, a
  // curve-to-mesh Group, a single mesh, etc. Only explicit lists/arrays are
  // flattened (a List Group of several items still cycles between them);
  // groups are NOT recursed into, otherwise a merged "flower" of two surfaces
  // would spawn as two separate parts instead of one unit.
  while (stack.length > 0) {
    const current = stack.shift();
    if (Array.isArray(current)) {
      stack.unshift(...current);
    } else if (current instanceof THREE.Object3D) {
      items.push(current);
    }
  }
  return items;
}

export const SPAWN_NODE: NodeDefinition = {
  type: "structure/spawn",
  label: "Spawner",
  category: "instance",
  inputs: [
    { id: "support", label: "Support (Surface)", type: "geometry" },
    { id: "items", label: "Items to Spawn", type: "any", owns: true },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    count: 50,
    seed: 1,
    placement: "center",
    scaleMin: 0.8,
    scaleMax: 1.2,
    rotXVar: 0,
    rotYVar: 180,
    rotZVar: 0,
    alignToNormal: 1,
    dispersion: 0,
  },
  paramFields: [
    { id: "count", label: "Count", kind: "number", step: 1, group: "Spawning" },
    { id: "seed", label: "Seed", kind: "number", step: 1, group: "Spawning" },
    { id: "placement", label: "Placement", kind: "select", options: ["center", "base"], group: "Spawning" },
    { id: "alignToNormal", label: "Align to Normal", kind: "boolean", group: "Spawning" },
    { id: "dispersion", label: "Dispersion / Jitter", kind: "number", step: 0.05, group: "Spawning" },
    { id: "scaleMin", label: "Min Scale", kind: "number", step: 0.05, group: "Variation" },
    { id: "scaleMax", label: "Max Scale", kind: "number", step: 0.05, group: "Variation" },
    { id: "rotXVar", label: "Rot X Var (°)", kind: "number", step: 1, degrees: true, group: "Variation" },
    { id: "rotYVar", label: "Rot Y Var (°)", kind: "number", step: 1, degrees: true, group: "Variation" },
    { id: "rotZVar", label: "Rot Z Var (°)", kind: "number", step: 1, degrees: true, group: "Variation" },
  ],
  evaluate: (inputs, params, ctx) => {
    const group = getGroup(ctx.nodeId);
    group.clear();

    const supportObj = inputs.support instanceof THREE.Object3D ? inputs.support : null;
    if (!supportObj) return { geometry: group };

    const items = extractItems(inputs.items);
    if (items.length === 0) return { geometry: group };

    const count = Math.max(1, Math.min(5000, Math.floor(Number(params.count) || 50)));
    const seed = Number(params.seed) || 1;
    const scaleMin = Number.isFinite(Number(params.scaleMin)) ? Number(params.scaleMin) : 0.8;
    const scaleMax = Number.isFinite(Number(params.scaleMax)) ? Number(params.scaleMax) : 1.2;
    const rotXVarRad = (Number.isFinite(Number(params.rotXVar)) ? Number(params.rotXVar) : 0) * RAD;
    const rotYVarRad = (Number.isFinite(Number(params.rotYVar)) ? Number(params.rotYVar) : 180) * RAD;
    const rotZVarRad = (Number.isFinite(Number(params.rotZVar)) ? Number(params.rotZVar) : 0) * RAD;
    const alignToNormal = params.alignToNormal !== undefined ? Boolean(params.alignToNormal) : true;
    const dispersion = Number.isFinite(Number(params.dispersion)) ? Number(params.dispersion) : 0;
    const placement = String(params.placement || "center") === "base" ? "base" : "center";

    const prng = createPrng(seed);

    // Make sure support matrices are updated
    supportObj.updateMatrixWorld(true);

    const triangles = collectTriangles(supportObj);
    if (triangles.length === 0) return { geometry: group };

    // Cumulative area distribution
    const cumulativeAreas: number[] = [];
    let totalArea = 0;
    for (const tri of triangles) {
      totalArea += tri.area;
      cumulativeAreas.push(totalArea);
    }

    for (let i = 0; i < count; i++) {
      // Pick triangle weighted by area
      const rArea = prng() * totalArea;
      let triIdx = cumulativeAreas.findIndex((a) => a >= rArea);
      if (triIdx === -1) triIdx = triangles.length - 1;
      const tri = triangles[triIdx];

      // Barycentric coordinates
      let r1 = prng();
      let r2 = prng();
      if (r1 + r2 > 1) {
        r1 = 1 - r1;
        r2 = 1 - r2;
      }
      const r3 = 1 - r1 - r2;

      // Sampled local position & normal
      const localPos = new THREE.Vector3()
        .addScaledVector(tri.pA, r1)
        .addScaledVector(tri.pB, r2)
        .addScaledVector(tri.pC, r3);

      const localNorm = new THREE.Vector3()
        .addScaledVector(tri.nA, r1)
        .addScaledVector(tri.nB, r2)
        .addScaledVector(tri.nC, r3)
        .normalize();

      // Transform to world space
      const worldPos = localPos.clone().applyMatrix4(tri.meshMatrix);
      const worldNorm = localNorm.clone().applyMatrix3(tri.meshNormalMatrix).normalize();

      // Apply dispersion / jitter along tangent space
      if (dispersion > 0) {
        const jitterVec = new THREE.Vector3(
          (prng() - 0.5) * dispersion,
          (prng() - 0.5) * dispersion,
          (prng() - 0.5) * dispersion,
        );
        worldPos.add(jitterVec);
      }

      // Select item to clone
      const sourceItem = items[i % items.length];
      const instance = sourceItem.clone(true);
      // The item's *world* rotation & scale — same reasoning as collectTriangles:
      // a graph-driven item's matrix is the truth, but a curve-to-mesh (or any
      // modifier) hands back a GROUP whose pose lives on the group. We decompose
      // the forced matrixWorld and keep rotation/scale (the shape's orientation
      // and size) but DROP the item's world position — each copy sits on the
      // support surface rather than being pushed off it by where the item
      // happens to be in the scene.
      // `updateMatrixWorld(true)` (force) refreshes the WHOLE subtree, so
      // Box3.setFromObject below sees correct bounds for graph-driven children.
      sourceItem.updateMatrixWorld(true);
      const itemPos = new THREE.Vector3();
      const itemQuat = new THREE.Quaternion();
      const itemScale = new THREE.Vector3();
      sourceItem.matrixWorld.decompose(itemPos, itemQuat, itemScale);

      // Where the copy's shape should meet the spawn point. A merged "flower"
      // has parts carrying absolute scene offsets, so placing the item's origin
      // would scatter them. Anchor the copy by its actual bounds instead:
      // - "center": the bounds' centre lands on the spawn point.
      // - "base": the bounds' bottom-centre lands on it (sits on the surface).
      const box = new THREE.Box3().setFromObject(sourceItem);
      const worldCenter = box.getCenter(new THREE.Vector3());
      const invItem = new THREE.Matrix4().copy(sourceItem.matrixWorld).invert();
      const centerLocal = worldCenter.clone().applyMatrix4(invItem);
      const anchor =
        placement === "base"
          ? new THREE.Vector3(centerLocal.x, box.min.clone().applyMatrix4(invItem).y, centerLocal.z)
          : centerLocal;

      // Orientation & Rotation (surface normal × variation × item's own rotation)
      const finalQuat = new THREE.Quaternion();
      if (alignToNormal) {
        finalQuat.setFromUnitVectors(UP, worldNorm);
      }

      const rx = (prng() - 0.5) * 2 * rotXVarRad;
      const ry = (prng() - 0.5) * 2 * rotYVarRad;
      const rz = (prng() - 0.5) * 2 * rotZVarRad;
      const varQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));

      finalQuat.multiply(varQuat).multiply(itemQuat);

      // Scale multiplier × item's own scale
      const scaleVal = scaleMin + prng() * (scaleMax - scaleMin);
      const spawnScale = new THREE.Vector3(scaleVal, scaleVal, scaleVal).multiply(itemScale);

      // Compose surface placement, then shift so the chosen anchor lands on the
      // spawn point (no item translation otherwise).
      const spawnMatrix = new THREE.Matrix4().compose(worldPos, finalQuat, spawnScale);
      const anchorOffset = new THREE.Matrix4().makeTranslation(-anchor.x, -anchor.y, -anchor.z);
      const finalMatrix = new THREE.Matrix4().multiplyMatrices(spawnMatrix, anchorOffset);

      instance.matrixAutoUpdate = false;
      instance.matrix.copy(finalMatrix);
      finalMatrix.decompose(instance.position, instance.quaternion, instance.scale);

      group.add(instance);
    }

    return { geometry: group };
  },
};

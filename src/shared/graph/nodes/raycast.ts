import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { getBoundsTree, sampleSurfacePoints } from "../../three/bvh";
import { asColor, numberInput } from "./object";

/** Raycast Node — casts a single ray against a mesh surface (BVH-accelerated). */
function asVector3(val: unknown, fallback: THREE.Vector3): THREE.Vector3 {
  if (val instanceof THREE.Vector3) return val;
  if (val instanceof THREE.Matrix4) return new THREE.Vector3().setFromMatrixPosition(val);
  if (val instanceof THREE.Object3D) {
    return new THREE.Vector3().setFromMatrixPosition(val.matrixWorld);
  }
  // Params loaded from a .tsuji file carry plain {x, y, z} objects, not Vector3s.
  if (val && typeof val === "object" && "x" in val && "y" in val && "z" in val) {
    const v = val as { x: number; y: number; z: number };
    return new THREE.Vector3(v.x, v.y, v.z);
  }
  return fallback.clone();
}

/** Stable signature of a geometry's mesh set — geometry uuid + position version. */
function meshSignature(object: THREE.Object3D | null | undefined): string {
  if (!(object instanceof THREE.Object3D)) return "none";
  let sig = "";
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry?.attributes?.position) {
      const pos = child.geometry.attributes.position as THREE.BufferAttribute;
      sig += `${child.geometry.uuid}:${pos.version};`;
    }
  });
  return sig || "none";
}

/** The nearest ray hit across every mesh of an object, sorted by distance. */
function castRay(
  object: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  firstHitOnly: boolean,
): THREE.Intersection[] {
  const raycaster = new THREE.Raycaster(origin.clone(), direction.clone().normalize(), 0, maxDistance);
  raycaster.firstHitOnly = firstHitOnly;

  const hits: THREE.Intersection[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.attributes?.position) return;
    // updateWorldMatrix (NOT updateMatrix): graph-driven meshes carry their
    // pose in `matrix` with matrixAutoUpdate off — updateMatrix() would
    // recompute `matrix` from the untouched defaults and destroy it. `force`
    // is required since matrix.copy() never sets matrixWorldNeedsUpdate.
    child.updateWorldMatrix(true, false, true);
    // Opt the geometry into the accelerated raycast (builds its BVH once).
    getBoundsTree(child.geometry);
    const h = raycaster.intersectObject(child, false);
    if (h.length > 0) hits.push(...h);
  });
  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

export const RAYCAST_NODE: NodeDefinition = {
  type: "physics/raycast",
  label: "Raycast",
  category: "physics",
  inputs: [
    { id: "geometry", label: "Surface", type: "geometry" },
    { id: "origin", label: "Origin", type: "vector" },
    { id: "direction", label: "Direction", type: "vector" },
    { id: "maxDistance", label: "Max Distance", type: "value" },
  ],
  outputs: [
    { id: "hit", label: "Hit (0/1)", type: "value" },
    { id: "point", label: "Hit Point", type: "vector" },
    { id: "normal", label: "Hit Normal", type: "vector" },
    { id: "distance", label: "Distance", type: "value" },
  ],
  defaultParams: {
    origin: new THREE.Vector3(0, 0, 0),
    direction: new THREE.Vector3(0, 0, -1),
    maxDistance: 100,
    firstHitOnly: 1,
  },
  dynamicParamFields: () => [
    { id: "origin", label: "Origin", kind: "vector" },
    { id: "direction", label: "Direction", kind: "vector" },
    { id: "maxDistance", label: "Max Distance", kind: "number", step: 1 },
    { id: "firstHitOnly", label: "First Hit Only (Fast)", kind: "boolean" },
  ],
  evaluate: (inputs, params) => {
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const zero = new THREE.Vector3();
    if (!object) return { hit: 0, point: zero.clone(), normal: zero.clone(), distance: 0 };

    const origin = asVector3(inputs.origin, params.origin as THREE.Vector3);
    const direction = asVector3(inputs.direction, params.direction as THREE.Vector3);
    if (direction.lengthSq() < 1e-12) return { hit: 0, point: origin.clone(), normal: zero.clone(), distance: 0 };

    const maxDistance = Math.max(0, numberInput(inputs.maxDistance, params.maxDistance, 100));
    const firstHitOnly = params.firstHitOnly !== undefined ? Boolean(params.firstHitOnly) : true;

    const hits = castRay(object, origin, direction, maxDistance, firstHitOnly);
    if (hits.length === 0) return { hit: 0, point: zero.clone(), normal: zero.clone(), distance: 0 };

    const h = hits[0];
    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : zero.clone();
    return { hit: 1, point: h.point.clone(), normal, distance: h.distance };
  },
};

interface BurstState {
  line?: THREE.LineSegments;
  lineGeometry?: THREE.BufferGeometry;
  material?: THREE.LineBasicMaterial;
  signature?: string;
  /** Seeded random ray directions + their per-ray rotation axes, regenerated with the signature. */
  baseDirs: THREE.Vector3[];
  axes: THREE.Vector3[];
}

const burstCache = createNodeCache<BurstState>((s) => {
  if (s.lineGeometry) s.lineGeometry.dispose();
  if (s.material) s.material.dispose();
});

function getBurstState(nodeId: string): BurstState {
  let state = burstCache.get(nodeId);
  if (!state) {
    state = { baseDirs: [], axes: [] };
    burstCache.set(nodeId, state);
  }
  return state;
}

function createPrng(seed: number) {
  let s = Math.floor(Math.abs(seed)) % 2147483647;
  if (s <= 0) s = 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Ray Burst Node — reproduces the three.js `webgl_raycaster_bvh` effect: a field
 * of rays fanning out from random directions towards a mesh's centre, showing
 * where each one hits. Outputs the rays as a LineSegments geometry plus lists of
 * hit points/normals/distances for markers (instance-transform) or logic.
 */
export const RAY_BURST_NODE: NodeDefinition = {
  type: "physics/ray-burst",
  label: "Ray Burst",
  category: "physics",
  inputs: [
    { id: "geometry", label: "Target", type: "geometry" },
    { id: "origin", label: "Center", type: "vector" },
    { id: "count", label: "Ray Count", type: "value" },
    { id: "radius", label: "Radius", type: "value" },
    { id: "seed", label: "Seed", type: "value" },
    { id: "rotate", label: "Rotate (°/s)", type: "value" },
    { id: "time", label: "Time", type: "value" },
  ],
  outputs: [
    { id: "geometry", label: "Rays (Lines)", type: "geometry" },
    { id: "rayOrigins", label: "Ray Origins", type: "list" },
    { id: "hitPoints", label: "Hit Points", type: "list" },
    { id: "hitNormals", label: "Hit Normals", type: "list" },
    { id: "hits", label: "Hits (0/1)", type: "list" },
    { id: "distances", label: "Distances", type: "list" },
  ],
  defaultParams: {
    origin: new THREE.Vector3(0, 0, 0),
    count: 150,
    radius: 3.75,
    seed: 1,
    rotate: 18,
    time: 0,
    color: new THREE.Color(0x444444),
  },
  dynamicParamFields: () => [
    { id: "origin", label: "Center", kind: "vector" },
    { id: "count", label: "Ray Count", kind: "number", step: 10 },
    { id: "radius", label: "Radius", kind: "number", step: 0.1 },
    { id: "seed", label: "Seed", kind: "number", step: 1 },
    { id: "rotate", label: "Rotate (°/s)", kind: "number", step: 1 },
    { id: "color", label: "Ray Color", kind: "color", group: "Style" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getBurstState(ctx.nodeId);

    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    const origin = asVector3(inputs.origin, params.origin as THREE.Vector3);
    const count = Math.max(0, Math.min(4000, Math.round(numberInput(inputs.count, params.count, 150))));
    const radius = Math.max(0, numberInput(inputs.radius, params.radius, 3.75));
    const seed = numberInput(inputs.seed, params.seed, 1);
    const rotate = numberInput(inputs.rotate, params.rotate, 18);
    const time = numberInput(inputs.time, params.time, 0);
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0x444444)));

    const signature = JSON.stringify([
      count,
      radius,
      seed,
      color.getHex(),
      origin.x,
      origin.y,
      origin.z,
      meshSignature(object),
    ]);

    if (signature !== state.signature) {
      state.signature = signature;

      if (state.lineGeometry) {
        state.lineGeometry.dispose();
        state.lineGeometry = undefined;
      }
      if (!state.material) {
        state.material = new THREE.LineBasicMaterial({
          color: 0x444444,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
      }
      state.material.color.copy(color);

      const positions = new Float32Array(count * 2 * 3);
      state.lineGeometry = new THREE.BufferGeometry();
      state.lineGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const prng = createPrng(seed);
      state.baseDirs = [];
      state.axes = [];
      for (let i = 0; i < count; i++) {
        state.baseDirs.push(new THREE.Vector3().randomDirection().multiplyScalar(radius));
        state.axes.push(
          new THREE.Vector3(
            prng() * 2 - 1,
            prng() * 2 - 1,
            prng() * 2 - 1,
          ).normalize(),
        );
      }

      if (!state.line) {
        state.line = new THREE.LineSegments(state.lineGeometry, state.material);
        state.line.frustumCulled = false;
        state.line.userData.nodeId = ctx.nodeId;
      } else {
        state.line.geometry = state.lineGeometry;
      }
    }

    const line = state.line!;
    const lineGeometry = state.lineGeometry!;
    const attr = lineGeometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;

    const rayOrigins: THREE.Vector3[] = [];
    const hitPoints: THREE.Vector3[] = [];
    const hitNormals: THREE.Vector3[] = [];
    const hits: number[] = [];
    const distances: number[] = [];

    const rotateRad = (rotate * Math.PI) / 180;
    for (let i = 0; i < count; i++) {
      const rotated = state.baseDirs[i].clone().applyAxisAngle(state.axes[i], time * rotateRad);
      const rayOrigin = origin.clone().add(rotated);
      rayOrigins.push(rayOrigin.clone());

      let end: THREE.Vector3;
      if (object) {
        const direction = origin.clone().sub(rayOrigin).normalize();
        const result = castRay(object, rayOrigin, direction, Infinity, true);
        if (result.length > 0) {
          const h = result[0];
          end = h.point;
          hitPoints.push(h.point.clone());
          hitNormals.push(h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3());
          hits.push(1);
          distances.push(h.distance);
        } else {
          end = origin.clone();
          hits.push(0);
          distances.push(Infinity);
        }
      } else {
        end = origin.clone();
        hits.push(0);
        distances.push(Infinity);
      }

      arr[i * 6] = rayOrigin.x;
      arr[i * 6 + 1] = rayOrigin.y;
      arr[i * 6 + 2] = rayOrigin.z;
      arr[i * 6 + 3] = end.x;
      arr[i * 6 + 4] = end.y;
      arr[i * 6 + 5] = end.z;
    }
    attr.needsUpdate = true;

    return {
      geometry: line,
      rayOrigins,
      hitPoints,
      hitNormals,
      hits,
      distances,
    };
  },
};

/** Sample Surface Node — N random points + normals over a mesh's surface (area-weighted). */
export const SAMPLE_SURFACE_NODE: NodeDefinition = {
  type: "physics/sample",
  label: "Sample Surface",
  category: "physics",
  inputs: [
    { id: "geometry", label: "Surface", type: "geometry" },
    { id: "count", label: "Count", type: "value" },
    { id: "seed", label: "Seed", type: "value" },
  ],
  outputs: [
    { id: "points", label: "Points", type: "list" },
    { id: "normals", label: "Normals", type: "list" },
  ],
  defaultParams: {
    count: 50,
    seed: 1,
  },
  dynamicParamFields: () => [
    { id: "count", label: "Count", kind: "number", step: 5 },
    { id: "seed", label: "Seed", kind: "number", step: 1 },
  ],
  evaluate: (inputs, params) => {
    const object = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!object) return { points: [], normals: [] };

    const count = Math.max(0, Math.min(20000, Math.round(numberInput(inputs.count, params.count, 50))));
    const seed = numberInput(inputs.seed, params.seed, 1);
    const prng = createPrng(seed);

    const { positions, normals } = sampleSurfacePoints(object, count, prng);
    return { points: positions, normals };
  },
};

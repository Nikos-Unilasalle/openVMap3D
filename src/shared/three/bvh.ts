import * as THREE from "three";
import { isRealMesh } from "./objectKinds";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  type MeshBVH,
} from "three-mesh-bvh";

let bvhInitialized = false;

/**
 * Patches `Mesh.raycast` with the BVH-accelerated version once, globally. It is
 * a drop-in replacement that honours the normal Raycaster contract (world-space
 * ray in, world-space intersections out, matrixWorld respected) and falls back
 * to three's default raycast for geometries that have no bounds tree — so the
 * only cost of the patch is a per-raycast `if`. Pick a mesh's geometry into the
 * fast path by calling `getBoundsTree` on it.
 */
export function initBvhRaycast(): void {
  if (bvhInitialized) return;
  bvhInitialized = true;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
}

const boundsTreeCache = new WeakMap<THREE.BufferGeometry, { version: number; bvh: MeshBVH }>();

/**
 * Returns (building on demand) the MeshBVH for a geometry. Rebuilt only when
 * the position attribute actually changed: deform nodes mutate vertex positions
 * in place keeping the same geometry uuid, so a uuid-only cache would hand back
 * a stale index — the attribute's `version` (bumped by needsUpdate) detects it.
 */
export function getBoundsTree(geometry: THREE.BufferGeometry): MeshBVH {
  const pos = geometry.attributes.position as THREE.BufferAttribute | undefined;
  const version = pos ? pos.version : 0;
  const cached = boundsTreeCache.get(geometry);
  if (cached && cached.version === version && geometry.boundsTree) {
    return cached.bvh;
  }
  if (geometry.boundsTree) {
    geometry.disposeBoundsTree();
  }
  geometry.computeBoundsTree();
  const bvh = geometry.boundsTree as MeshBVH;
  boundsTreeCache.set(geometry, { version, bvh });
  return bvh;
}

/** Frees a geometry's BVH index and its cache entry — call when the geometry is disposed. */
export function disposeGeometryBvh(geometry: THREE.BufferGeometry): void {
  boundsTreeCache.delete(geometry);
  if (geometry.boundsTree) {
    geometry.disposeBoundsTree();
  }
}

interface SurfaceTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  na: THREE.Vector3;
  nb: THREE.Vector3;
  nc: THREE.Vector3;
  area: number;
}

interface SurfaceTriangles {
  version: number;
  triangles: SurfaceTriangle[];
  cumulativeAreas: number[];
  totalArea: number;
}

const surfaceCache = new WeakMap<THREE.BufferGeometry, SurfaceTriangles>();

/**
 * Cached per-geometry triangle distribution (area-weighted) used by the surface
 * sampler and the Spawner's fast path. Built once per position version instead
 * of re-allocating three Vector3s per vertex on every frame.
 */
function getSurfaceTriangles(geometry: THREE.BufferGeometry): SurfaceTriangles {
  const posAttr = geometry.attributes.position as THREE.BufferAttribute | undefined;
  if (!posAttr) return { version: 0, triangles: [], cumulativeAreas: [], totalArea: 0 };

  const version = posAttr.version;
  const cached = surfaceCache.get(geometry);
  if (cached && cached.version === version) return cached;

  const normAttr = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  const index = geometry.index;

  const getPos = (idx: number) => new THREE.Vector3().fromBufferAttribute(posAttr, idx);
  const getNorm = (idx: number) => {
    if (normAttr) return new THREE.Vector3().fromBufferAttribute(normAttr, idx);
    return new THREE.Vector3(0, 1, 0);
  };

  const triangles: SurfaceTriangle[] = [];
  const cumulativeAreas: number[] = [];
  let totalArea = 0;

  const triCount = index ? index.count / 3 : posAttr.count / 3;
  for (let i = 0; i < triCount; i++) {
    const idxA = index ? index.getX(i * 3) : i * 3;
    const idxB = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const idxC = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    const a = getPos(idxA);
    const b = getPos(idxB);
    const c = getPos(idxC);

    const area = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() * 0.5;
    if (area <= 0.000001) continue;

    triangles.push({ a, b, c, na: getNorm(idxA), nb: getNorm(idxB), nc: getNorm(idxC), area });
    totalArea += area;
    cumulativeAreas.push(totalArea);
  }

  const result: SurfaceTriangles = { version, triangles, cumulativeAreas, totalArea };
  surfaceCache.set(geometry, result);
  return result;
}

function binarySearchFloor(cumulative: number[], target: number): number {
  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Samples `count` random points (area-weighted) across the surface of every
 * mesh inside `object`, returning world-space positions and normals. This is
 * the BVH-era replacement for spawn.ts's per-frame `collectTriangles` scan.
 */
export function sampleSurfacePoints(
  object: THREE.Object3D,
  count: number,
  prng: () => number,
): { positions: THREE.Vector3[]; normals: THREE.Vector3[] } {
  const surfaces: {
    triangles: SurfaceTriangles;
    matrix: THREE.Matrix4;
    normalMatrix: THREE.Matrix3;
  }[] = [];

  object.traverse((child) => {
    if (!isRealMesh(child) || !child.geometry) return;
    const tris = getSurfaceTriangles(child.geometry);
    if (tris.triangles.length === 0) return;
    // updateWorldMatrix (NOT updateMatrix): graph-driven meshes carry their
    // pose in `matrix` with matrixAutoUpdate off — updateMatrix() would
    // recompute `matrix` from the untouched defaults and destroy it. `force`
    // (3rd arg) is required since matrix.copy() never sets matrixWorldNeedsUpdate.
    child.updateWorldMatrix(true, false, true);
    surfaces.push({
      triangles: tris,
      matrix: child.matrixWorld.clone(),
      normalMatrix: new THREE.Matrix3().getNormalMatrix(child.matrixWorld),
    });
  });

  const positions: THREE.Vector3[] = [];
  const normals: THREE.Vector3[] = [];

  let totalArea = 0;
  for (const s of surfaces) totalArea += s.triangles.totalArea;
  if (totalArea <= 0 || count <= 0) return { positions, normals };

  for (let i = 0; i < count; i++) {
    const rArea = prng() * totalArea;
    let s = surfaces[0];
    let acc = 0;
    for (const cand of surfaces) {
      acc += cand.triangles.totalArea;
      if (rArea <= acc) {
        s = cand;
        break;
      }
    }

    const tris = s.triangles;
    const triIdx = binarySearchFloor(tris.cumulativeAreas, prng() * tris.totalArea);
    const tri = tris.triangles[triIdx];

    let r1 = prng();
    let r2 = prng();
    if (r1 + r2 > 1) {
      r1 = 1 - r1;
      r2 = 1 - r2;
    }
    const r3 = 1 - r1 - r2;

    const localPos = new THREE.Vector3()
      .addScaledVector(tri.a, r1)
      .addScaledVector(tri.b, r2)
      .addScaledVector(tri.c, r3);
    const localNorm = new THREE.Vector3()
      .addScaledVector(tri.na, r1)
      .addScaledVector(tri.nb, r2)
      .addScaledVector(tri.nc, r3)
      .normalize();

    positions.push(localPos.applyMatrix4(s.matrix));
    normals.push(localNorm.applyMatrix3(s.normalMatrix).normalize());
  }

  return { positions, normals };
}

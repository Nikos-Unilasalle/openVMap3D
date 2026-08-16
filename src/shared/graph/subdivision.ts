import * as THREE from "three";

export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

function vertexOf(positions: Float32Array, i: number): THREE.Vector3 {
  return new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * One-to-four triangle split: each edge gets a midpoint (shared between the
 * two triangles either side of it, via `edgeKey`, so the mesh stays welded
 * rather than splitting apart into disconnected quads-worth of triangles),
 * and each original triangle becomes four — three corner triangles plus one
 * formed entirely of midpoints. Purely a densifier: no vertex ever moves, so
 * repeated application adds resolution without smoothing anything. That's
 * the point of offering it alongside Catmull-Clark below — this is what you
 * want when a Lattice's deformation looks faceted only because the source
 * mesh doesn't have enough vertices for the FFD grid to bend it smoothly,
 * not because the surface itself should round off.
 */
export function simpleSubdivide(mesh: IndexedMesh): IndexedMesh {
  const { positions, indices } = mesh;
  const nextPositions: number[] = Array.from(positions);
  const midpointIndex = new Map<string, number>();

  function midpoint(a: number, b: number): number {
    const key = edgeKey(a, b);
    const existing = midpointIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = nextPositions.length / 3;
    nextPositions.push(
      (positions[a * 3] + positions[b * 3]) / 2,
      (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2,
      (positions[a * 3 + 2] + positions[b * 3 + 2]) / 2,
    );
    midpointIndex.set(key, idx);
    return idx;
  }

  const nextIndices: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    nextIndices.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
  }

  return { positions: new Float32Array(nextPositions), indices: new Uint32Array(nextIndices) };
}

interface EdgeInfo {
  v1: number;
  v2: number;
  /** Indices into the face list of every triangle this edge borders — 1 on a boundary, 2 on a closed manifold. */
  faces: number[];
}

/**
 * Catmull-Clark, generalized to arbitrary-sided input faces rather than
 * assuming quads — the textbook algorithm already works this way (a
 * triangle is just a 3-sided face point/edge point/vertex point case), so a
 * triangle mesh in is handled directly rather than needing a quad-mesh
 * conversion pass first. Every one of our primitives is triangulated, so
 * this is the path that actually gets used.
 *
 * Three passes, standard formulation:
 *  - face point = centroid of the face's own vertices
 *  - edge point = average of the edge's two endpoints and its (up to two)
 *    adjacent face points; falls back to the plain edge midpoint on a
 *    boundary edge, where there's only one adjacent face
 *  - vertex point = (Q + 2R + (n-3)S) / n, where Q is the average of
 *    surrounding face points, R the average of surrounding edge midpoints,
 *    S the original position, and n the vertex's valence — the weighting
 *    that produces the actual curvature (as opposed to `simpleSubdivide`'s
 *    plain midpoints, which never move a vertex at all)
 *
 * Each original face then becomes `n` quads (one per corner: that corner's
 * new vertex point, the edge point on either side, and the face point),
 * triangulated into two triangles apiece since BufferGeometry wants
 * triangles. A boundary vertex (open mesh — a Plane, an OBJ import that
 * isn't watertight) is pulled toward its two boundary edge midpoints
 * instead of using the interior formula, which needs a full ring of faces
 * around the vertex to mean anything.
 */
export function catmullClarkSubdivide(mesh: IndexedMesh): IndexedMesh {
  const { positions, indices } = mesh;
  const vertexCount = positions.length / 3;
  const faces: [number, number, number][] = [];
  for (let i = 0; i < indices.length; i += 3) {
    faces.push([indices[i], indices[i + 1], indices[i + 2]]);
  }

  const facePoints = faces.map(([a, b, c]) =>
    vertexOf(positions, a).add(vertexOf(positions, b)).add(vertexOf(positions, c)).divideScalar(3),
  );

  const edges = new Map<string, EdgeInfo>();
  faces.forEach((face, fi) => {
    const pairs: [number, number][] = [
      [face[0], face[1]],
      [face[1], face[2]],
      [face[2], face[0]],
    ];
    for (const [v1, v2] of pairs) {
      const key = edgeKey(v1, v2);
      let edge = edges.get(key);
      if (!edge) {
        edge = { v1, v2, faces: [] };
        edges.set(key, edge);
      }
      edge.faces.push(fi);
    }
  });

  const vertexFaces: number[][] = Array.from({ length: vertexCount }, () => []);
  faces.forEach((face, fi) => face.forEach((v) => vertexFaces[v].push(fi)));
  const vertexEdges: EdgeInfo[][] = Array.from({ length: vertexCount }, () => []);
  edges.forEach((edge) => {
    vertexEdges[edge.v1].push(edge);
    vertexEdges[edge.v2].push(edge);
  });

  const vertexPoints: THREE.Vector3[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const S = vertexOf(positions, v);
    const adjEdges = vertexEdges[v];
    const boundaryEdges = adjEdges.filter((e) => e.faces.length === 1);

    if (boundaryEdges.length > 0) {
      if (boundaryEdges.length >= 2) {
        const [e1, e2] = boundaryEdges;
        const mid1 = vertexOf(positions, e1.v1).add(vertexOf(positions, e1.v2)).multiplyScalar(0.5);
        const mid2 = vertexOf(positions, e2.v1).add(vertexOf(positions, e2.v2)).multiplyScalar(0.5);
        vertexPoints.push(mid1.add(mid2).add(S.clone().multiplyScalar(2)).divideScalar(4));
      } else {
        vertexPoints.push(S.clone());
      }
      continue;
    }

    const adjFaces = vertexFaces[v];
    const n = adjFaces.length;
    const Q = new THREE.Vector3();
    adjFaces.forEach((fi) => Q.add(facePoints[fi]));
    Q.divideScalar(n);

    const R = new THREE.Vector3();
    adjEdges.forEach((e) => {
      R.add(vertexOf(positions, e.v1).add(vertexOf(positions, e.v2)).multiplyScalar(0.5));
    });
    R.divideScalar(adjEdges.length);

    vertexPoints.push(
      Q.add(R.multiplyScalar(2))
        .add(S.clone().multiplyScalar(n - 3))
        .divideScalar(n),
    );
  }

  const outPositions: number[] = [];
  vertexPoints.forEach((p) => outPositions.push(p.x, p.y, p.z));
  const facePointOffset = vertexPoints.length;
  facePoints.forEach((p) => outPositions.push(p.x, p.y, p.z));

  const edgePointIndex = new Map<string, number>();
  let edgeCursor = facePointOffset + facePoints.length;
  edges.forEach((edge, key) => {
    let point: THREE.Vector3;
    if (edge.faces.length === 2) {
      point = vertexOf(positions, edge.v1)
        .add(vertexOf(positions, edge.v2))
        .add(facePoints[edge.faces[0]])
        .add(facePoints[edge.faces[1]])
        .divideScalar(4);
    } else {
      point = vertexOf(positions, edge.v1).add(vertexOf(positions, edge.v2)).multiplyScalar(0.5);
    }
    outPositions.push(point.x, point.y, point.z);
    edgePointIndex.set(key, edgeCursor);
    edgeCursor++;
  });

  const outIndices: number[] = [];
  faces.forEach((face, fi) => {
    const fp = facePointOffset + fi;
    for (let corner = 0; corner < 3; corner++) {
      const vCurr = face[corner];
      const vNext = face[(corner + 1) % 3];
      const vPrev = face[(corner + 2) % 3];
      const epNext = edgePointIndex.get(edgeKey(vCurr, vNext))!;
      const epPrev = edgePointIndex.get(edgeKey(vPrev, vCurr))!;
      // The quad (vCurr's new point, epNext, face point, epPrev), split on
      // the vCurr–facePoint diagonal — both triangles share that diagonal,
      // so this never introduces a crack.
      outIndices.push(vCurr, epNext, fp);
      outIndices.push(vCurr, fp, epPrev);
    }
  });

  return { positions: new Float32Array(outPositions), indices: new Uint32Array(outIndices) };
}

export type SubdivisionMode = "simple" | "catmull-clark";

export function subdivide(mesh: IndexedMesh, mode: SubdivisionMode, levels: number): IndexedMesh {
  let current = mesh;
  const fn = mode === "catmull-clark" ? catmullClarkSubdivide : simpleSubdivide;
  for (let i = 0; i < levels; i++) current = fn(current);
  return current;
}

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NodeDefinition, ParamFieldDef } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asVector3, composeNativeMatrix } from "./transform";
import {
  applyMaterialParams,
  COMMON_MATERIAL_PARAM_FIELDS,
  COMMON_PRIMITIVE_INPUTS,
  COMMON_PRIMITIVE_OUTPUTS,
  extractMaterialParams,
  extractTextureParams,
  prefixedMaterialParamFields,
  primitiveOutputs,
} from "./object";
import { DEFAULT_PROFILE_POINTS, evalProfileCurve, ProfilePoint } from "../profileCurve";
import { setCurveNodePose, getCurveNodePose } from "../curvePoseStore";

interface CurveNodeState {
  mesh?: THREE.Mesh;
  /**
   * The filled extruded surface (Curve to Mesh's Surface mode) — a sibling of
   * `mesh`, both parented under `group`, which carries the native pose so the
   * gizmo moves the whole thing.
   */
  surface?: THREE.Mesh;
  group?: THREE.Group;
  /** The dark-gray polyline that renders a bare curve node (Curve from Points, Curve Primitive). */
  previewLine?: THREE.Line;
  /**
   * Only set when the material is this node's own. Curve Deform reuses the
   * material of the mesh it deforms, which belongs to the upstream node's
   * cache — disposing that on delete would blank out the original object.
   */
  ownMaterial?: THREE.Material;
  surfaceMaterial?: THREE.Material;
  /** Everything the cached geometry was built from, serialized — see the rebuild guard in Curve to Mesh. */
  geometrySignature?: string;
  surfaceSignature?: string;
  previewSignature?: string;
  /** Whether the node's `curve` input had a wire at last evaluate — lets the param panel show "Closed" only for the fallback curve. */
  curveWired?: boolean;
}

const curveCache = createNodeCache<CurveNodeState>((s) => {
  if (s.mesh) s.mesh.geometry.dispose();
  if (s.surface) s.surface.geometry.dispose();
  if (s.previewLine) s.previewLine.geometry.dispose();
  if (s.ownMaterial) s.ownMaterial.dispose();
  if (s.surfaceMaterial) s.surfaceMaterial.dispose();
  if (s.previewLine) (s.previewLine.material as THREE.Material).dispose();
});

function getState(nodeId: string): CurveNodeState {
  let state = curveCache.get(nodeId);
  if (!state) {
    state = {};
    curveCache.set(nodeId, state);
  }
  return state;
}

/**
 * Builds a solid extruded from a closed 3D point loop — the filled surface of
 * Curve to Mesh's Surface mode. The loop is projected onto its own plane
 * (Newell's method for the normal, robust for slightly non-planar loops),
 * turned into a 2D Shape (concave-safe Earcut triangulation) and extruded by
 * `depth`, then mapped back to 3D so the surface "epouses" the curve's points
 * exactly and the extrusion runs along the loop's normal. The winding is
 * forced CCW so the top face points along the normal.
 */
function buildExtrudedSurfaceGeometry(points: THREE.Vector3[], depth: number, curveSegments = 24): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  if (points.length < 3) return geo;

  // Sampled closed curves repeat the start point at the end — drop it.
  let pts = points;
  if (pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-9) pts = pts.slice(0, -1);
  if (pts.length < 3) return geo;

  const normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
  normal.normalize();

  const ref = Math.abs(normal.z) < 0.999 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(normal, ref).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u).normalize();

  const origin = new THREE.Vector3();
  for (const p of pts) origin.add(p);
  origin.divideScalar(pts.length);

  let contour2d = pts.map((p) => {
    const d = new THREE.Vector3().subVectors(p, origin);
    return new THREE.Vector2(d.dot(u), d.dot(v));
  });
  if (THREE.ShapeUtils.area(contour2d) < 0) contour2d.reverse();

  const extruded = new THREE.ExtrudeGeometry(new THREE.Shape(contour2d), {
    depth: Math.max(0, depth),
    bevelEnabled: false,
    curveSegments: Math.max(3, Math.round(curveSegments)),
  });
  extruded.translate(0, 0, -depth / 2);

  // Local (x,y,z) -> world: origin + u*x + v*y + normal*z
  const matrix = new THREE.Matrix4().set(
    u.x, v.x, normal.x, origin.x,
    u.y, v.y, normal.y, origin.y,
    u.z, v.z, normal.z, origin.z,
    0, 0, 0, 1
  );
  extruded.applyMatrix4(matrix);
  extruded.computeVertexNormals();
  return extruded;
}

/**
 * Builds a *minimal surface* — the Laplacian relaxation (harmonic) surface a
 * closed 3D curve bounds, with no planarity constraint. A disk-topology mesh is
 * generated (a centre vertex + concentric rings of interior vertices around a
 * boundary ring), the boundary is locked onto the discretised curve, and every
 * interior vertex is repeatedly moved to the average of its neighbours. After
 * enough iterations the interior relaxes into a smooth surface that "épouse"
 * a genuinely non-planar boundary — unlike `buildExtrudedSurfaceGeometry`,
 * which projects everything onto the loop's best-fit plane.
 */
function buildLaplacianSurfaceGeometry(boundaryIn: THREE.Vector3[], rings: number, iterations: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  if (boundaryIn.length < 3) return geo;

  let boundary = boundaryIn;
  if (boundary[0].distanceToSquared(boundary[boundary.length - 1]) < 1e-9) boundary = boundary.slice(0, -1);
  const S = boundary.length;
  if (S < 3) return geo;

  rings = Math.max(1, Math.min(24, Math.round(rings || 8)));
  iterations = Math.max(0, Math.round(iterations || 60));

  const center = new THREE.Vector3();
  for (const b of boundary) center.add(b);
  center.divideScalar(S);

  // [center(0), ring1(1..S), ring2, ..., boundary].
  let pos: THREE.Vector3[] = [center.clone()];
  for (let i = 1; i <= rings; i++) {
    const rho = i / (rings + 1);
    for (let j = 0; j < S; j++) pos.push(center.clone().lerp(boundary[j], rho));
  }
  for (let j = 0; j < S; j++) pos.push(boundary[j].clone());

  const idx = (ring: number, j: number) => {
    if (ring === 0) return 0;
    if (ring === rings + 1) return 1 + rings * S + j;
    return 1 + (ring - 1) * S + j;
  };

  // Jacobi relaxation: every interior vertex moves to the mean of its
  // neighbours each pass; the boundary ring stays fixed.
  for (let iter = 0; iter < iterations; iter++) {
    const next = pos.map((p) => p.clone());
    for (let i = 1; i <= rings; i++) {
      for (let j = 0; j < S; j++) {
        const v = next[idx(i, j)];
        v.copy(pos[idx(i - 1, j)]);
        v.add(pos[idx(i + 1, j)]);
        v.add(pos[idx(i, (j + 1) % S)]);
        v.add(pos[idx(i, (j - 1 + S) % S)]);
        v.multiplyScalar(0.25);
      }
    }
    const c = next[0];
    c.set(0, 0, 0);
    for (let j = 0; j < S; j++) c.add(pos[idx(1, j)]);
    c.multiplyScalar(1 / S);
    pos = next;
  }

  const positions: number[] = [];
  const uvs: number[] = [0.5, 0];
  for (const p of pos) positions.push(p.x, p.y, p.z);
  for (let i = 1; i <= rings; i++) {
    const v = i / (rings + 1);
    for (let j = 0; j < S; j++) uvs.push(j / S, v);
  }
  for (let j = 0; j < S; j++) uvs.push(j / S, 1);

  const indices: number[] = [];
  for (let j = 0; j < S; j++) indices.push(0, idx(1, j), idx(1, (j + 1) % S));
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < S; j++) {
      const a = idx(i, j);
      const b = idx(i, (j + 1) % S);
      const c = idx(i + 1, (j + 1) % S);
      const d = idx(i + 1, j);
      // Wound to match the centre fan — the previous ordering ran the ring band
      // the opposite way, flipping its normals and leaving a dark disc of
      // back-facing faces around the pole.
      indices.push(a, c, b);
      indices.push(a, d, c);
    }
  }

  geo.setIndex(indices);
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/** True when a curve forms a closed loop (a closed CatmullRom, or any curve whose sampled ends coincide). */
export function isCurveClosed(curve: THREE.Curve<THREE.Vector3>): boolean {
  if ((curve as THREE.CatmullRomCurve3).closed) return true;
  const pts = curve.getPoints(96);
  if (pts.length < 2) return false;
  return pts[0].distanceToSquared(pts[pts.length - 1]) < 1e-9;
}

const CURVE_PREVIEW_COLOR = 0x9ca3af;

/**
 * Applies the node's native pose (location/rotation/scale + wired matrix) to an
 * object, skipping it while the gizmo is dragging (see object.ts's guard).
 */
function applyNativePose(
  obj: THREE.Object3D,
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  ctx: { nodeId: string; liveEditNodeId?: string | null },
): void {
  if (ctx.nodeId !== ctx.liveEditNodeId) {
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
  }
}

const CURVE_TRANSFORM_INPUT = { id: "matrix", label: "Matrix", type: "matrix" as const };

const CURVE_TRANSFORM_DEFAULTS = {
  location: new THREE.Vector3(0, 0, 0),
  rotation: new THREE.Vector3(0, 0, 0),
  scale: new THREE.Vector3(1, 1, 1),
};

function curveTransformFields(): ParamFieldDef[] {
  return [
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
  ];
}

/**
 * The cached dark-gray polyline that renders a bare curve node's `geometry` so
 * the curve is visible in the viewport (Curve from Points, Curve Primitive).
 * Rebuilt only when the sampled points change.
 */
function getCurvePreviewLine(state: CurveNodeState, nodeId: string, curve: THREE.Curve<THREE.Vector3>): THREE.Line {
  if (!state.previewLine) {
    state.previewLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: CURVE_PREVIEW_COLOR }),
    );
    state.previewLine.userData.nodeId = nodeId;
  }
  const points = curve.getPoints(128);
  const sig = JSON.stringify(points.map((p) => [p.x, p.y, p.z]));
  if (sig !== state.previewSignature) {
    state.previewSignature = sig;
    state.previewLine.geometry.dispose();
    state.previewLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }
  return state.previewLine;
}

/** A param that may be missing or unparseable, as a finite number. `Number(undefined) ?? fallback` is NaN — ?? only catches null/undefined, never the NaN Number() hands back. */
function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** The stand-in control points every curve node falls back to when it has nothing else — a readable S shape rather than an empty scene. */
export const DEFAULT_CURVE_POINTS: THREE.Vector3[] = [
  new THREE.Vector3(-2, 0, 0),
  new THREE.Vector3(-0.5, 1.5, 0),
  new THREE.Vector3(0.5, -1.5, 0),
  new THREE.Vector3(2, 0, 0),
];

/** Cloned per use — the constant above is shared by every node instance, and a Vector3 handed to a curve must never be one another node can mutate. */
function defaultCurvePoints(): THREE.Vector3[] {
  return DEFAULT_CURVE_POINTS.map((p) => p.clone());
}

/** The first Mesh in an object tree — what a modifier node actually has vertices to work with. */
export function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  if (root instanceof THREE.Mesh) return root;
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) found = child;
  });
  return found;
}

/**
 * `target`'s pose expressed in `root`'s parent's space — i.e. root's own
 * matrix plus every matrix down the chain to target. Not `matrixWorld`:
 * during evaluation these objects may not be parented into the rendered scene
 * yet, so the cached world matrices are stale or plain identity.
 */
export function matrixWithin(root: THREE.Object3D, target: THREE.Object3D): THREE.Matrix4 {
  const chain: THREE.Object3D[] = [];
  let current: THREE.Object3D | null = target;
  while (current) {
    chain.push(current);
    if (current === root) break;
    current = current.parent;
  }

  const matrix = new THREE.Matrix4();
  for (const node of chain) {
    if (node.matrixAutoUpdate) node.updateMatrix();
    matrix.premultiply(node.matrix);
  }
  return matrix;
}

/**
 * Bezier mode reads the point list as anchor, handle, handle, anchor, handle,
 * handle, anchor… — so it only consumes points in groups of three past the
 * first. A list whose length isn't 3n+1 used to drop its tail silently: a
 * 6-point list drew one segment and ignored the last two points, which looked
 * like two dead handles in the viewport. The leftovers now close the path with
 * whatever degree they can support (2 spare = quadratic, 1 = straight), so
 * every point the operator placed is on screen.
 */
export function buildBezierPath(pts: THREE.Vector3[], closed = false): THREE.CurvePath<THREE.Vector3> {
  const path = new THREE.CurvePath<THREE.Vector3>();

  let i = 0;
  for (; i + 3 < pts.length; i += 3) {
    path.add(new THREE.CubicBezierCurve3(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
  }

  const tail = pts.length - 1 - i; // points left after the last full segment
  if (tail === 2) path.add(new THREE.QuadraticBezierCurve3(pts[i], pts[i + 1], pts[i + 2]));
  else if (tail === 1) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));

  const last = pts[pts.length - 1];
  if (closed && !last.equals(pts[0])) {
    path.add(new THREE.LineCurve3(last, pts[0]));
  }

  return path;
}

/** Generates custom tube geometry with variable radius R(t) = baseRadius * evalProfile(t) and start/end trimming */
export function createVariableThicknessTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments = 64,
  radialSegments = 8,
  baseRadius = 0.1,
  profile: ProfilePoint[] = DEFAULT_PROFILE_POINTS,
  _closed = false,
  startProgress = 0.0,
  endProgress = 1.0
): THREE.BufferGeometry {
  const s = Math.max(0, Math.min(1, startProgress));
  const e = Math.max(0, Math.min(1, endProgress));

  // If start and end are virtually identical, produce empty geometry
  if (Math.abs(e - s) < 1e-5) {
    return new THREE.BufferGeometry();
  }

  // Sample points and tangents along the trimmed portion of the curve
  const samplePoints: THREE.Vector3[] = [];
  const tangents: THREE.Vector3[] = [];

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const u = Math.max(0, Math.min(1, s + t * (e - s)));
    samplePoints.push(curve.getPointAt(u));
    const tan = curve.getTangentAt(u);
    if (e < s) tan.negate();
    tangents.push(tan.normalize());
  }

  // Compute parallel-transport Frenet frames along samplePoints
  const normals: THREE.Vector3[] = [];
  const binormals: THREE.Vector3[] = [];

  let normal = new THREE.Vector3();
  const initialTan = tangents[0];
  if (Math.abs(initialTan.x) <= Math.abs(initialTan.y) && Math.abs(initialTan.x) <= Math.abs(initialTan.z)) {
    normal.set(1, 0, 0);
  } else if (Math.abs(initialTan.y) <= Math.abs(initialTan.x) && Math.abs(initialTan.y) <= Math.abs(initialTan.z)) {
    normal.set(0, 1, 0);
  } else {
    normal.set(0, 0, 1);
  }
  const vec = new THREE.Vector3().crossVectors(initialTan, normal).normalize();
  normal.crossVectors(initialTan, vec).normalize();

  normals.push(normal.clone());
  binormals.push(new THREE.Vector3().crossVectors(initialTan, normal).normalize());

  for (let i = 1; i <= tubularSegments; i++) {
    const prevT = tangents[i - 1];
    const currT = tangents[i];
    const prevN = normals[i - 1];

    const axis = new THREE.Vector3().crossVectors(prevT, currT);
    if (axis.lengthSq() > 1e-7) {
      axis.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(prevT.dot(currT), -1, 1));
      normal = prevN.clone().applyAxisAngle(axis, angle);
    } else {
      normal = prevN.clone();
    }
    normals.push(normal);
    binormals.push(new THREE.Vector3().crossVectors(currT, normal).normalize());
  }

  const positions: number[] = [];
  const normalAttrs: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertex = new THREE.Vector3();
  const ringNormal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments; // 0 to 1 along the active visible trimmed mesh
    const P = samplePoints[i];
    const N = normals[i];
    const B = binormals[i];

    // Evaluate profile curve along the active trimmed mesh [0, 1]
    const radiusMultiplier = evalProfileCurve(profile, t);
    const currentRadius = Math.max(0.0001, baseRadius * radiusMultiplier);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = -Math.cos(theta);

      // Normal in circle plane
      ringNormal.x = cos * N.x + sin * B.x;
      ringNormal.y = cos * N.y + sin * B.y;
      ringNormal.z = cos * N.z + sin * B.z;
      ringNormal.normalize();

      normalAttrs.push(ringNormal.x, ringNormal.y, ringNormal.z);

      // Vertex position
      vertex.x = P.x + currentRadius * ringNormal.x;
      vertex.y = P.y + currentRadius * ringNormal.y;
      vertex.z = P.z + currentRadius * ringNormal.z;

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(t, v);
    }
  }

  // Face indices
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = (radialSegments + 1) * i + j;
      const b = (radialSegments + 1) * (i + 1) + j;
      const c = (radialSegments + 1) * (i + 1) + (j + 1);
      const d = (radialSegments + 1) * i + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normalAttrs, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

/** 1. Curve from Points Node */

/** Builds a curve (linear / bezier / catmull-rom) through `pts` — shared by the
 * local preview and the pose-baked world output. */
function buildPointsCurve(pts: THREE.Vector3[], type: string, closed: boolean, tension: number): THREE.Curve<THREE.Vector3> {
  if (type === "linear") {
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < pts.length - 1; i++) path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    if (closed && pts.length > 2) path.add(new THREE.LineCurve3(pts[pts.length - 1], pts[0]));
    return path;
  }
  if (type === "bezier" && pts.length >= 4) return buildBezierPath(pts, closed);
  return new THREE.CatmullRomCurve3(pts, closed, "catmullrom", tension);
}

export const CURVE_FROM_POINTS_NODE: NodeDefinition = {
  type: "curve/from_points",
  label: "Curve from Points",
  category: "curve",
  inputs: [
    { id: "points", label: "Points", type: "list" },
    { id: "closed", label: "Closed", type: "value" },
    { id: "tension", label: "Tension", type: "value" },
    CURVE_TRANSFORM_INPUT,
  ],
  outputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "geometry", label: "Curve Preview", type: "geometry" },
  ],
  defaultParams: {
    type: "catmull",
    closed: false,
    tension: 0.5,
    pointsList: defaultCurvePoints(),
    ...CURVE_TRANSFORM_DEFAULTS,
  },
  dynamicParamFields: () => [
    ...curveTransformFields(),
    { id: "type", label: "Type", kind: "select", options: ["catmull", "bezier", "linear"] },
    { id: "closed", label: "Closed", kind: "boolean" },
    { id: "tension", label: "Tension", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    let pts: THREE.Vector3[] = [];
    if (Array.isArray(inputs.points) && inputs.points.length >= 2) {
      pts = inputs.points.map((p) => asVector3(p, new THREE.Vector3()));
    } else if (Array.isArray(params.pointsList) && params.pointsList.length >= 2) {
      pts = (params.pointsList as unknown[]).map((p) => asVector3(p, new THREE.Vector3()));
    } else {
      pts = defaultCurvePoints();
    }

    const closed = inputs.closed !== undefined ? Boolean(inputs.closed) : Boolean(params.closed);
    const type = String(params.type || "catmull");
    const tension = inputs.tension !== undefined ? asNumber(inputs.tension, 0.5) : asNumber(params.tension, 0.5);

    let curve: THREE.Curve<THREE.Vector3>;
    curve = buildPointsCurve(pts, type, closed, tension);

    const preview = getCurvePreviewLine(getState(ctx.nodeId), ctx.nodeId, curve);
    applyNativePose(preview, inputs, params, ctx);

    // Record where the gizmo put this curve so curve-building consumers (Curve
    // to Mesh) can compose it into their own matrix — keeping the geometry they
    // build local, rather than baking a world offset into it.
    setCurveNodePose(ctx.nodeId, composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));

    return { curve, geometry: preview };
  },
};

/** 2. Curve Primitive Node */
export const CURVE_PRIMITIVE_NODE: NodeDefinition = {
  type: "curve/primitive",
  label: "Curve Primitive",
  category: "curve",
  inputs: [
    { id: "radius", label: "Radius / Size", type: "value" },
    { id: "height", label: "Height", type: "value" },
    { id: "turns", label: "Turns", type: "value" },
    CURVE_TRANSFORM_INPUT,
  ],
  outputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "geometry", label: "Curve Preview", type: "geometry" },
  ],
  defaultParams: {
    primitiveType: "helix",
    radius: 1.5,
    height: 3.0,
    turns: 3.0,
    ...CURVE_TRANSFORM_DEFAULTS,
  },
  dynamicParamFields: () => [
    ...curveTransformFields(),
    { id: "primitiveType", label: "Shape", kind: "select", options: ["helix", "circle", "line", "rectangle"] },
    { id: "radius", label: "Radius / Size", kind: "number", step: 0.1 },
    { id: "height", label: "Height", kind: "number", step: 0.2 },
    { id: "turns", label: "Turns", kind: "number", step: 0.5 },
  ],
  evaluate: (inputs, params, ctx) => {
    const shape = String(params.primitiveType || "helix");
    const radius = inputs.radius !== undefined ? asNumber(inputs.radius, 1.5) : asNumber(params.radius, 1.5);
    const height = inputs.height !== undefined ? asNumber(inputs.height, 3.0) : asNumber(params.height, 3.0);
    const turns = inputs.turns !== undefined ? asNumber(inputs.turns, 3.0) : asNumber(params.turns, 3.0);

    let curve: THREE.Curve<THREE.Vector3>;

    if (shape === "circle") {
      const steps = 64;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      curve = new THREE.CatmullRomCurve3(pts, true);
    } else if (shape === "line") {
      curve = new THREE.LineCurve3(new THREE.Vector3(0, -height / 2, 0), new THREE.Vector3(0, height / 2, 0));
    } else if (shape === "rectangle") {
      const path = new THREE.CurvePath<THREE.Vector3>();
      const hw = radius;
      const hh = height / 2 || radius;
      path.add(new THREE.LineCurve3(new THREE.Vector3(-hw, 0, -hh), new THREE.Vector3(hw, 0, -hh)));
      path.add(new THREE.LineCurve3(new THREE.Vector3(hw, 0, -hh), new THREE.Vector3(hw, 0, hh)));
      path.add(new THREE.LineCurve3(new THREE.Vector3(hw, 0, hh), new THREE.Vector3(-hw, 0, hh)));
      path.add(new THREE.LineCurve3(new THREE.Vector3(-hw, 0, hh), new THREE.Vector3(-hw, 0, -hh)));
      curve = path;
    } else {
      // Helix / Spiral
      const steps = Math.max(32, Math.round(turns * 32));
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = t * turns * Math.PI * 2;
        const y = (t - 0.5) * height;
        pts.push(new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius));
      }
      curve = new THREE.CatmullRomCurve3(pts, false);
    }

    const preview = getCurvePreviewLine(getState(ctx.nodeId), ctx.nodeId, curve);
    applyNativePose(preview, inputs, params, ctx);

    setCurveNodePose(ctx.nodeId, composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));

    return { curve, geometry: preview };
  },
};

/** 3. Curve to Mesh Node (Variable Thickness Profile) */
export const CURVE_TO_MESH_NODE: NodeDefinition = {
  type: "curve/to_mesh",
  label: "Curve to Mesh",
  category: "curve",
  inputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "thickness", label: "Thickness", type: "value" },
    { id: "startProgress", label: "Start %", type: "value" },
    { id: "endProgress", label: "End %", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
    { id: "surfaceMaterial", label: "Surface Material", type: "material" },
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    thickness: 0.15,
    startProgress: 0.0,
    endProgress: 1.0,
    tubularSegments: 64,
    radialSegments: 12,
    closed: false,
    color: new THREE.Color(0x38bdf8),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: false,
    roughness: 0.4,
    metalness: 0.1,
    wireframe: false,
    opacity: 1.0,
    surfaceColor: new THREE.Color(0x38bdf8),
    surfaceEmissive: new THREE.Color(0x000000),
    surfaceEmissiveIntensity: 1.0,
    surfaceShadeless: false,
    surfaceRoughness: 0.4,
    surfaceMetalness: 0.1,
    surfaceWireframe: false,
    surfaceOpacity: 1.0,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
    profile: DEFAULT_PROFILE_POINTS,
    pointsList: defaultCurvePoints(),
    doubleSided: true,
    surface: false,
    surfaceMode: "extrude",
    depth: 0.2,
    surfaceSegments: 64,
    surfaceRings: 8,
    surfaceIterations: 60,
    showCurve: 1,
  },
  dynamicParamFields: (instance) => [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },

    { id: "thickness", label: "Base Thickness", kind: "number", step: 0.02, group: "Geometry" },
    { id: "startProgress", label: "Start %", kind: "number", step: 0.01, group: "Geometry" },
    { id: "endProgress", label: "End %", kind: "number", step: 0.01, group: "Geometry" },
    { id: "tubularSegments", label: "Length Segments", kind: "number", step: 4, group: "Geometry" },
    { id: "radialSegments", label: "Radial Sides", kind: "number", step: 1, group: "Geometry" },
    { id: "doubleSided", label: "Double Sided", kind: "boolean", group: "Geometry" },
    ...(getState(instance.id).curveWired ? [] : [{ id: "closed", label: "Closed", kind: "boolean" } as const]),

    { id: "surface", label: "Surface (closed curve)", kind: "boolean", group: "Surface" },
    ...(Boolean(instance.params.surface)
      ? [
          {
            id: "surfaceMode",
            label: "Surface Type",
            kind: "select",
            options: ["extrude", "laplacian"],
            group: "Surface",
          } as ParamFieldDef,
          ...(String(instance.params.surfaceMode) === "laplacian"
            ? [
                { id: "surfaceRings", label: "Relaxation Rings", kind: "number", step: 1, group: "Surface" } as const,
                { id: "surfaceIterations", label: "Relaxation Iterations", kind: "number", step: 10, group: "Surface" } as const,
              ]
            : [
                { id: "depth", label: "Depth", kind: "number", step: 0.05, group: "Surface" } as const,
                { id: "surfaceSegments", label: "Surface Segments", kind: "number", step: 4, group: "Surface" } as const,
              ]),
          { id: "showCurve", label: "Show Curve", kind: "boolean", group: "Surface" } as const,
        ]
      : []),

    { id: "profile", label: "Thickness Profile", kind: "curve_profile", group: "Profile" },

    ...COMMON_MATERIAL_PARAM_FIELDS.map((f) => ({ ...f, group: "Curve Material" })),
    { id: "uvScaleX", label: "UV Scale X", kind: "number", step: 0.1, group: "Curve Material" },
    { id: "uvScaleY", label: "UV Scale Y", kind: "number", step: 0.1, group: "Curve Material" },
    { id: "uvOffsetX", label: "UV Offset X", kind: "number", step: 0.05, group: "Curve Material" },
    { id: "uvOffsetY", label: "UV Offset Y", kind: "number", step: 0.05, group: "Curve Material" },

    ...(Boolean(instance.params.surface)
      ? prefixedMaterialParamFields("surface", "Surface Material")
      : []),
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    // Fallback curve if none wired — "Closed" only shapes this built-in list;
    // a connected curve brings its own closedness.
    let curve: THREE.Curve<THREE.Vector3>;
    state.curveWired = inputs.curve instanceof THREE.Curve;
    if (inputs.curve instanceof THREE.Curve) {
      curve = inputs.curve;
    } else {
      const ptsList = Array.isArray(params.pointsList) && params.pointsList.length >= 2
        ? (params.pointsList as unknown[]).map((p) => asVector3(p, new THREE.Vector3()))
        : defaultCurvePoints();
      curve = new THREE.CatmullRomCurve3(ptsList, Boolean(params.closed));
    }

    const thickness = inputs.thickness !== undefined ? asNumber(inputs.thickness, 0.15) : asNumber(params.thickness, 0.15);
    const startProgress = Math.max(0, Math.min(1, inputs.startProgress !== undefined ? asNumber(inputs.startProgress, 0.0) : asNumber(params.startProgress, 0.0)));
    const endProgress = Math.max(0, Math.min(1, inputs.endProgress !== undefined ? asNumber(inputs.endProgress, 1.0) : asNumber(params.endProgress, 1.0)));
    const tubularSegments = Math.max(8, Math.round(asNumber(params.tubularSegments, 64)));
    const radialSegments = Math.max(3, Math.round(asNumber(params.radialSegments, 12)));
    const profile = (Array.isArray(params.profile) ? params.profile : DEFAULT_PROFILE_POINTS) as ProfilePoint[];

    const closed = isCurveClosed(curve);
    const surface = Boolean(params.surface);
    const surfaceMode = String(params.surfaceMode || "extrude");
    const depth = Math.max(0, asNumber(params.depth, 0.2));
    const surfaceSegments = Math.max(8, Math.round(asNumber(params.surfaceSegments, 64)));
    const surfaceRings = Math.max(1, Math.round(asNumber(params.surfaceRings, 8)));
    const surfaceIterations = Math.max(0, Math.round(asNumber(params.surfaceIterations, 60)));
    const showCurve = Boolean(params.showCurve ?? true);

    // Stable group carrying the native pose — both the tube and (optionally)
    // the surface live under it, so the gizmo moves them together and the tube
    // can be hidden independently of the surface.
    if (!state.group) {
      state.group = new THREE.Group();
      state.group.userData.nodeId = ctx.nodeId;
    }
    const group = state.group;
    group.clear();

    if (!state.mesh) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      state.mesh = mesh;
      state.ownMaterial = mat;
    }

    const mesh = state.mesh;
    mesh.matrixAutoUpdate = false;
    mesh.matrix.identity();
    // Hide the tube while Surface mode is on and the operator chose to keep
    // only the filled surface.
    mesh.visible = !surface || showCurve;

    const signature = JSON.stringify([
      curve.toJSON(),
      tubularSegments,
      radialSegments,
      thickness,
      profile,
      closed,
      startProgress,
      endProgress,
    ]);
    if (signature !== state.geometrySignature) {
      state.geometrySignature = signature;
      mesh.geometry.dispose();
      mesh.geometry = createVariableThicknessTubeGeometry(
        curve,
        tubularSegments,
        radialSegments,
        thickness,
        profile,
        closed,
        startProgress,
        endProgress
      );
    }
    group.add(mesh);

    // Filled extruded surface — only when the input curve is a closed loop.
    if (surface && closed) {
      if (!state.surface) {
        const smat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
        const smesh = new THREE.Mesh(new THREE.BufferGeometry(), smat);
        smesh.castShadow = true;
        smesh.receiveShadow = true;
        state.surface = smesh;
        state.surfaceMaterial = smat;
      }
      const smesh = state.surface;
      smesh.matrixAutoUpdate = false;
      smesh.matrix.identity();
      const surfPts = curve.getPoints(surfaceSegments);
      const surfSig = JSON.stringify([
        surfaceMode,
        closed,
        depth,
        surfaceRings,
        surfaceIterations,
        surfPts.map((p) => [p.x, p.y, p.z]),
      ]);
      if (surfSig !== state.surfaceSignature) {
        state.surfaceSignature = surfSig;
        smesh.geometry.dispose();
        smesh.geometry =
          surfaceMode === "laplacian"
            ? buildLaplacianSurfaceGeometry(surfPts, surfaceRings, surfaceIterations)
            : buildExtrudedSurfaceGeometry(surfPts, depth);
      }
      group.add(smesh);
    }

    // Apply Matrix transformation to the group (the gizmo's target). The tube
    // geometry is built from the curve in its LOCAL space, so the source curve
    // node's pose (where its gizmo put it) is composed in here too — this keeps
    // the geometry centred, which is what lets a Spawner sit copies on a
    // surface instead of pushing them off by a baked-in world offset.
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      group.matrixAutoUpdate = false;
      group.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
      const curveSourceId = ctx.inputSources?.get("curve");
      const curvePose = curveSourceId ? getCurveNodePose(curveSourceId) : null;
      if (curvePose) group.matrix.multiply(curvePose);
    }

    // Curve material and (optionally, independently) the surface material.
    // The diffuse texture is routed to exactly one target: the surface when
    // Surface mode is on, otherwise the curve.
    const curveMat = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    const side = Boolean(params.doubleSided ?? true) ? THREE.DoubleSide : THREE.FrontSide;

    applyMaterialParams(mesh, curveMat, side, surface ? undefined : texParams);
    if (state.surface) {
      const surfaceMat = extractMaterialParams(inputs, params, "surface");
      applyMaterialParams(state.surface, surfaceMat, side, surface ? texParams : undefined);
    }

    return primitiveOutputs(group);
  },
};

/** 4. Sample Curve Node (Follow Path / Matrix Alignment) */
export const SAMPLE_CURVE_NODE: NodeDefinition = {
  type: "curve/sample",
  label: "Follow Path",
  category: "curve",
  inputs: [
    { id: "curve", label: "Curve", type: "curve" },
    { id: "progress", label: "Progress (0-1)", type: "value" },
    { id: "up", label: "Up Vector", type: "vector" },
  ],
  outputs: [
    { id: "position", label: "Position", type: "vector" },
    { id: "tangent", label: "Tangent", type: "vector" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "rotation", label: "Rotation (°)", type: "vector" },
  ],
  defaultParams: {
    progress: 0.0,
    up: new THREE.Vector3(0, 1, 0),
  },
  dynamicParamFields: () => [
    { id: "progress", label: "Progress (0-1)", kind: "number", step: 0.01 },
    { id: "up", label: "Up Vector", kind: "vector" },
  ],
  evaluate: (inputs, params) => {

    const curve: THREE.Curve<THREE.Vector3> =
      inputs.curve instanceof THREE.Curve ? inputs.curve : new THREE.CatmullRomCurve3(defaultCurvePoints());

    const progressRaw = inputs.progress !== undefined ? asNumber(inputs.progress, 0) : asNumber(params.progress, 0);
    // Wrapped so an ever-increasing driver (time, a Sine) loops around the
    // path — but 1 is the *end* of the curve, not another name for the start.
    // Wrapping it too made the last point of every path unreachable: typing 1
    // into the field, or animating 0 → 1, snapped the follower back to the
    // beginning on the final frame.
    const progress = progressRaw === 1 ? 1 : Math.max(0, Math.min(1, progressRaw - Math.floor(progressRaw)));

    const position = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress).normalize();

    const upInput = asVector3(inputs.up, asVector3(params.up, new THREE.Vector3(0, 1, 0))).clone().normalize();
    if (upInput.lengthSq() === 0) upInput.set(0, 1, 0);

    // Compute orthogonal orientation frame (Normal, Binormal, Tangent)
    let binormal = new THREE.Vector3().crossVectors(upInput, tangent).normalize();
    if (binormal.lengthSq() < 1e-4) {
      binormal = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), tangent).normalize();
    }
    const normal = new THREE.Vector3().crossVectors(tangent, binormal).normalize();

    // Construct 3D orientation matrix
    const matrix = new THREE.Matrix4().makeBasis(binormal, normal, tangent);
    matrix.setPosition(position);

    // Extract Euler angles in degrees
    const euler = new THREE.Euler().setFromRotationMatrix(matrix);
    const rotation = new THREE.Vector3(
      (euler.x * 180) / Math.PI,
      (euler.y * 180) / Math.PI,
      (euler.z * 180) / Math.PI
    );

    return {
      position,
      tangent,
      matrix,
      rotation,
    };
  },
};

/** 5. Curve Modifier / Mesh Deform Node */
export const CURVE_DEFORM_NODE: NodeDefinition = {
  type: "curve/deform",
  label: "Curve Deform (Modifier)",
  category: "curve",
  inputs: [
    { id: "visible", label: "Visible", type: "value" },
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "curve", label: "Curve", type: "curve" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "progress", label: "Progress", type: "value" },
    { id: "stretch", label: "Stretch", type: "value" },
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    progress: 0.0,
    stretch: 1.0,
    axis: "z",
  },
  dynamicParamFields: () => [
    { id: "visible", label: "Visible", kind: "boolean" },
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale", kind: "vector" },
    { id: "progress", label: "Progress", kind: "number", step: 0.02 },
    { id: "stretch", label: "Stretch", kind: "number", step: 0.1 },
    { id: "axis", label: "Deform Axis", kind: "select", options: ["x", "y", "z"] },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) {
      // Nothing wired: hand back whatever was last deformed, or one reusable
      // empty mesh — evaluate() runs every frame, so a fresh Mesh here would
      // allocate one per frame for as long as the node sits unconnected.
      if (!state.mesh) {
        state.mesh = new THREE.Mesh();
        state.mesh.userData.nodeId = ctx.nodeId;
      }
      return primitiveOutputs(state.mesh);
    }

    const curve: THREE.Curve<THREE.Vector3> =
      inputs.curve instanceof THREE.Curve ? inputs.curve : new THREE.CatmullRomCurve3(defaultCurvePoints());

    const progress = inputs.progress !== undefined ? asNumber(inputs.progress, 0) : asNumber(params.progress, 0);
    const stretch = inputs.stretch !== undefined ? asNumber(inputs.stretch, 1) : asNumber(params.stretch, 1);
    const axis = String(params.axis || "z");

    // Extract mesh geometry
    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;

    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      return primitiveOutputs(inputObj);
    }

    const posAttr = srcGeom.attributes.position;
    const count = posAttr.count;

    // The source's own pose, baked into the vertices before they are bent.
    // Skipping it deformed a box sitting at (5, 0, 0) as if it were at the
    // origin — its Transform node silently did nothing — and the output was
    // handed back at identity, so the object also lost its placement. The
    // curve is defined in the graph's space, so the geometry has to be
    // brought into that same space to ride it.
    const sourceMatrix = matrixWithin(inputObj, srcMesh);

    // Bounding box of the *posed* geometry along the deform axis: the pose
    // may rotate or scale which part of the object is "along" that axis.
    const baked = new Float32Array(count * 3);
    const v = new THREE.Vector3();
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(sourceMatrix);
      baked[i * 3] = v.x;
      baked[i * 3 + 1] = v.y;
      baked[i * 3 + 2] = v.z;
      const along = axis === "x" ? v.x : axis === "y" ? v.y : v.z;
      if (along < minVal) minVal = along;
      if (along > maxVal) maxVal = along;
    }

    const bboxLength = Math.max(0.001, maxVal - minVal);

    const tubularSegments = 100;
    const frames = curve.computeFrenetFrames(tubularSegments, false);

    const deformedPositions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      v.set(baked[i * 3], baked[i * 3 + 1], baked[i * 3 + 2]);

      const mainPos = axis === "x" ? v.x : axis === "y" ? v.y : v.z;
      const off1 = axis === "x" ? v.y : axis === "y" ? v.z : v.x;
      const off2 = axis === "x" ? v.z : axis === "y" ? v.x : v.y;

      const normAlongAxis = (mainPos - minVal) / bboxLength;
      let u = normAlongAxis * stretch + progress;
      u = Math.max(0, Math.min(1, u - Math.floor(u))); // Wrap u in 0-1 range

      const frameIdx = Math.max(0, Math.min(tubularSegments, Math.floor(u * tubularSegments)));
      const P = curve.getPointAt(u);
      const N = frames.normals[frameIdx];
      const B = frames.binormals[frameIdx];

      const defX = P.x + off1 * N.x + off2 * B.x;
      const defY = P.y + off1 * N.y + off2 * B.y;
      const defZ = P.z + off1 * N.z + off2 * B.z;

      deformedPositions[i * 3] = defX;
      deformedPositions[i * 3 + 1] = defY;
      deformedPositions[i * 3 + 2] = defZ;
    }

    const defGeom = srcGeom.clone();
    defGeom.setAttribute("position", new THREE.BufferAttribute(deformedPositions, 3));
    defGeom.computeVertexNormals();

    // The material stays the input's — a deformed object should keep its own
    // look — which is why it is never recorded as this node's `ownMaterial`:
    // it belongs to the upstream node's cache and is not ours to dispose.
    const mat =
      inputObj instanceof THREE.Mesh && inputObj.material
        ? inputObj.material
        : state.ownMaterial ?? (state.ownMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));

    // One mesh per node, geometry swapped in place: evaluate() runs every
    // frame, and a new Mesh (with a new BufferGeometry, and so new GPU
    // buffers) per frame leaked one full copy of the deformed object per
    // frame — nothing disposed the previous one.
    if (!state.mesh) {
      state.mesh = new THREE.Mesh(defGeom, mat);
      state.mesh.castShadow = true;
      state.mesh.receiveShadow = true;
      state.mesh.userData.nodeId = ctx.nodeId;
    } else {
      state.mesh.geometry.dispose();
      state.mesh.geometry = defGeom;
      state.mesh.material = mat;
    }

    // Its own pose on top of the deformed result, same convention as every
    // other object node — without it the node had nothing for the viewport
    // gizmo to drag and could only be placed by moving its source.
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      state.mesh.matrixAutoUpdate = false;
      state.mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    return primitiveOutputs(state.mesh);
  },
};

/** 6. Curves to Mesh (List) Node — extrudes every curve in a list and merges them into one mesh. */
export const CURVES_TO_MESH_NODE: NodeDefinition = {
  type: "curve/to_mesh_list",
  label: "Curves to Mesh (List)",
  category: "curve",
  inputs: [
    { id: "curves", label: "Curves (List)", type: "list" },
    { id: "thickness", label: "Thickness", type: "value" },
    { id: "startProgress", label: "Start %", type: "value" },
    { id: "endProgress", label: "End %", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    thickness: 0.15,
    startProgress: 0.0,
    endProgress: 1.0,
    tubularSegments: 64,
    radialSegments: 12,
    color: new THREE.Color(0x38bdf8),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: false,
    roughness: 0.4,
    metalness: 0.1,
    wireframe: false,
    opacity: 1.0,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
    profile: DEFAULT_PROFILE_POINTS,
    doubleSided: true,
  },
  dynamicParamFields: () => [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
    { id: "thickness", label: "Base Thickness", kind: "number", step: 0.02, group: "Geometry" },
    { id: "startProgress", label: "Start %", kind: "number", step: 0.01, group: "Geometry" },
    { id: "endProgress", label: "End %", kind: "number", step: 0.01, group: "Geometry" },
    { id: "tubularSegments", label: "Length Segments", kind: "number", step: 4, group: "Geometry" },
    { id: "radialSegments", label: "Radial Sides", kind: "number", step: 1, group: "Geometry" },
    { id: "doubleSided", label: "Double Sided", kind: "boolean", group: "Geometry" },
    { id: "profile", label: "Thickness Profile", kind: "curve_profile", group: "Profile" },
    { id: "color", label: "Color (fallback)", kind: "color", group: "Material" },
    { id: "emissive", label: "Emissive (Glow)", kind: "color", group: "Material" },
    { id: "emissiveIntensity", label: "Emissive Intensity", kind: "number", step: 0.1, group: "Material" },
    { id: "shadeless", label: "Shadeless (Unlit)", kind: "boolean", group: "Material" },
    { id: "roughness", label: "Roughness", kind: "number", step: 0.05, group: "Material" },
    { id: "metalness", label: "Metalness", kind: "number", step: 0.05, group: "Material" },
    { id: "wireframe", label: "Wireframe", kind: "boolean", group: "Material" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Material" },
    { id: "uvScaleX", label: "UV Scale X", kind: "number", step: 0.1, group: "Texture & UV" },
    { id: "uvScaleY", label: "UV Scale Y", kind: "number", step: 0.1, group: "Texture & UV" },
    { id: "uvOffsetX", label: "UV Offset X", kind: "number", step: 0.05, group: "Texture & UV" },
    { id: "uvOffsetY", label: "UV Offset Y", kind: "number", step: 0.05, group: "Texture & UV" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    const curves = Array.isArray(inputs.curves)
      ? (inputs.curves as unknown[]).filter((c): c is THREE.Curve<THREE.Vector3> => c instanceof THREE.Curve)
      : [];

    if (!state.mesh) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state.mesh = mesh;
      state.ownMaterial = mat;
    }
    const mesh = state.mesh;

    const thickness = inputs.thickness !== undefined ? asNumber(inputs.thickness, 0.15) : asNumber(params.thickness, 0.15);
    const startProgress = Math.max(0, Math.min(1, inputs.startProgress !== undefined ? asNumber(inputs.startProgress, 0.0) : asNumber(params.startProgress, 0.0)));
    const endProgress = Math.max(0, Math.min(1, inputs.endProgress !== undefined ? asNumber(inputs.endProgress, 1.0) : asNumber(params.endProgress, 1.0)));
    const tubularSegments = Math.max(8, Math.round(asNumber(params.tubularSegments, 64)));
    const radialSegments = Math.max(3, Math.round(asNumber(params.radialSegments, 12)));
    const profile = (Array.isArray(params.profile) ? params.profile : DEFAULT_PROFILE_POINTS) as ProfilePoint[];

    const signature = JSON.stringify([
      curves.map((c) => c.toJSON()),
      tubularSegments,
      radialSegments,
      thickness,
      profile,
      startProgress,
      endProgress,
    ]);
    if (signature !== state.geometrySignature) {
      state.geometrySignature = signature;
      mesh.geometry.dispose();
      if (curves.length === 0) {
        mesh.geometry = new THREE.BufferGeometry();
      } else {
        const geoms = curves.map((c) =>
          createVariableThicknessTubeGeometry(c, tubularSegments, radialSegments, thickness, profile, false, startProgress, endProgress)
        );
        mesh.geometry = mergeGeometries(geoms, false) ?? new THREE.BufferGeometry();
      }
    }

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const wiredMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix.clone() : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(wiredMatrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    const side = Boolean(params.doubleSided ?? true) ? THREE.DoubleSide : THREE.FrontSide;
    applyMaterialParams(mesh, matParams, side, texParams);

    return primitiveOutputs(mesh);
  },
};

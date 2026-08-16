import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { asVector3, composeNativeMatrix } from "./transform";
import { COMMON_PRIMITIVE_OUTPUTS, primitiveOutputs } from "./object";

function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  if (root instanceof THREE.Mesh) return root;
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!found && child instanceof THREE.Mesh) found = child;
  });
  return found;
}

export interface LatticeGridConfig {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  subdivU: number;
  subdivV: number;
  subdivW: number;
  interpolation: "linear" | "smooth";
  strength: number;
  deformAxis: "x" | "y" | "z";
  bulge: number;
  twist: number; // in degrees
  taper: number;
  bend: number;
  shearX: number;
  shearZ: number;
  customOffsets?: THREE.Vector3[];
}

export function defaultLatticePoints(
  sizeX = 2.0,
  sizeY = 2.0,
  sizeZ = 2.0,
  subdivU = 2,
  subdivV = 2,
  subdivW = 2
): THREE.Vector3[] {
  const nu = Math.max(2, Math.min(16, Math.round(subdivU)));
  const nv = Math.max(2, Math.min(16, Math.round(subdivV)));
  const nw = Math.max(2, Math.min(16, Math.round(subdivW)));
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < nu; i++) {
    const u = nu > 1 ? (i / (nu - 1) - 0.5) * sizeX : 0;
    for (let j = 0; j < nv; j++) {
      const v = nv > 1 ? (j / (nv - 1) - 0.5) * sizeY : 0;
      for (let k = 0; k < nw; k++) {
        const w = nw > 1 ? (k / (nw - 1) - 0.5) * sizeZ : 0;
        pts.push(new THREE.Vector3(u, v, w));
      }
    }
  }
  return pts;
}

/** The params that define the shape of the base grid, as opposed to how it is deformed. */
export const LATTICE_GRID_PARAM_IDS = [
  "sizeX",
  "sizeY",
  "sizeZ",
  "subdivisionsU",
  "subdivisionsV",
  "subdivisionsW",
] as const;

/**
 * Rebuilds `pointsList` for a lattice whose grid dimensions just changed.
 *
 * `pointsList` holds absolute control-point positions: it is both what the
 * viewport draws draggable handles from and what the cage is built from. So
 * it has to be regenerated whenever the grid it describes changes shape,
 * which `evaluate` cannot do for itself — it is pure, and may not write back
 * into params.
 *
 * Only a *count* mismatch used to be caught, and only inside evaluate, which
 * left two holes: changing a Size did nothing whatsoever (the count still
 * matched, so the old, differently-sized points were used verbatim), and
 * changing a subdivision moved the cage but left the handles behind at the
 * old grid's positions.
 *
 * Manual point edits are discarded, because a resized or re-subdivided grid
 * has no meaningful correspondence to them — the same thing Blender does
 * when a lattice's resolution changes.
 */
export function latticeParamsWithRebuiltGrid(params: Record<string, unknown>): Record<string, unknown> {
  return {
    ...params,
    pointsList: defaultLatticePoints(
      Math.max(0.01, asNumber(params.sizeX, 2.0)),
      Math.max(0.01, asNumber(params.sizeY, 2.0)),
      Math.max(0.01, asNumber(params.sizeZ, 2.0)),
      asNumber(params.subdivisionsU, 2),
      asNumber(params.subdivisionsV, 2),
      asNumber(params.subdivisionsW, 2),
    ),
  };
}

/**
 * The lattice's grid settings as the node itself reads them, so the viewport
 * can draw exactly the grid the node will build rather than reconstructing
 * the rules and drifting from them.
 */
export function latticeConfigFromParams(params: Record<string, unknown>): LatticeGridConfig {
  return {
    sizeX: Math.max(0.01, asNumber(params.sizeX, 2.0)),
    sizeY: Math.max(0.01, asNumber(params.sizeY, 2.0)),
    sizeZ: Math.max(0.01, asNumber(params.sizeZ, 2.0)),
    subdivU: Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsU, 2)))),
    subdivV: Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsV, 2)))),
    subdivW: Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsW, 2)))),
    interpolation: String(params.interpolation) === "smooth" ? "smooth" : "linear",
    strength: Math.max(0, Math.min(1, asNumber(params.strength, 1.0))),
    deformAxis: (String(params.deformAxis || "y").toLowerCase() as "x" | "y" | "z") || "y",
    bulge: asNumber(params.bulge, 0),
    twist: asNumber(params.twist, 0),
    taper: asNumber(params.taper, 0),
    bend: asNumber(params.bend, 0),
    shearX: asNumber(params.shearX, 0),
    shearZ: asNumber(params.shearZ, 0),
  };
}

/** The stored base points, or a freshly built grid when they don't match the current size. */
export function latticeBasePoints(params: Record<string, unknown>): THREE.Vector3[] {
  const c = latticeConfigFromParams(params);
  const expected = c.subdivU * c.subdivV * c.subdivW;
  const stored = Array.isArray(params.pointsList)
    ? (params.pointsList as unknown[]).map((p) => asVector3(p, new THREE.Vector3()))
    : [];
  return stored.length === expected
    ? stored
    : defaultLatticePoints(c.sizeX, c.sizeY, c.sizeZ, c.subdivU, c.subdivV, c.subdivW);
}

/** Normalized grid coordinates of point `index`, in the same i→j→k order pointsList uses. */
function normalizedGridCoords(c: LatticeGridConfig, index: number): [number, number, number] {
  const nv = c.subdivV;
  const nw = c.subdivW;
  const i = Math.floor(index / (nv * nw));
  const j = Math.floor((index % (nv * nw)) / nw);
  const k = index % nw;
  return [
    c.subdivU > 1 ? i / (c.subdivU - 1) - 0.5 : 0,
    nv > 1 ? j / (nv - 1) - 0.5 : 0,
    nw > 1 ? k / (nw - 1) - 0.5 : 0,
  ];
}

/**
 * Where each control point actually ends up once the procedural modulators
 * (taper, twist, bend, …) have been applied — i.e. the corners of the cage
 * as drawn.
 *
 * The viewport's draggable handles are placed here rather than on the raw
 * stored points, because the stored points are the grid *before* modulators:
 * with any taper dialled in, handles drawn there float off the cage they are
 * supposed to be editing.
 */
export function latticeEvaluatedPoints(params: Record<string, unknown>): THREE.Vector3[] {
  const config = latticeConfigFromParams(params);
  const grid = buildLatticeControlPoints(config, latticeBasePoints(params));
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      for (let k = 0; k < grid[i][j].length; k++) points.push(grid[i][j][k]);
    }
  }
  return points;
}

/**
 * The base point that would land at `target` once the modulators are applied
 * — the inverse of what latticeEvaluatedPoints computes, so that dragging a
 * handle drawn on the deformed cage edits the underlying grid correctly.
 *
 * Solved numerically (Newton, finite-difference Jacobian) rather than
 * algebraically: the modulators compose taper, twist, bulge, bend and shear,
 * and several of them are driven by the point's own coordinate along the
 * deform axis, which makes the closed-form inverse both messy and a second
 * place for the forward maths to be duplicated and drift out of sync. Three
 * iterations put the residual far below what a mouse can express; if the
 * Jacobian is singular (a modulator collapsing an axis) the step is skipped
 * and the last good estimate stands, so a drag degrades rather than
 * exploding.
 */
export function latticeBasePointForTarget(
  params: Record<string, unknown>,
  index: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  const config = latticeConfigFromParams(params);
  const [uNorm, vNorm, wNorm] = normalizedGridCoords(config, index);
  const forward = (base: THREE.Vector3) =>
    evaluateLatticeControlPoint(uNorm, vNorm, wNorm, config, index, base);

  const basePoints = latticeBasePoints(params);
  const estimate = (basePoints[index] ?? new THREE.Vector3()).clone();

  const EPS = 1e-4;
  for (let iteration = 0; iteration < 3; iteration++) {
    const residual = new THREE.Vector3().subVectors(target, forward(estimate));
    if (residual.lengthSq() < 1e-14) break;

    const columns = (["x", "y", "z"] as const).map((axis) => {
      const nudged = estimate.clone();
      nudged[axis] += EPS;
      return new THREE.Vector3().subVectors(forward(nudged), forward(estimate)).divideScalar(EPS);
    });

    const jacobian = new THREE.Matrix3().set(
      columns[0].x, columns[1].x, columns[2].x,
      columns[0].y, columns[1].y, columns[2].y,
      columns[0].z, columns[1].z, columns[2].z,
    );
    const determinant =
      jacobian.elements[0] * (jacobian.elements[4] * jacobian.elements[8] - jacobian.elements[7] * jacobian.elements[5]) -
      jacobian.elements[3] * (jacobian.elements[1] * jacobian.elements[8] - jacobian.elements[7] * jacobian.elements[2]) +
      jacobian.elements[6] * (jacobian.elements[1] * jacobian.elements[5] - jacobian.elements[4] * jacobian.elements[2]);
    if (Math.abs(determinant) < 1e-9) break;

    estimate.add(residual.clone().applyMatrix3(jacobian.clone().invert()));
  }

  return estimate;
}

/**
 * Evaluates the deformed 3D position of a local control point on the grid (i, j, k)
 * based on the base point + built-in procedural modulators + custom offset list.
 */
export function evaluateLatticeControlPoint(
  uNorm: number, // -0.5 to 0.5
  vNorm: number, // -0.5 to 0.5
  wNorm: number, // -0.5 to 0.5
  config: LatticeGridConfig,
  pointIndex: number,
  basePoint?: THREE.Vector3
): THREE.Vector3 {
  // Base undeformed coordinate in lattice local space
  let x = basePoint ? basePoint.x : uNorm * config.sizeX;
  let y = basePoint ? basePoint.y : vNorm * config.sizeY;
  let z = basePoint ? basePoint.z : wNorm * config.sizeZ;

  // Primary axis coordinate (h in [-0.5, 0.5]) and lateral coordinates
  let h = 0;
  if (config.deformAxis === "x") h = config.sizeX > 0 ? x / config.sizeX : uNorm;
  else if (config.deformAxis === "y") h = config.sizeY > 0 ? y / config.sizeY : vNorm;
  else h = config.sizeZ > 0 ? z / config.sizeZ : wNorm;

  // 1. Taper: scale cross-section as a function of height h
  if (config.taper !== 0) {
    const taperScale = Math.max(0.001, 1.0 + config.taper * (h + 0.5) * 2.0);
    if (config.deformAxis === "x") {
      y *= taperScale;
      z *= taperScale;
    } else if (config.deformAxis === "y") {
      x *= taperScale;
      z *= taperScale;
    } else {
      x *= taperScale;
      y *= taperScale;
    }
  }

  // 2. Twist: rotate cross-section around the deform axis
  if (config.twist !== 0) {
    const angleRad = ((config.twist * Math.PI) / 180) * (h + 0.5);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    if (config.deformAxis === "x") {
      const ny = y * cosA - z * sinA;
      const nz = y * sinA + z * cosA;
      y = ny;
      z = nz;
    } else if (config.deformAxis === "y") {
      const nx = x * cosA - z * sinA;
      const nz = x * sinA + z * cosA;
      x = nx;
      z = nz;
    } else {
      const nx = x * cosA - y * sinA;
      const ny = x * sinA + y * cosA;
      x = nx;
      y = ny;
    }
  }

  // 3. Bulge: parabolic spherical expansion from center
  if (config.bulge !== 0) {
    const distSq = (uNorm * uNorm + vNorm * vNorm + wNorm * wNorm) * 4.0; // 0 at center, ~1 to 3 at corners
    const factor = Math.max(0.0, 1.0 - distSq);
    const bulgeAmount = config.bulge * factor;
    x += x * bulgeAmount;
    y += y * bulgeAmount;
    z += z * bulgeAmount;
  }

  // 4. Bend: arc bending along the deform axis
  if (config.bend !== 0) {
    const bendAngle = (config.bend * Math.PI * 0.5) * (h + 0.5);
    const arcRadius = config.sizeY / Math.max(0.01, Math.abs(config.bend * Math.PI * 0.5));
    if (config.deformAxis === "y") {
      const curvedX = (Math.cos(bendAngle) - 1.0) * arcRadius;
      const curvedY = Math.sin(bendAngle) * arcRadius;
      x += curvedX;
      y = curvedY;
    } else if (config.deformAxis === "z") {
      const curvedY = (Math.cos(bendAngle) - 1.0) * arcRadius;
      const curvedZ = Math.sin(bendAngle) * arcRadius;
      y += curvedY;
      z = curvedZ;
    }
  }

  // 5. Shear: linear displacement across height
  if (config.shearX !== 0) {
    x += config.shearX * (h + 0.5) * config.sizeX;
  }
  if (config.shearZ !== 0) {
    z += config.shearZ * (h + 0.5) * config.sizeZ;
  }

  // 6. Custom offset if provided in points list
  if (config.customOffsets && pointIndex < config.customOffsets.length) {
    const custom = config.customOffsets[pointIndex];
    x += custom.x;
    y += custom.y;
    z += custom.z;
  }

  return new THREE.Vector3(x, y, z);
}

/** Builds the 3D grid of control points */
export function buildLatticeControlPoints(
  config: LatticeGridConfig,
  basePoints?: THREE.Vector3[]
): THREE.Vector3[][][] {
  const nu = Math.max(2, Math.min(16, config.subdivU));
  const nv = Math.max(2, Math.min(16, config.subdivV));
  const nw = Math.max(2, Math.min(16, config.subdivW));

  const totalPoints = nu * nv * nw;
  const hasBasePoints = Array.isArray(basePoints) && basePoints.length === totalPoints;

  const grid: THREE.Vector3[][][] = [];
  let index = 0;

  for (let i = 0; i < nu; i++) {
    const uNorm = nu > 1 ? i / (nu - 1) - 0.5 : 0;
    grid[i] = [];
    for (let j = 0; j < nv; j++) {
      const vNorm = nv > 1 ? j / (nv - 1) - 0.5 : 0;
      grid[i][j] = [];
      for (let k = 0; k < nw; k++) {
        const wNorm = nw > 1 ? k / (nw - 1) - 0.5 : 0;
        const basePt = hasBasePoints
          ? asVector3(basePoints![index], new THREE.Vector3(uNorm * config.sizeX, vNorm * config.sizeY, wNorm * config.sizeZ))
          : undefined;
        grid[i][j][k] = evaluateLatticeControlPoint(uNorm, vNorm, wNorm, config, index, basePt);
        index++;
      }
    }
  }

  return grid;
}

/** Cubic B-Spline / Catmull-Rom basis weight function */
function cubicBasis(t: number, i: number): number {
  if (i === 0) return (1 - t) * (1 - t) * (1 - t) / 6;
  if (i === 1) return (3 * t * t * t - 6 * t * t + 4) / 6;
  if (i === 2) return (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6;
  if (i === 3) return (t * t * t) / 6;
  return 0;
}

/** Evaluates Free-Form Deformation at normalized coordinate (u, v, w) in [0, 1]^3 */
export function evaluateFFDPoint(
  grid: THREE.Vector3[][][],
  u: number,
  v: number,
  w: number,
  interpolation: "linear" | "smooth"
): THREE.Vector3 {
  const nu = grid.length;
  const nv = grid[0].length;
  const nw = grid[0][0].length;

  const clampU = Math.max(0, Math.min(1, u));
  const clampV = Math.max(0, Math.min(1, v));
  const clampW = Math.max(0, Math.min(1, w));

  const result = new THREE.Vector3(0, 0, 0);

  if (interpolation === "smooth" && nu >= 4 && nv >= 4 && nw >= 4) {
    // Tricubic B-Spline interpolation
    const fu = clampU * (nu - 1);
    const fv = clampV * (nv - 1);
    const fw = clampW * (nw - 1);

    const iu = Math.min(nu - 4, Math.max(0, Math.floor(fu) - 1));
    const iv = Math.min(nv - 4, Math.max(0, Math.floor(fv) - 1));
    const iw = Math.min(nw - 4, Math.max(0, Math.floor(fw) - 1));

    const tu = fu - iu - 1;
    const tv = fv - iv - 1;
    const tw = fw - iw - 1;

    for (let di = 0; di < 4; di++) {
      const bu = cubicBasis(tu, di);
      for (let dj = 0; dj < 4; dj++) {
        const bv = cubicBasis(tv, dj);
        for (let dk = 0; dk < 4; dk++) {
          const bw = cubicBasis(tw, dk);
          const weight = bu * bv * bw;
          const pt = grid[iu + di][iv + dj][iw + dk];
          result.x += pt.x * weight;
          result.y += pt.y * weight;
          result.z += pt.z * weight;
        }
      }
    }
  } else {
    // Trilinear interpolation across grid cells
    const cellU = clampU * (nu - 1);
    const cellV = clampV * (nv - 1);
    const cellW = clampW * (nw - 1);

    const i0 = Math.min(nu - 2, Math.floor(cellU));
    const j0 = Math.min(nv - 2, Math.floor(cellV));
    const k0 = Math.min(nw - 2, Math.floor(cellW));

    const i1 = i0 + 1;
    const j1 = j0 + 1;
    const k1 = k0 + 1;

    const tu = cellU - i0;
    const tv = cellV - j0;
    const tw = cellW - k0;

    const c000 = grid[i0][j0][k0];
    const c100 = grid[i1][j0][k0];
    const c010 = grid[i0][j1][k0];
    const c110 = grid[i1][j1][k0];
    const c001 = grid[i0][j0][k1];
    const c101 = grid[i1][j0][k1];
    const c011 = grid[i0][j1][k1];
    const c111 = grid[i1][j1][k1];

    // Lerp along U
    const c00 = c000.clone().lerp(c100, tu);
    const c10 = c010.clone().lerp(c110, tu);
    const c01 = c001.clone().lerp(c101, tu);
    const c11 = c011.clone().lerp(c111, tu);

    // Lerp along V
    const c0 = c00.lerp(c10, tv);
    const c1 = c01.lerp(c11, tv);

    // Lerp along W
    result.copy(c0.lerp(c1, tw));
  }

  return result;
}

/** Generates the wireframe LineSegments geometry for the lattice cage visualization */
export function createLatticeCageGeometry(grid: THREE.Vector3[][][]): THREE.BufferGeometry {
  const nu = grid.length;
  const nv = grid[0].length;
  const nw = grid[0][0].length;

  const positions: number[] = [];

  // Lines along U
  for (let j = 0; j < nv; j++) {
    for (let k = 0; k < nw; k++) {
      for (let i = 0; i < nu - 1; i++) {
        const p1 = grid[i][j][k];
        const p2 = grid[i + 1][j][k];
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
  }

  // Lines along V
  for (let i = 0; i < nu; i++) {
    for (let k = 0; k < nw; k++) {
      for (let j = 0; j < nv - 1; j++) {
        const p1 = grid[i][j][k];
        const p2 = grid[i][j + 1][k];
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
  }

  // Lines along W
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      for (let k = 0; k < nw - 1; k++) {
        const p1 = grid[i][j][k];
        const p2 = grid[i][j][k + 1];
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

interface LatticeState {
  group?: THREE.Group;
  deformedMesh?: THREE.Mesh;
  cageLines?: THREE.LineSegments;
  lastSignature?: string;
}

const latticeCache = createNodeCache<LatticeState>((s) => {
  if (s.group) disposeObject3D(s.group);
});

function getState(nodeId: string): LatticeState {
  let state = latticeCache.get(nodeId);
  if (!state) {
    state = {};
    latticeCache.set(nodeId, state);
  }
  return state;
}

/** Helper to parse number with fallback */
function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Lattice Deform Node (Free-Form Deformation FFD - Blender-like)
 */
export const LATTICE_DEFORM_NODE: NodeDefinition = {
  type: "modifier/lattice",
  label: "Lattice Deform",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "strength", label: "Strength", type: "value" },
    { id: "points", label: "Points List", type: "list" },
    { id: "bulge", label: "Bulge", type: "value" },
    { id: "twist", label: "Twist (°)", type: "value" },
    { id: "taper", label: "Taper", type: "value" },
    { id: "bend", label: "Bend", type: "value" },
    { id: "shearX", label: "Shear X", type: "value" },
    { id: "shearZ", label: "Shear Z", type: "value" },
  ],
  outputs: [
    ...COMMON_PRIMITIVE_OUTPUTS,
    { id: "cage", label: "Cage Wireframe", type: "geometry" },
  ],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    sizeX: 2.0,
    sizeY: 2.0,
    sizeZ: 2.0,
    subdivisionsU: 2,
    subdivisionsV: 2,
    subdivisionsW: 2,
    interpolation: "linear",
    strength: 1.0,
    showCage: true,
    deformAxis: "y",
    bulge: 0.0,
    twist: 0.0,
    taper: 0.0,
    bend: 0.0,
    shearX: 0.0,
    shearZ: 0.0,
    pointsList: defaultLatticePoints(2.0, 2.0, 2.0, 2, 2, 2),
  },
  dynamicParamFields: () => [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },

    { id: "sizeX", label: "Size X", kind: "number", step: 0.1, group: "Lattice Grid" },
    { id: "sizeY", label: "Size Y", kind: "number", step: 0.1, group: "Lattice Grid" },
    { id: "sizeZ", label: "Size Z", kind: "number", step: 0.1, group: "Lattice Grid" },
    { id: "subdivisionsU", label: "Subdivisions U", kind: "number", step: 1, group: "Lattice Grid" },
    { id: "subdivisionsV", label: "Subdivisions V", kind: "number", step: 1, group: "Lattice Grid" },
    { id: "subdivisionsW", label: "Subdivisions W", kind: "number", step: 1, group: "Lattice Grid" },
    { id: "interpolation", label: "Interpolation", kind: "select", options: ["linear", "smooth"], group: "Lattice Grid" },
    { id: "strength", label: "Strength", kind: "number", step: 0.05, group: "Lattice Grid" },
    { id: "showCage", label: "Show Cage", kind: "boolean", group: "Lattice Grid" },

    { id: "deformAxis", label: "Deform Axis", kind: "select", options: ["x", "y", "z"], group: "Deformations" },
    { id: "bulge", label: "Bulge", kind: "number", step: 0.05, group: "Deformations" },
    { id: "twist", label: "Twist (°)", kind: "number", step: 5, group: "Deformations" },
    { id: "taper", label: "Taper", kind: "number", step: 0.05, group: "Deformations" },
    { id: "bend", label: "Bend", kind: "number", step: 0.05, group: "Deformations" },
    { id: "shearX", label: "Shear X", kind: "number", step: 0.05, group: "Deformations" },
    { id: "shearZ", label: "Shear Z", kind: "number", step: 0.05, group: "Deformations" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;

    // Config parameters
    const sizeX = Math.max(0.01, asNumber(params.sizeX, 2.0));
    const sizeY = Math.max(0.01, asNumber(params.sizeY, 2.0));
    const sizeZ = Math.max(0.01, asNumber(params.sizeZ, 2.0));

    const subdivU = Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsU, 2))));
    const subdivV = Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsV, 2))));
    const subdivW = Math.max(2, Math.min(16, Math.round(asNumber(params.subdivisionsW, 2))));

    const interpolation = (String(params.interpolation) === "smooth" ? "smooth" : "linear") as "linear" | "smooth";
    const strength = Math.max(0, Math.min(1, inputs.strength !== undefined ? asNumber(inputs.strength, 1.0) : asNumber(params.strength, 1.0)));
    const showCage = Boolean(params.showCage ?? true);

    const deformAxis = (String(params.deformAxis || "y").toLowerCase() as "x" | "y" | "z") || "y";
    const bulge = inputs.bulge !== undefined ? asNumber(inputs.bulge, 0.0) : asNumber(params.bulge, 0.0);
    const twist = inputs.twist !== undefined ? asNumber(inputs.twist, 0.0) : asNumber(params.twist, 0.0);
    const taper = inputs.taper !== undefined ? asNumber(inputs.taper, 0.0) : asNumber(params.taper, 0.0);
    const bend = inputs.bend !== undefined ? asNumber(inputs.bend, 0.0) : asNumber(params.bend, 0.0);
    const shearX = inputs.shearX !== undefined ? asNumber(inputs.shearX, 0.0) : asNumber(params.shearX, 0.0);
    const shearZ = inputs.shearZ !== undefined ? asNumber(inputs.shearZ, 0.0) : asNumber(params.shearZ, 0.0);

    let customOffsets: THREE.Vector3[] | undefined;
    if (Array.isArray(inputs.points)) {
      customOffsets = inputs.points.map((p) => asVector3(p, new THREE.Vector3(0, 0, 0)));
    }

    const totalExpectedPoints = subdivU * subdivV * subdivW;
    let basePoints = Array.isArray(params.pointsList)
      ? (params.pointsList as unknown[]).map((p) => asVector3(p, new THREE.Vector3()))
      : [];
    if (basePoints.length !== totalExpectedPoints) {
      basePoints = defaultLatticePoints(sizeX, sizeY, sizeZ, subdivU, subdivV, subdivW);
    }

    const config: LatticeGridConfig = {
      sizeX,
      sizeY,
      sizeZ,
      subdivU,
      subdivV,
      subdivW,
      interpolation,
      strength,
      deformAxis,
      bulge,
      twist,
      taper,
      bend,
      shearX,
      shearZ,
      customOffsets,
    };

    // 1. Build Lattice Control Points Grid in local space
    const grid = buildLatticeControlPoints(config, basePoints);

    // Initialize root container group
    if (!state.group) {
      state.group = new THREE.Group();
      state.group.userData.nodeId = ctx.nodeId;
    }

    // Compose lattice matrix
    const wiredMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix.clone() : new THREE.Matrix4();
    const latticeMatrix = composeNativeMatrix(wiredMatrix, params.location, params.rotation, params.scale);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      state.group.matrixAutoUpdate = false;
      state.group.matrix.copy(latticeMatrix);
    }

    // Inverse lattice matrix for projecting incoming vertices into lattice space
    const invLatticeMatrix = new THREE.Matrix4().copy(latticeMatrix).invert();

    // 2. Build or update Lattice Cage Wireframe
    if (!state.cageLines) {
      const cageMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
      });
      state.cageLines = new THREE.LineSegments(new THREE.BufferGeometry(), cageMat);
      state.cageLines.renderOrder = 999;
      state.group.add(state.cageLines);
    }

    state.cageLines.visible = showCage;
    if (showCage) {
      state.cageLines.geometry.dispose();
      state.cageLines.geometry = createLatticeCageGeometry(grid);
    }

    // 3. Deform input geometry
    if (!inputObj) {
      if (state.deformedMesh) {
        state.deformedMesh.visible = false;
      }
      return {
        ...primitiveOutputs(state.group),
        cage: state.cageLines,
      };
    }

    const srcMesh = findFirstMesh(inputObj);
    const srcGeom = srcMesh?.geometry;

    if (!srcMesh || !srcGeom || !srcGeom.attributes.position) {
      return {
        ...primitiveOutputs(inputObj),
        cage: state.cageLines,
      };
    }

    if (!state.deformedMesh) {
      state.deformedMesh = new THREE.Mesh(new THREE.BufferGeometry(), srcMesh.material);
      state.deformedMesh.castShadow = true;
      state.deformedMesh.receiveShadow = true;
      state.group.add(state.deformedMesh);
    }

    state.deformedMesh.visible = true;
    state.deformedMesh.material = srcMesh.material;

    // Source world transform. It has to be recomputed, not read: a node
    // feeding the lattice is no longer drawn itself — only the deformed
    // result is — so nothing traverses it and its matrixWorld is never
    // refreshed. `matrix.copy()` doesn't flag it stale either, so the value
    // sitting there is whatever the source last had when something else
    // happened to draw it. Reading it froze the deformation at that pose,
    // which is why connecting a lattice stopped an animated object dead.
    // updateWorldMatrix walks the parents and guards updateMatrix() behind
    // matrixAutoUpdate, so it is safe on a graph-driven mesh (whose
    // position/quaternion/scale are stale by design).
    // The third argument is `force`, and it is not optional here: three
    // skips the recompute unless `matrixWorldNeedsUpdate` is set, and
    // `matrix.copy()` never sets it (see Object3D.updateWorldMatrix). Without
    // it this call is a silent no-op on exactly the meshes that need it.
    srcMesh.updateWorldMatrix(true, false, true);
    const sourceMatrix = srcMesh.matrixWorld.clone();

    // Composite transform from source geometry to lattice local space:
    // P_lattice = inv(LatticeMatrix) * (SourceMatrix * P_src)
    const srcToLattice = new THREE.Matrix4().multiplyMatrices(invLatticeMatrix, sourceMatrix);

    const posAttr = srcGeom.attributes.position;
    const vertexCount = posAttr.count;

    const deformedPositions = new Float32Array(vertexCount * 3);
    const v = new THREE.Vector3();
    const origLocal = new THREE.Vector3();

    const halfX = sizeX * 0.5;
    const halfY = sizeY * 0.5;
    const halfZ = sizeZ * 0.5;

    for (let i = 0; i < vertexCount; i++) {
      v.fromBufferAttribute(posAttr, i);
      // Project into lattice space
      v.applyMatrix4(srcToLattice);
      origLocal.copy(v);

      // Normalized coordinates [0, 1] relative to lattice bounding box
      const u = sizeX > 0 ? (v.x + halfX) / sizeX : 0.5;
      const wV = sizeY > 0 ? (v.y + halfY) / sizeY : 0.5;
      const w = sizeZ > 0 ? (v.z + halfZ) / sizeZ : 0.5;

      // Evaluate Free-Form Deformation point
      const deformed = evaluateFFDPoint(grid, u, wV, w, interpolation);

      // Blend with original position according to strength
      if (strength < 1.0) {
        deformed.lerp(origLocal, 1.0 - strength);
      }

      deformedPositions[i * 3] = deformed.x;
      deformedPositions[i * 3 + 1] = deformed.y;
      deformedPositions[i * 3 + 2] = deformed.z;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(deformedPositions, 3));

    // Copy UVs, Normals, and Indices if present
    if (srcGeom.attributes.uv) {
      geom.setAttribute("uv", srcGeom.attributes.uv.clone());
    }
    if (srcGeom.index) {
      geom.setIndex(srcGeom.index.clone());
    }

    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();

    state.deformedMesh.geometry.dispose();
    state.deformedMesh.geometry = geom;

    return {
      ...primitiveOutputs(state.group),
      cage: state.cageLines,
    };
  },
};

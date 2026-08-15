import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { asVector3, composeNativeMatrix } from "./transform";
import {
  applyMaterialParams,
  COMMON_PRIMITIVE_INPUTS,
  COMMON_PRIMITIVE_OUTPUTS,
  extractMaterialParams,
  extractTextureParams,
  primitiveOutputs,
} from "./object";
import { DEFAULT_PROFILE_POINTS, evalProfileCurve, ProfilePoint } from "../profileCurve";

interface CurveNodeState {
  mesh?: THREE.Mesh;
  /**
   * Only set when the material is this node's own. Curve Deform reuses the
   * material of the mesh it deforms, which belongs to the upstream node's
   * cache — disposing that on delete would blank out the original object.
   */
  ownMaterial?: THREE.Material;
  /** Everything the cached geometry was built from, serialized — see the rebuild guard in Curve to Mesh. */
  geometrySignature?: string;
}

const curveCache = createNodeCache<CurveNodeState>((s) => {
  if (s.mesh) {
    s.mesh.geometry.dispose();
    if (s.ownMaterial) {
      s.ownMaterial.dispose();
    }
  }
});

function getState(nodeId: string): CurveNodeState {
  let state = curveCache.get(nodeId);
  if (!state) {
    state = {};
    curveCache.set(nodeId, state);
  }
  return state;
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

/** Generates custom tube geometry with variable radius R(t) = baseRadius * evalProfile(t) */
export function createVariableThicknessTubeGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  tubularSegments = 64,
  radialSegments = 8,
  baseRadius = 0.1,
  profile: ProfilePoint[] = DEFAULT_PROFILE_POINTS,
  closed = false
): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubularSegments, closed);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const P = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    const radiusMultiplier = evalProfileCurve(profile, u);
    const currentRadius = Math.max(0.0001, baseRadius * radiusMultiplier);

    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const theta = v * Math.PI * 2;
      const sin = Math.sin(theta);
      const cos = -Math.cos(theta);

      // Normal in circle plane
      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();

      normals.push(normal.x, normal.y, normal.z);

      // Vertex position
      vertex.x = P.x + currentRadius * normal.x;
      vertex.y = P.y + currentRadius * normal.y;
      vertex.z = P.z + currentRadius * normal.z;

      positions.push(vertex.x, vertex.y, vertex.z);
      uvs.push(u, v);
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
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  return geometry;
}

/** 1. Curve from Points Node */
export const CURVE_FROM_POINTS_NODE: NodeDefinition = {
  type: "curve/from_points",
  label: "Curve from Points",
  category: "curve",
  inputs: [
    { id: "points", label: "Points", type: "list" },
    { id: "closed", label: "Closed", type: "value" },
    { id: "tension", label: "Tension", type: "value" },
  ],
  outputs: [{ id: "curve", label: "Curve", type: "curve" }],
  defaultParams: {
    type: "catmull",
    closed: false,
    tension: 0.5,
    pointsList: defaultCurvePoints(),
  },
  dynamicParamFields: () => [
    { id: "type", label: "Type", kind: "select", options: ["catmull", "bezier", "linear"] },
    { id: "closed", label: "Closed", kind: "boolean" },
    { id: "tension", label: "Tension", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params) => {
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

    if (type === "linear") {
      const path = new THREE.CurvePath<THREE.Vector3>();
      for (let i = 0; i < pts.length - 1; i++) {
        path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
      }
      if (closed && pts.length > 2) {
        path.add(new THREE.LineCurve3(pts[pts.length - 1], pts[0]));
      }
      curve = path;
    } else if (type === "bezier" && pts.length >= 4) {
      curve = buildBezierPath(pts, closed);
    } else {
      // CatmullRom default
      curve = new THREE.CatmullRomCurve3(pts, closed, "catmullrom", tension);
    }

    return { curve };
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
  ],
  outputs: [{ id: "curve", label: "Curve", type: "curve" }],
  defaultParams: {
    primitiveType: "helix",
    radius: 1.5,
    height: 3.0,
    turns: 3.0,
  },
  dynamicParamFields: () => [
    { id: "primitiveType", label: "Shape", kind: "select", options: ["helix", "circle", "line", "rectangle"] },
    { id: "radius", label: "Radius / Size", kind: "number", step: 0.1 },
    { id: "height", label: "Height", kind: "number", step: 0.2 },
    { id: "turns", label: "Turns", kind: "number", step: 0.5 },
  ],
  evaluate: (inputs, params) => {
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

    return { curve };
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
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    thickness: 0.15,
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
    pointsList: defaultCurvePoints(),
    doubleSided: true,
  },
  dynamicParamFields: () => [
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },

    { id: "thickness", label: "Base Thickness", kind: "number", step: 0.02, group: "Geometry" },
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

    // Fallback curve if none wired
    let curve: THREE.Curve<THREE.Vector3>;
    if (inputs.curve instanceof THREE.Curve) {
      curve = inputs.curve;
    } else {
      const ptsList = Array.isArray(params.pointsList) && params.pointsList.length >= 2
        ? (params.pointsList as unknown[]).map((p) => asVector3(p, new THREE.Vector3()))
        : defaultCurvePoints();
      curve = new THREE.CatmullRomCurve3(ptsList);
    }

    const thickness = inputs.thickness !== undefined ? asNumber(inputs.thickness, 0.15) : asNumber(params.thickness, 0.15);
    const tubularSegments = Math.max(8, Math.round(asNumber(params.tubularSegments, 64)));
    const radialSegments = Math.max(3, Math.round(asNumber(params.radialSegments, 12)));
    const profile = (Array.isArray(params.profile) ? params.profile : DEFAULT_PROFILE_POINTS) as ProfilePoint[];

    const closed = curve instanceof THREE.CatmullRomCurve3 ? curve.closed : false;

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

    const signature = JSON.stringify([curve.toJSON(), tubularSegments, radialSegments, thickness, profile, closed]);
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
      );
    }

    // Apply Matrix transformation
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

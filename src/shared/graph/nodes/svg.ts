import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { createNodeCache } from "../nodeCaches";
import { NodeDefinition } from "../types";
import {
  applyMaterialParams,
  COMMON_PRIMITIVE_INPUTS,
  COMMON_PRIMITIVE_OUTPUTS,
  extractMaterialParams,
  extractTextureParams,
  primitiveOutputs,
} from "./object";
import { composeNativeMatrix } from "./transform";

interface SvgState {
  /** Raw parsed curves (SVG units, Y already inverted, on the XY plane). */
  curves: THREE.Curve<THREE.Vector3>[];
  /** The scale/normalize transform applied last — see evaluate's rebuild guard. */
  transformed?: THREE.Curve<THREE.Vector3>[];
  lastKey?: string;
  /** Cached gray preview lines (one per curve) so the SVG shows in the viewport. */
  preview?: THREE.Group;
  previewSignature?: string;
}

const svgCache = createNodeCache<SvgState>((s) => {
  if (s.preview) {
    s.preview.traverse((child) => {
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
});

function getSvgState(nodeId: string): SvgState {
  let state = svgCache.get(nodeId);
  if (!state) {
    state = { curves: [] };
    svgCache.set(nodeId, state);
  }
  return state;
}

/** Dark-gray preview line color, matching the other curve nodes. */
const SVG_PREVIEW_COLOR = 0x9ca3af;

/** Applies the node's native pose to its preview/solid, skipping while the gizmo drags. */
function applySvgPose(
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

/**
 * Returns a cached Group of gray polyline previews — one per closed point loop —
 * so a curve-generating node's `geometry` is visible in the viewport. Rebuilt
 * only when `sig` changes.
 */
function svgPreviewGroup(state: SvgState, loops: THREE.Vector3[][], sig: string): THREE.Group {
  if (!state.preview) state.preview = new THREE.Group();
  if (sig !== state.previewSignature) {
    state.previewSignature = sig;
    for (const child of [...state.preview.children]) {
      state.preview.remove(child);
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    }
    for (const pts of loops) {
      if (pts.length < 2) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: SVG_PREVIEW_COLOR }),
      );
      state.preview.add(line);
    }
  }
  return state.preview;
}

function num(v: unknown, fallback: unknown): number {
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  const f = Number(fallback);
  return Number.isFinite(f) ? f : 0;
}

/** SVG's Y points down, three.js's up — map a 2D point onto the XY plane with Y flipped. */
function to3D(v: THREE.Vector2): THREE.Vector3 {
  return new THREE.Vector3(v.x, -v.y, 0);
}

/** A single 2D SVG curve segment, lifted into 3D. Arcs/splines are sampled into a Catmull-Rom. */
export function curve2Dto3D(c: THREE.Curve<THREE.Vector2>): THREE.Curve<THREE.Vector3> {
  if (c instanceof THREE.LineCurve) {
    return new THREE.LineCurve3(to3D(c.v1), to3D(c.v2));
  }
  if (c instanceof THREE.CubicBezierCurve) {
    return new THREE.CubicBezierCurve3(to3D(c.v0), to3D(c.v1), to3D(c.v2), to3D(c.v3));
  }
  if (c instanceof THREE.QuadraticBezierCurve) {
    return new THREE.QuadraticBezierCurve3(to3D(c.v0), to3D(c.v1), to3D(c.v2));
  }
  if (c instanceof THREE.EllipseCurve) {
    return new THREE.CatmullRomCurve3(c.getPoints(64).map(to3D), true);
  }
  if (c instanceof THREE.SplineCurve) {
    return new THREE.CatmullRomCurve3(c.points.map(to3D));
  }
  return new THREE.CatmullRomCurve3(c.getPoints(32).map(to3D));
}

/** One SVG sub-path (a THREE.Path) into a closed-aware 3D CurvePath. */
export function pathToCurve3(path: THREE.Path): THREE.Curve<THREE.Vector3> | null {
  const curves = path.curves.map(curve2Dto3D);
  if (curves.length === 0) return null;

  const cp = new THREE.CurvePath<THREE.Vector3>();
  for (const c of curves) cp.add(c);

  // A closed path must be a seamless loop for getPointAt (Curve to Mesh) — add
  // the explicit closing segment, since CurvePath's autoClose only affects
  // getPoints/getSpacedPoints, not getPointAt.
  if (path.autoClose) {
    const first = curves[0].getPoint(0);
    const last = curves[curves.length - 1].getPoint(1);
    if (first.distanceToSquared(last) > 1e-9) {
      cp.add(new THREE.LineCurve3(last.clone(), first.clone()));
    }
  }
  return cp;
}

function parseSvg(text: string): THREE.Curve<THREE.Vector3>[] {
  const parsed = new SVGLoader().parse(text);
  const out: THREE.Curve<THREE.Vector3>[] = [];
  for (const shapePath of parsed.paths) {
    for (const subPath of shapePath.subPaths) {
      const c = pathToCurve3(subPath);
      if (c) out.push(c);
    }
  }
  return out;
}

/** Scale + offset applied to a curve's control points (recursing into CurvePaths). */
export function transformCurve3(c: THREE.Curve<THREE.Vector3>, s: number, ox: number, oy: number): THREE.Curve<THREE.Vector3> {
  const tp = (p: THREE.Vector3) => new THREE.Vector3(p.x * s + ox, p.y * s + oy, p.z * s);

  if (c instanceof THREE.CurvePath) {
    const cp = new THREE.CurvePath<THREE.Vector3>();
    for (const sub of (c as THREE.CurvePath<THREE.Vector3>).curves) cp.add(transformCurve3(sub, s, ox, oy));
    return cp;
  }
  if (c instanceof THREE.LineCurve3) return new THREE.LineCurve3(tp(c.v1), tp(c.v2));
  if (c instanceof THREE.CubicBezierCurve3) return new THREE.CubicBezierCurve3(tp(c.v0), tp(c.v1), tp(c.v2), tp(c.v3));
  if (c instanceof THREE.QuadraticBezierCurve3) return new THREE.QuadraticBezierCurve3(tp(c.v0), tp(c.v1), tp(c.v2));
  if (c instanceof THREE.CatmullRomCurve3) {
    return new THREE.CatmullRomCurve3(c.points.map(tp), c.closed, c.curveType, c.tension);
  }
  return new THREE.CatmullRomCurve3(c.getPoints(64).map(tp));
}

/**
 * SVG to Curves node — imports an .svg and converts every path into 3D curves
 * on the XY plane (Y flipped), ready for Curve to Mesh / Deform / Follow Path.
 */
export const SVG_TO_CURVES_NODE: NodeDefinition = {
  type: "curve/svg",
  label: "SVG to Curves",
  category: "curve",
  inputs: [{ id: "matrix", label: "Matrix", type: "matrix" }],
  outputs: [
    { id: "curve", label: "Curve (first)", type: "curve" },
    { id: "curves", label: "Curves (list)", type: "list" },
    { id: "geometry", label: "Curve Preview", type: "geometry" },
  ],
  defaultParams: {
    filePath: "",
    svgScale: 1,
    normalize: false,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "SVG File",
      kind: "file",
      accept: [".svg"],
      onLoaded: (nodeId, _path, content) => {
        const state = getSvgState(nodeId);
        try {
          state.curves = parseSvg(String(content));
        } catch (err) {
          console.error("Failed to parse SVG:", err);
          state.curves = [];
        }
        state.transformed = undefined;
        state.previewSignature = undefined;
      },
    },
    { id: "svgScale", label: "Scale", kind: "number", step: 0.1 },
    { id: "normalize", label: "Normalize (fit unit box)", kind: "boolean" },
    { id: "location", label: "Location", kind: "vector", group: "Transform" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
    { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getSvgState(ctx.nodeId);
    const raw = state.curves;

    const scale = Math.max(0, num(params.svgScale, 1));
    const normalize = Boolean(params.normalize);

    let s = scale;
    let ox = 0;
    let oy = 0;
    if (normalize && raw.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const c of raw) {
        for (const p of c.getPoints(64)) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
      const size = Math.max(maxX - minX, maxY - minY);
      if (size > 1e-9) {
        const ns = scale / size;
        ox = -((minX + maxX) / 2) * ns;
        oy = -((minY + maxY) / 2) * ns;
        s = ns;
      }
    }

    const key = `${scale}:${normalize}:${raw.length}`;
    if (state.transformed && state.lastKey === key) {
      const preview = svgPreviewGroup(state, state.transformed.map((c) => c.getPoints(128)), key);
      applySvgPose(preview, inputs, params, ctx);
      return { curve: state.transformed[0] ?? null, curves: state.transformed, geometry: preview };
    }

    const transformed = raw.map((c) => transformCurve3(c, s, ox, oy));
    state.transformed = transformed;
    state.lastKey = key;

    const preview = svgPreviewGroup(state, transformed.map((c) => c.getPoints(128)), key);
    applySvgPose(preview, inputs, params, ctx);

    return { curve: transformed[0] ?? null, curves: transformed, geometry: preview };
  },
};

/** Parses an SVG document into filled 2D shapes (holes resolved) via toShapes. */
function parseSvgShapes(text: string): THREE.Shape[] {
  const parsed = new SVGLoader().parse(text);
  const shapes: THREE.Shape[] = [];
  for (const shapePath of parsed.paths) {
    for (const shape of shapePath.toShapes()) {
      shapes.push(shape);
    }
  }
  return shapes;
}

/**
 * three's default ExtrudeGeometry UVs are world-space (the raw SVG coordinates
 * of each contour point), so a texture tiles hundreds of times and reads as a
 * flat colour. This generator normalises them to 0..1: the top/bottom faces
 * map the shape's bbox to the unit square, and the side walls run 0..1 along
 * the contour and up the wall.
 */
function normalizedUVGenerator(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  depth: number,
): {
  generateTopUV: (g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number) => THREE.Vector2[];
  generateSideWallUV: (g: THREE.ExtrudeGeometry, v: number[], a: number, b: number, c: number, d: number) => THREE.Vector2[];
} {
  const sx = maxX - minX || 1;
  const sy = maxY - minY || 1;
  const d = depth || 1;
  const top = (i: number, v: number[]) =>
    new THREE.Vector2((v[i * 3] - minX) / sx, (v[i * 3 + 1] - minY) / sy);
  return {
    generateTopUV: (_g, v, iA, iB, iC) => [top(iA, v), top(iB, v), top(iC, v)],
    generateSideWallUV: (_g, v, iA, iB, iC, iD) => {
      const p = (i: number) => ({ x: v[i * 3], y: v[i * 3 + 1], z: v[i * 3 + 2] });
      const a = p(iA);
      const b = p(iB);
      const c = p(iC);
      const e = p(iD);
      const useX = Math.abs(a.y - b.y) < Math.abs(a.x - b.x);
      const along = (q: { x: number; y: number }) => (useX ? (q.x - minX) / sx : (q.y - minY) / sy);
      const up = (q: { z: number }) => 1 - q.z / d;
      return [
        new THREE.Vector2(along(a), up(a)),
        new THREE.Vector2(along(b), up(b)),
        new THREE.Vector2(along(c), up(c)),
        new THREE.Vector2(along(e), up(e)),
      ];
    },
  };
}

interface SvgSolidState {
  shapes: THREE.Shape[];
  mesh?: THREE.Mesh;
  ownMaterial?: THREE.Material;
  geometrySignature?: string;
  group?: THREE.Group;
  previewSignature?: string;
}

const svgSolidCache = createNodeCache<SvgSolidState>((s) => {
  if (s.mesh) {
    s.mesh.geometry.dispose();
    if (s.ownMaterial) s.ownMaterial.dispose();
  }
  if (s.group) {
    s.group.traverse((child) => {
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }
});

function getSvgSolidState(nodeId: string): SvgSolidState {
  let state = svgSolidCache.get(nodeId);
  if (!state) {
    state = { shapes: [] };
    svgSolidCache.set(nodeId, state);
  }
  return state;
}

/**
 * SVG to Solid node — imports a closed .svg and extrudes its *filled* interior
 * into a 3D solid (holes resolved), instead of the outline. The shape is laid
 * on the XY plane (SVG's Y flipped) and extruded along Z.
 */
export const SVG_TO_SOLID_NODE: NodeDefinition = {
  type: "curve/svg_solid",
  label: "SVG to Solid",
  category: "curve",
  inputs: [
    { id: "depth", label: "Depth", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    filePath: "",
    svgScale: 1,
    normalize: false,
    depth: 0.3,
    bevelEnabled: false,
    bevelSize: 0.02,
    bevelThickness: 0.02,
    bevelSegments: 1,
    curveSegments: 24,
    color: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: 0,
    roughness: 0.4,
    metalness: 0.1,
    wireframe: 0,
    opacity: 1.0,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "SVG File",
      kind: "file",
      accept: [".svg"],
      onLoaded: (nodeId, _path, content) => {
        const state = getSvgSolidState(nodeId);
        try {
          state.shapes = parseSvgShapes(String(content));
        } catch (err) {
          console.error("Failed to parse SVG:", err);
          state.shapes = [];
        }
        state.geometrySignature = undefined;
        state.previewSignature = undefined;
      },
    },
    { id: "svgScale", label: "Scale", kind: "number", step: 0.1 },
    { id: "normalize", label: "Normalize (fit unit box)", kind: "boolean" },
    { id: "depth", label: "Depth (extrude)", kind: "number", step: 0.02 },
    { id: "bevelEnabled", label: "Bevel", kind: "boolean" },
    { id: "bevelSize", label: "Bevel Size", kind: "number", step: 0.01 },
    { id: "bevelThickness", label: "Bevel Thickness", kind: "number", step: 0.01 },
    { id: "bevelSegments", label: "Bevel Segments", kind: "number", step: 1 },
    { id: "curveSegments", label: "Curve Segments", kind: "number", step: 4 },
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
    const state = getSvgSolidState(ctx.nodeId);
    const shapes = state.shapes;

    if (!state.mesh) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state.mesh = mesh;
      state.ownMaterial = mat;
    }
    const mesh = state.mesh;

    const depth = Math.max(0, num(inputs.depth, params.depth));
    const svgScale = Math.max(0, num(params.svgScale, 1));
    const normalize = Boolean(params.normalize);
    const bevelEnabled = Boolean(params.bevelEnabled);
    const bevelSize = Math.max(0, num(params.bevelSize, 0.02));
    const bevelThickness = Math.max(0, num(params.bevelThickness, 0.02));
    const bevelSegments = Math.max(1, Math.round(num(params.bevelSegments, 1)));
    const curveSegments = Math.max(2, Math.round(num(params.curveSegments, 24)));

    // Shape bbox in SVG space — needed for both "normalize" and UV normalisation.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    if (shapes.length > 0) {
      for (const shape of shapes) {
        for (const p of shape.getPoints(64)) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }
    }

    // Uniform scale + (optional) centre-into-unit-box, in SVG space before Y flip.
    let s = svgScale;
    let ox = 0;
    let oy = 0;
    if (normalize) {
      const size = Math.max(maxX - minX, maxY - minY);
      if (Number.isFinite(size) && size > 1e-9) {
        const ns = svgScale / size;
        ox = -((minX + maxX) / 2) * ns;
        oy = ((minY + maxY) / 2) * ns;
        s = ns;
      }
    }

    const signature = JSON.stringify([
      shapes.length,
      depth,
      bevelEnabled,
      bevelSize,
      bevelThickness,
      bevelSegments,
      curveSegments,
      s,
      ox,
      oy,
    ]);
    if (signature !== state.geometrySignature) {
      state.geometrySignature = signature;
      mesh.geometry.dispose();
      if (shapes.length === 0) {
        mesh.geometry = new THREE.BufferGeometry();
      } else {
        const geo = new THREE.ExtrudeGeometry(shapes, {
          depth,
          bevelEnabled,
          bevelThickness,
          bevelSize,
          bevelSegments,
          curveSegments,
          UVGenerator: normalizedUVGenerator(minX, maxX, minY, maxY, depth),
        });
        // SVG (x, y-down) -> world (x*s+ox, -y*s+oy, z*s): scale + flip Y.
        geo.applyMatrix4(new THREE.Matrix4().set(s, 0, 0, 0, 0, -s, 0, 0, 0, 0, s, 0, ox, oy, 0, 1));
        mesh.geometry = geo;
      }
    }

    // The mesh sits at identity; a stable parent group carries the native pose
    // and also holds a gray outline preview so the curve is visible in 3D.
    if (!state.group) {
      state.group = new THREE.Group();
      state.group.userData.nodeId = ctx.nodeId;
    }
    const group = state.group;
    if (mesh.parent !== group) group.add(mesh);

    // Preview outline from the shape contours, in the same SVG->world space the
    // solid geometry was baked in (x*s+ox, -y*s+oy, z=0). Only rebuilt when the
    // transform or shape set changes.
    const previewSig = JSON.stringify([s, ox, oy, shapes.length]);
    if (previewSig !== state.previewSignature) {
      state.previewSignature = previewSig;
      for (const child of [...group.children]) {
        if (child !== mesh && child instanceof THREE.Line) {
          group.remove(child);
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      }
      for (const shape of shapes) {
        const pts = shape.getPoints(64).map((p) => new THREE.Vector3(p.x * s + ox, -p.y * s + oy, 0));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: SVG_PREVIEW_COLOR }),
        );
        group.add(line);
      }
    }

    applySvgPose(group, inputs, params, ctx);

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.DoubleSide, texParams);

    return primitiveOutputs(group);
  },
};

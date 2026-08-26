import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { uint8ToBase64 } from "./base64";

/** A typed-array attribute (position/color/normal/uv/index), base64-encoded to avoid the huge textual bloat of a plain JSON number array on a multi-million-point cloud. */
export interface SnapshotAttribute {
  itemSize: number;
  count: number;
  type: "Float32Array" | "Uint32Array" | "Uint16Array" | "Uint8Array";
  base64: string;
}

export interface SnapshotGeometry {
  index?: SnapshotAttribute;
  attributes: Partial<Record<"position" | "normal" | "color" | "uv", SnapshotAttribute>>;
  /**
   * Present when the source was a THREE.InstancedMesh (Array/Spawner/
   * Texture Pixel Spawner with GPU Instancing on) — per-instance 4x4
   * matrices (itemSize 16) and optional per-instance color, drawn as
   * `count` copies of the single template geometry above. Without this, a
   * GPU-instanced object would export as just its own single object matrix
   * — one copy, wherever the template geometry itself sits, instead of the
   * whole instanced set.
   */
  instances?: { count: number; matrices: SnapshotAttribute; colors?: SnapshotAttribute };
  /** Present on a multi-material mesh — see SnapshotNode.materials. Mirrors THREE.BufferGeometry.groups: which index/vertex range uses which entry of `materials`. */
  groups?: { start: number; count: number; materialIndex: number }[];
}

export interface SnapshotMaterial {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
  wireframe?: boolean;
  vertexColors?: boolean;
  roughness?: number;
  metalness?: number;
  /** Points only. */
  size?: number;
  sizeAttenuation?: boolean;
  /** Relative path (e.g. "textures/tex_0.png") into the export folder — see textureCapture.ts. Absent when this material has no map/normalMap, or the caller didn't pass a textureFileMap at all (single-file export mode). */
  mapFile?: string;
  normalMapFile?: string;
}

export interface SnapshotLight {
  kind: "ambient" | "directional" | "point" | "spot";
  color: number;
  intensity: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  /** World-space, only for directional/spot (their target is a separate Object3D in three.js). */
  targetPosition?: [number, number, number];
}

/** One baked frame's pose — see SnapshotNode.frames. */
export interface SnapshotFrame {
  matrix: number[];
  visible: boolean;
  /**
   * Points-only, and only actually populated by captureAnimatedScene: a
   * particle system's motion lives in its geometry's position (GPU
   * simulation rewriting per-particle positions every step), not in the
   * object's own transform matrix — the matrix-only animation every other
   * kind gets would leave particles frozen at their frame-0 positions.
   * Costs real export size (a per-frame copy of the whole point cloud) so
   * it's opt-in by kind rather than universal — see appendAnimatedFrame.
   */
  position?: SnapshotAttribute;
  color?: SnapshotAttribute;
}

export interface SnapshotNode {
  kind: "group" | "mesh" | "points" | "line" | "linesegments" | "light";
  name?: string;
  /** Column-major 4x4, this object's local matrix — frame 0's, when `frames` is present. */
  matrix: number[];
  visible: boolean;
  /**
   * Present only for an animated export (captureAnimatedScene): one entry
   * per baked frame, index 0 identical to `matrix`/`visible` above. Absent
   * for a static export — the player treats that as "one frame, hold
   * forever", the same object every SnapshotNode used to be before baked
   * animation existed.
   */
  frames?: SnapshotFrame[];
  geometry?: SnapshotGeometry;
  /** The first (or only) material — always populated when the object has any, single-material or not, so a consumer that ignores `materials` still renders something reasonable. */
  material?: SnapshotMaterial;
  /** Present only on a multi-material mesh (object.material was an array of length > 1) — every material, in geometry.groups' materialIndex order. See SnapshotGeometry.groups for which faces use which entry. */
  materials?: SnapshotMaterial[];
  light?: SnapshotLight;
  children: SnapshotNode[];
}

function encodeAttribute(attr: THREE.BufferAttribute): SnapshotAttribute {
  const array = attr.array as Float32Array | Uint32Array | Uint16Array | Uint8Array;
  const type = array.constructor.name as SnapshotAttribute["type"];
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return { itemSize: attr.itemSize, count: attr.count, type, base64: uint8ToBase64(bytes) };
}

function encodeGeometry(geometry: THREE.BufferGeometry, instancedMesh?: THREE.InstancedMesh, includeGroups = false): SnapshotGeometry {
  const attributes: SnapshotGeometry["attributes"] = {};
  for (const name of ["position", "normal", "color", "uv"] as const) {
    const attr = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (attr) attributes[name] = encodeAttribute(attr);
  }
  const index = geometry.getIndex();
  const result: SnapshotGeometry = { attributes, index: index ? encodeAttribute(index) : undefined };

  if (instancedMesh) {
    result.instances = {
      count: instancedMesh.count,
      // InstancedBufferAttribute is a BufferAttribute (array/itemSize/count)
      // in every way encodeAttribute cares about — itemSize 16 (one 4x4
      // matrix per instance), so this round-trips as a single flat
      // Float32Array the player slices back into per-instance matrices.
      matrices: encodeAttribute(instancedMesh.instanceMatrix as unknown as THREE.BufferAttribute),
      colors: instancedMesh.instanceColor ? encodeAttribute(instancedMesh.instanceColor as unknown as THREE.BufferAttribute) : undefined,
    };
  }

  if (includeGroups && geometry.groups.length > 0) {
    result.groups = geometry.groups.map((g) => ({ start: g.start, count: g.count, materialIndex: g.materialIndex ?? 0 }));
  }

  return result;
}

function encodeVec3Attribute(count: number, get: (i: number) => [number, number, number]): SnapshotAttribute {
  const array = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const [x, y, z] = get(i);
    array[i * 3] = x;
    array[i * 3 + 1] = y;
    array[i * 3 + 2] = z;
  }
  return { itemSize: 3, count, type: "Float32Array", base64: uint8ToBase64(new Uint8Array(array.buffer)) };
}

/**
 * LineSegments2/Line2 (three/examples' fat-line technique, used by Trail,
 * Connectivity Lines, Curves to Lines, Raycast hit lines, ...) store their
 * shape as per-SEGMENT start/end points interleaved into "instanceStart"/
 * "instanceEnd" attributes — not the plain "position" attribute
 * encodeGeometry reads. Left alone, that geometry captures as empty
 * (0 vertices): the object still shows up as a "line" node, but with
 * nothing to draw, which is exactly why a Trail exported as nothing at
 * all. Unpacked here into an ordinary non-indexed position (+ optional
 * per-vertex color) pair-per-segment layout — what a plain THREE.
 * LineSegments expects — trading the fat-line's screen-space width/
 * dashing for an ordinary thin line in the export: less faithful, but
 * actually visible instead of silently empty.
 */
function encodeFatLineGeometry(geometry: THREE.BufferGeometry): SnapshotGeometry {
  const start = geometry.getAttribute("instanceStart") as THREE.InterleavedBufferAttribute | undefined;
  const end = geometry.getAttribute("instanceEnd") as THREE.InterleavedBufferAttribute | undefined;
  if (!start || !end) return { attributes: {} };

  // `start.count` is the allocated buffer's FULL capacity, not how many
  // segments are actually meant to be drawn this frame — a growable
  // LineSegments2 user (Capture Trails chief among them) over-allocates and
  // caps what's visible via geometry.instanceCount instead of resizing the
  // buffer every frame. Reading start.count directly captured the whole
  // over-allocated buffer, most of it unused/zeroed slots — thousands of
  // degenerate zero-length segments piled at the origin alongside the real
  // trail, which is what made an exported Trail look like broken garbage
  // (or swamp the camera framing so the real trail read as invisible)
  // rather than nothing at all.
  const instancedGeometry = geometry as THREE.InstancedBufferGeometry;
  const segmentCount = Number.isFinite(instancedGeometry.instanceCount) ? Math.min(start.count, instancedGeometry.instanceCount) : start.count;
  const position = encodeVec3Attribute(segmentCount * 2, (i) => {
    const seg = Math.floor(i / 2);
    const attr = i % 2 === 0 ? start : end;
    return [attr.getX(seg), attr.getY(seg), attr.getZ(seg)];
  });

  const attributes: SnapshotGeometry["attributes"] = { position };

  const colorStart = geometry.getAttribute("instanceColorStart") as THREE.InterleavedBufferAttribute | undefined;
  const colorEnd = geometry.getAttribute("instanceColorEnd") as THREE.InterleavedBufferAttribute | undefined;
  if (colorStart && colorEnd) {
    attributes.color = encodeVec3Attribute(segmentCount * 2, (i) => {
      const seg = Math.floor(i / 2);
      const attr = i % 2 === 0 ? colorStart : colorEnd;
      return [attr.getX(seg), attr.getY(seg), attr.getZ(seg)];
    });
  }

  return { attributes };
}

/** `textureFileMap` keys by THREE.Texture.uuid — see textureCapture.ts's collectTextures, which assigns the filenames this looks up. Absent (or a texture missing from it) just means no texture file was exported for that slot — encodeMaterial degrades to its flat-color fields, same as before textures were supported at all. */
function encodeMaterial(material: THREE.Material, textureFileMap?: Map<string, string>): SnapshotMaterial {
  const out: SnapshotMaterial = {
    opacity: material.opacity,
    transparent: material.transparent,
    // "vertexColors" only means something once decoded (Points/mesh with a
    // color attribute) — capturing the flag here is enough, the geometry
    // carries the actual per-vertex data.
    vertexColors: (material as THREE.MeshStandardMaterial).vertexColors ?? false,
  };
  if ("color" in material && material.color instanceof THREE.Color) out.color = material.color.getHex();
  if ("emissive" in material && (material as THREE.MeshStandardMaterial).emissive instanceof THREE.Color) {
    out.emissive = (material as THREE.MeshStandardMaterial).emissive.getHex();
  }
  if ("emissiveIntensity" in material) out.emissiveIntensity = (material as THREE.MeshStandardMaterial).emissiveIntensity;
  if ("wireframe" in material) out.wireframe = Boolean((material as THREE.MeshStandardMaterial).wireframe);
  if ("roughness" in material) out.roughness = (material as THREE.MeshStandardMaterial).roughness;
  if ("metalness" in material) out.metalness = (material as THREE.MeshStandardMaterial).metalness;
  if (material instanceof THREE.PointsMaterial) {
    out.size = material.size;
    out.sizeAttenuation = material.sizeAttenuation;
  }
  if (textureFileMap) {
    const map = (material as THREE.MeshStandardMaterial).map;
    const normalMap = (material as THREE.MeshStandardMaterial).normalMap;
    if (map) out.mapFile = textureFileMap.get(map.uuid);
    if (normalMap) out.normalMapFile = textureFileMap.get(normalMap.uuid);
  }
  return out;
}

function encodeLight(light: THREE.Light): SnapshotLight | null {
  if (light instanceof THREE.AmbientLight) {
    return { kind: "ambient", color: light.color.getHex(), intensity: light.intensity };
  }
  if (light instanceof THREE.DirectionalLight) {
    const target = light.target.getWorldPosition(new THREE.Vector3());
    return { kind: "directional", color: light.color.getHex(), intensity: light.intensity, targetPosition: [target.x, target.y, target.z] };
  }
  if (light instanceof THREE.PointLight) {
    return { kind: "point", color: light.color.getHex(), intensity: light.intensity, distance: light.distance };
  }
  if (light instanceof THREE.SpotLight) {
    const target = light.target.getWorldPosition(new THREE.Vector3());
    return {
      kind: "spot",
      color: light.color.getHex(),
      intensity: light.intensity,
      distance: light.distance,
      angle: light.angle,
      penumbra: light.penumbra,
      targetPosition: [target.x, target.y, target.z],
    };
  }
  return null;
}

/**
 * Classifies a drawable object into a snapshot kind + its geometry —
 * shared by captureObject3D (static) and buildAnimatedFrame0 (animated),
 * which otherwise duplicate this exact decision. Order matters: LineSegments2
 * is itself a THREE.Mesh subclass (three's fat-line technique), and plain
 * THREE.LineSegments is itself a THREE.Line subclass — each more-specific
 * check has to run before the broader one it would otherwise be swallowed
 * by, or a LineSegments (disjoint pairs: v0-v1, v2-v3, ...) gets rebuilt as
 * a continuous THREE.Line polyline, drawing spurious connecting strokes
 * between what were meant to be separate segments.
 */
/**
 * Every material off a Mesh/Points/Line/LineSegments — all four declare
 * `.material: Material | Material[]`, just not through a common base type
 * TS can see. `first` is always populated (single-material's own material,
 * or a multi-material's [0]) so a consumer that ignores `all` still gets a
 * reasonable single appearance; `all` is only set when there's genuinely
 * more than one, matching SnapshotNode.materials' own contract.
 */
function materialsOf(object: THREE.Object3D): { first: THREE.Material | undefined; all?: THREE.Material[] } {
  const material = (object as unknown as { material?: THREE.Material | THREE.Material[] }).material;
  if (Array.isArray(material)) {
    return { first: material[0], all: material.length > 1 ? material : undefined };
  }
  return { first: material };
}

/**
 * `isMultiMaterial` gates whether geometry.groups gets captured at all —
 * most single-material primitive geometries (BoxGeometry chief among them)
 * carry multiple internal groups regardless (one per face, for the
 * multi-material case three.js always supports), which would otherwise
 * read as "this mesh has several distinct materials" for an object that
 * only ever had one.
 */
function classifyDrawable(
  object: THREE.Object3D,
  isMultiMaterial: boolean,
): { kind: "mesh" | "points" | "line" | "linesegments"; geometry: SnapshotGeometry } | null {
  if (object instanceof LineSegments2) {
    return { kind: "linesegments", geometry: encodeFatLineGeometry(object.geometry) };
  }
  if (object instanceof THREE.LineSegments) {
    return { kind: "linesegments", geometry: encodeGeometry(object.geometry) };
  }
  if (object instanceof THREE.Points) {
    return { kind: "points", geometry: encodeGeometry(object.geometry) };
  }
  if (object instanceof THREE.Line) {
    return { kind: "line", geometry: encodeGeometry(object.geometry) };
  }
  if (object instanceof THREE.InstancedMesh) {
    return { kind: "mesh", geometry: encodeGeometry(object.geometry, object, isMultiMaterial) };
  }
  if (object instanceof THREE.Mesh) {
    return { kind: "mesh", geometry: encodeGeometry(object.geometry, undefined, isMultiMaterial) };
  }
  return null;
}

/** Same guard primitiveOutputs (object.ts) uses: every primitive/object node in this app sets matrixAutoUpdate=false and writes `.matrix` directly (composeNativeMatrix), leaving position/quaternion/scale at their default identity. An unconditional updateMatrix() recomputes `.matrix` FROM those stale identity properties, silently collapsing the object back to the origin. */
function localMatrixOf(object: THREE.Object3D): number[] {
  if (object.matrixAutoUpdate) object.updateMatrix();
  return object.matrix.toArray();
}

/**
 * Walks a live THREE.Object3D tree into a JSON-safe, self-contained
 * snapshot: geometry attributes as base64 (see encodeAttribute — a plain
 * number array here would make a multi-million-point cloud's exported page
 * many times its source PLY's size), materials reduced to a handful of
 * scalar/color properties plus an optional texture file reference (see
 * textureFileMap), and lights captured by type. Skips helpers/gizmos/
 * cameras — anything that isn't a Mesh, Points, Line, or Light contributes
 * only as a transform carrier (kind: "group") for its children.
 */
export function captureObject3D(object: THREE.Object3D, textureFileMap?: Map<string, string>): SnapshotNode | null {
  if (object instanceof THREE.Camera) return null;

  const matrix = localMatrixOf(object);
  const children = object.children
    .map((c) => captureObject3D(c, textureFileMap))
    .filter((c): c is SnapshotNode => c !== null);

  if (object instanceof THREE.Light) {
    const light = encodeLight(object);
    if (!light) return null;
    return { kind: "light", name: object.name || undefined, matrix, visible: object.visible, light, children };
  }

  const { first, all } = materialsOf(object);
  const drawable = classifyDrawable(object, Boolean(all));
  if (drawable) {
    return {
      kind: drawable.kind,
      name: object.name || undefined,
      matrix,
      visible: object.visible,
      geometry: drawable.geometry,
      material: first ? encodeMaterial(first, textureFileMap) : undefined,
      materials: all ? all.map((m) => encodeMaterial(m, textureFileMap)) : undefined,
      children,
    };
  }

  // A bare Object3D/Group — only worth keeping if it carries visible content.
  if (children.length === 0) return null;
  return { kind: "group", name: object.name || undefined, matrix, visible: object.visible, children };
}

/** Capture every scene-root object as siblings under one synthetic top-level group. */
export function captureScene(roots: THREE.Object3D[], textureFileMap?: Map<string, string>): SnapshotNode {
  const children = roots.map((r) => captureObject3D(r, textureFileMap)).filter((c): c is SnapshotNode => c !== null);
  const identity = new THREE.Matrix4().toArray();
  return { kind: "group", matrix: identity, visible: true, children };
}

/**
 * The animated capture machinery below only tracks transform (matrix/
 * visible) per frame; geometry/material/light are read from frame 0 only —
 * baking a mesh that rebuilds its own geometry every frame (a Lattice
 * deform driven by a Time node, a particle sim, ...) is out of scope here,
 * only rigid transform animation (position/rotation/scale driven by an
 * Oscillator, keyframes, a Curve Array's own motion, …). A child whose
 * presence differs frame to frame (topology change, not just a transform)
 * is dropped from the animated tree entirely rather than guessed at.
 *
 * Tracks a SnapshotNode being built across frames, plus what's needed to
 * find the SAME live object again on the next frame: `liveChildIndices[k]`
 * is which raw index of the (frame-0) object's `.children` produced
 * `node.children[k]` — captureObject3D-style pruning (dropping cameras,
 * empty groups) means the kept children are a strict subset of the raw
 * ones, so a later frame's matching live child isn't simply
 * `liveObject.children[k]`.
 */
interface AnimatedBuilder {
  node: SnapshotNode;
  liveChildIndices: number[];
  childBuilders: AnimatedBuilder[];
}

/**
 * Builds the tree AND captures frame 0 in one pass — critically, in the
 * SAME synchronous call that walks the just-evaluated live objects, before
 * anything overwrites them (see appendFrame's doc for why that ordering
 * matters: many nodes hand back a single mesh/points instance cached and
 * MUTATED per node id across evaluations, not a fresh object per frame).
 */
/** See SnapshotFrame.position's doc — only a Points object's per-frame position/color is worth the extra size; everything else's animation is transform-only. */
function pointsFrameExtra(object: THREE.Object3D): { position?: SnapshotAttribute; color?: SnapshotAttribute } {
  if (!(object instanceof THREE.Points)) return {};
  const position = object.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  const color = object.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  return { position: position ? encodeAttribute(position) : undefined, color: color ? encodeAttribute(color) : undefined };
}

function buildAnimatedFrame0(object: THREE.Object3D, textureFileMap?: Map<string, string>): AnimatedBuilder | null {
  if (object instanceof THREE.Camera) return null;

  const matrix = localMatrixOf(object);
  const visible = object.visible;

  const childBuilders: AnimatedBuilder[] = [];
  const liveChildIndices: number[] = [];
  object.children.forEach((child, idx) => {
    const built = buildAnimatedFrame0(child, textureFileMap);
    if (built) {
      childBuilders.push(built);
      liveChildIndices.push(idx);
    }
  });
  const children = childBuilders.map((b) => b.node);

  let node: SnapshotNode;
  const { first, all } = materialsOf(object);
  const drawable = classifyDrawable(object, Boolean(all));
  if (object instanceof THREE.Light) {
    const light = encodeLight(object);
    if (!light) return null;
    node = { kind: "light", name: object.name || undefined, matrix, visible, frames: [{ matrix, visible }], light, children };
  } else if (drawable) {
    node = {
      kind: drawable.kind,
      name: object.name || undefined,
      matrix,
      visible,
      frames: [{ matrix, visible, ...pointsFrameExtra(object) }],
      geometry: drawable.geometry,
      material: first ? encodeMaterial(first, textureFileMap) : undefined,
      materials: all ? all.map((m) => encodeMaterial(m, textureFileMap)) : undefined,
      children,
    };
  } else {
    if (children.length === 0) return null;
    node = { kind: "group", name: object.name || undefined, matrix, visible, frames: [{ matrix, visible }], children };
  }

  return { node, liveChildIndices, childBuilders };
}

/**
 * Reads ONE more frame off `liveObject` — the freshly re-evaluated graph's
 * object at this exact tree position — and appends it, immediately, to the
 * matching builder's `frames`. "Immediately" is load-bearing: a Box/Sphere/
 * OBJ/etc. node hands back the SAME cached THREE.Mesh instance on every
 * evaluate() call for a given node id (see nodeCaches.ts), mutated in place
 * — collecting live object REFERENCES across a whole frame loop and only
 * reading `.matrix` afterward would have every "frame" pointing at the
 * identical, by-then-overwritten object, silently baking N copies of
 * whatever the LAST frame happened to be. Reading right after each frame's
 * evaluateGraph() call, before the next one mutates that same instance, is
 * what actually captures distinct per-frame poses.
 */
function appendAnimatedFrame(builder: AnimatedBuilder, liveObject: THREE.Object3D): void {
  builder.node.frames!.push({ matrix: localMatrixOf(liveObject), visible: liveObject.visible, ...pointsFrameExtra(liveObject) });
  for (let k = 0; k < builder.childBuilders.length; k++) {
    const liveChild = liveObject.children[builder.liveChildIndices[k]];
    if (!liveChild) continue; // topology changed since frame 0 — stop animating this subtree rather than guess
    appendAnimatedFrame(builder.childBuilders[k], liveChild);
  }
}

/**
 * The animated counterpart of captureScene: `getRootsForFrame(frame)` is
 * called once per baked frame — expected to re-evaluate the graph AND
 * return that frame's scene-root objects, called in increasing frame order
 * so this can read each frame's matrices before the next call's evaluation
 * overwrites them (see appendAnimatedFrame's doc). `frameCount` of 1
 * degrades to exactly captureScene's shape plus a length-1 `frames` array,
 * so the player's animated/static code path can stay unconditional.
 */
export function captureAnimatedScene(
  frameCount: number,
  getRootsForFrame: (frame: number) => THREE.Object3D[],
  textureFileMap?: Map<string, string>,
): SnapshotNode {
  const frame0Roots = getRootsForFrame(0);
  const rootBuilders: AnimatedBuilder[] = [];
  const keptRootIndices: number[] = [];
  frame0Roots.forEach((r, i) => {
    const built = buildAnimatedFrame0(r, textureFileMap);
    if (built) {
      rootBuilders.push(built);
      keptRootIndices.push(i);
    }
  });

  for (let frame = 1; frame < frameCount; frame++) {
    const roots = getRootsForFrame(frame);
    for (let k = 0; k < rootBuilders.length; k++) {
      const liveRoot = roots[keptRootIndices[k]];
      if (!liveRoot) continue;
      appendAnimatedFrame(rootBuilders[k], liveRoot);
    }
  }

  const identity = new THREE.Matrix4().toArray();
  const frames: SnapshotFrame[] = Array.from({ length: frameCount }, () => ({ matrix: identity, visible: true }));
  return { kind: "group", matrix: identity, visible: true, frames, children: rootBuilders.map((b) => b.node) };
}

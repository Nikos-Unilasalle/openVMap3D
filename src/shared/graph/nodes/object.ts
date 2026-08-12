import * as THREE from "three";
import { NodeDefinition } from "../types";
import { toBoolean } from "../sockets";
import { defaultFont } from "../../three/fonts/helvetikerFont";



/**
 * Meshes are stable GPU resources, not values a pure function can hand back
 * fresh every frame — the viewport needs the *same* Object3D reference every
 * evaluation so it can keep it in its THREE.Scene rather than re-adding a new
 * one 60 times a second. Cached here, outside the pure evaluate(), keyed by
 * the node's own id (ctx.nodeId) — same shape as OpenVMap's texture cache.
 * No release hook yet: fine for the smoke-test scale of graphs this engine
 * runs today, but this cache will leak across full node deletion once the
 * editor can delete nodes — needs a disposeNode(id) call from wherever that
 * lands, tracked as a follow-up, not solved here.
 */
const meshCache = new Map<string, THREE.Mesh>();

function boxMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/**
 * "Polygon or imported mesh, same node type" per BIBLE.md — box is the one
 * primitive implemented today, standing in for the general case while the
 * pipeline itself gets proven end to end. More primitives (plane, sphere,
 * imported glTF) are additive later, same node shape.
 */
export const OBJECT_BOX_NODE: NodeDefinition = {
  type: "object/box",
  label: "Box",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = boxMesh(ctx.nodeId);

    // While this node's mesh is being dragged by the gizmo, leave its matrix
    // alone — otherwise this frame's graph-driven copy would immediately
    // overwrite whatever the drag just set (see EvalContext.liveEditNodeId).
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

function planeMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** 2D Plane polygon primitive (flat z=0 quad in 3D). */
export const OBJECT_PLANE_NODE: NodeDefinition = {
  type: "object/plane",
  label: "Plane",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = planeMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

function sphereMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** Sphere 3D geometry primitive. */
export const OBJECT_SPHERE_NODE: NodeDefinition = {
  type: "object/sphere",
  label: "Sphere",
  category: "structure",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { color: new THREE.Color(0xffffff) },
  paramFields: [{ id: "color", label: "Color (fallback)", kind: "color" }],
  evaluate: (inputs, params, ctx) => {
    const mesh = sphereMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const color = inputs.color instanceof THREE.Color ? inputs.color : (params.color as THREE.Color);
    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    return { geometry: mesh };
  },
};

const FONT_FAMILIES = [
  "sans-serif",
  "serif",
  "monospace",
  "Arial",
  "Helvetica",
  "Verdana",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Courier New",
  "Impact",
  "Comic Sans MS",
];

function asColor(v: unknown, fallback: THREE.Color): THREE.Color {
  if (v instanceof THREE.Color) return v;
  if (typeof v === "string" || typeof v === "number") {
    try {
      return new THREE.Color(v);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

interface TextMeshState {
  mesh: THREE.Mesh;
  lastText?: string;
  lastFontSize?: number;
  lastDepth?: number;
}

const textMeshCache = new Map<string, TextMeshState>();

function textMesh(nodeId: string): TextMeshState {
  const existing = textMeshCache.get(nodeId);
  if (existing) return existing;

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;

  const state: TextMeshState = { mesh };
  textMeshCache.set(nodeId, state);
  return state;
}

/** 3D Extruded Text Object rendered with vector font glyph outlines, depth extrusion and color control. */
export const OBJECT_TEXT_NODE: NodeDefinition = {
  type: "object/text",
  label: "Text",
  category: "structure",
  inputs: [
    { id: "text", label: "Text", type: "text" },
    { id: "font", label: "Font", type: "text" },
    { id: "fontSize", label: "Font Size", type: "value" },
    { id: "depth", label: "Depth", type: "value" },
    { id: "color", label: "Color", type: "color" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { text: "OpenVMap3D", font: "sans-serif", fontSize: 64, depth: 0.1, color: new THREE.Color(0xffffff) },
  paramFields: [
    { id: "text", label: "Text (fallback)", kind: "text" },
    { id: "font", label: "Font Family", kind: "select", options: FONT_FAMILIES },
    { id: "fontSize", label: "Font Size (px)", kind: "number" },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
    { id: "color", label: "Color (fallback)", kind: "color" },
  ],
  evaluate: (inputs, params, ctx) => {
    const textState = textMesh(ctx.nodeId);
    const mesh = textState.mesh;

    const textStr = inputs.text !== undefined ? String(inputs.text) : String(params.text ?? "OpenVMap3D");
    const fontSize = Math.max(8, inputs.fontSize !== undefined ? Number(inputs.fontSize) || 64 : Number(params.fontSize) || 64);
    const depth = Math.max(0.001, inputs.depth !== undefined ? Number(inputs.depth) : Number(params.depth) ?? 0.1);
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));

    (mesh.material as THREE.MeshStandardMaterial).color.copy(color);

    const baseMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();

    const stateChanged =
      textState.lastText !== textStr ||
      textState.lastFontSize !== fontSize ||
      textState.lastDepth !== depth;

    if (stateChanged) {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      // Generate 2D vector shapes from typeface font glyph outlines for each character
      const scale = fontSize * 0.015;
      const shapes = defaultFont.generateShapes(textStr || " ", scale);

      // Create ExtrudeGeometry for TRUE 3D VECTOR EXTRUDED LETTER GLYPHS!
      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: Math.min(0.02, depth * 0.2),
        bevelSize: Math.min(0.01, depth * 0.1),
        bevelSegments: 3,
        curveSegments: 12,
      });

      // Center geometry around its local bounding box origin
      geometry.center();

      mesh.geometry = geometry;

      textState.lastText = textStr;
      textState.lastFontSize = fontSize;
      textState.lastDepth = depth;
    }

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(baseMatrix);
    }

    return { geometry: mesh };
  },
};

const ALIGNMENT_OPTIONS = ["center", "left", "right"];
const LABEL_POSITION_OPTIONS = ["above", "above_aligned", "below", "below_flat"];

interface LabelMeshState {
  mesh: THREE.Mesh;
  canvas?: HTMLCanvasElement;
  texture?: THREE.CanvasTexture;
  lastText?: string;
  aspect?: number;
}

interface BarGraphState {
  group: THREE.Group;
  unitGeometry: THREE.BoxGeometry;
  barsGroup: THREE.Group;
  labelsGroup: THREE.Group;
  labelStates: Map<number, LabelMeshState>;
}

const barGraphCache = new Map<string, BarGraphState>();

function barGraphState(nodeId: string): BarGraphState {
  const existing = barGraphCache.get(nodeId);
  if (existing) return existing;

  const group = new THREE.Group();
  const barsGroup = new THREE.Group();
  const labelsGroup = new THREE.Group();
  group.add(barsGroup);
  group.add(labelsGroup);

  const unitGeometry = new THREE.BoxGeometry(1, 1, 1);
  const state: BarGraphState = {
    group,
    unitGeometry,
    barsGroup,
    labelsGroup,
    labelStates: new Map(),
  };
  barGraphCache.set(nodeId, state);
  return state;
}

function getOrCreateLabelState(state: BarGraphState, index: number): LabelMeshState {
  const existing = state.labelStates.get(index);
  if (existing) return existing;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }),
  );
  state.labelsGroup.add(mesh);

  const labelState: LabelMeshState = { mesh };
  state.labelStates.set(index, labelState);
  return labelState;
}

/** 3D Bar Graph object — displays a series of aligned 3D volume bars driven by a list of values and colors. */
export const OBJECT_BAR_GRAPH_NODE: NodeDefinition = {
  type: "object/bar-graph",
  label: "Bar Graph",
  category: "structure",
  inputs: [
    { id: "values", label: "Values", type: "list" },
    { id: "colors", label: "Colors", type: "list" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    count: 10,
    spacing: 0.2,
    barWidth: 0.8,
    barDepth: 0.8,
    minHeight: 0.05,
    maxHeight: 4.0,
    alignment: "center",
    color: new THREE.Color(0x38bdf8),
    showLabels: 1,
    labelPosition: "above",
    labelHeight: 5.0,
    labelGap: 0.2,
    labelDecimals: 1,
  },
  paramFields: [
    { id: "count", label: "Bar Count", kind: "number" },
    { id: "spacing", label: "Spacing", kind: "number", step: 0.05 },
    { id: "barWidth", label: "Bar Width", kind: "number", step: 0.05 },
    { id: "barDepth", label: "Bar Depth", kind: "number", step: 0.05 },
    { id: "minHeight", label: "Min Height", kind: "number", step: 0.01 },
    { id: "maxHeight", label: "Height Scale", kind: "number", step: 0.1 },
    { id: "alignment", label: "Alignment", kind: "select", options: ALIGNMENT_OPTIONS },
    { id: "color", label: "Default Color", kind: "color" },
    { id: "showLabels", label: "Show Value Labels", kind: "boolean" },
    { id: "labelPosition", label: "Label Position", kind: "select", options: LABEL_POSITION_OPTIONS },
    { id: "labelHeight", label: "Aligned Label Height", kind: "number", step: 0.5 },
    { id: "labelGap", label: "Label Gap", kind: "number", step: 0.05 },
    { id: "labelDecimals", label: "Label Decimals", kind: "number" },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = barGraphState(ctx.nodeId);
    const { group, unitGeometry, barsGroup, labelsGroup } = state;

    const count = Math.max(1, Math.min(200, Math.floor(Number(params.count) || 10)));
    const spacing = Math.max(0, Number(params.spacing) ?? 0.2);
    const barWidth = Math.max(0.01, Number(params.barWidth) ?? 0.8);
    const barDepth = Math.max(0.01, Number(params.barDepth) ?? 0.8);
    const minHeight = Math.max(0, Number(params.minHeight) ?? 0.05);
    const maxHeight = Math.max(0, Number(params.maxHeight) ?? 4.0);
    const alignment = String(params.alignment || "center");
    const defaultColor = asColor(params.color, new THREE.Color(0x38bdf8));

    const showLabels = toBoolean(params.showLabels ?? 1);
    const labelPosition = String(params.labelPosition || "above");
    const labelHeight = Number(params.labelHeight) ?? 5.0;
    const labelGap = Number(params.labelGap) ?? 0.2;
    const labelDecimals = Math.max(0, Math.floor(Number(params.labelDecimals) ?? 1));

    const valuesList = Array.isArray(inputs.values) ? inputs.values : [];
    const colorsList = Array.isArray(inputs.colors) ? inputs.colors : [];

    const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
    group.matrixAutoUpdate = false;
    group.matrix.copy(matrix);

    // Adjust children count in barsGroup
    while (barsGroup.children.length < count) {
      const mesh = new THREE.Mesh(
        unitGeometry,
        new THREE.MeshStandardMaterial({ color: 0xffffff }),
      );
      barsGroup.add(mesh);
    }
    while (barsGroup.children.length > count) {
      const child = barsGroup.children[barsGroup.children.length - 1] as THREE.Mesh;
      barsGroup.remove(child);
      if (child.material) {
        (child.material as THREE.Material).dispose();
      }
    }

    // Calculate layout positioning along X axis
    const stepX = barWidth + spacing;
    const totalWidth = count * barWidth + (count - 1) * spacing;

    let startX = 0;
    if (alignment === "center") {
      startX = -totalWidth / 2 + barWidth / 2;
    } else if (alignment === "left") {
      startX = barWidth / 2;
    } else if (alignment === "right") {
      startX = -totalWidth + barWidth / 2;
    }

    labelsGroup.visible = showLabels;

    for (let i = 0; i < count; i++) {
      const mesh = barsGroup.children[i] as THREE.Mesh;
      if (!mesh) continue;

      const rawVal = valuesList[i] !== undefined ? Number(valuesList[i]) || 0 : 0;
      const height = Math.max(minHeight, rawVal * maxHeight);

      const barColor = colorsList[i] !== undefined
        ? asColor(colorsList[i], defaultColor)
        : defaultColor;

      const posX = startX + i * stepX;
      const posY = height / 2; // Sit on ground plane Y=0

      mesh.position.set(posX, posY, 0);
      mesh.scale.set(barWidth, height, barDepth);
      (mesh.material as THREE.MeshStandardMaterial).color.copy(barColor);

      // Value label handling
      if (showLabels) {
        const labelState = getOrCreateLabelState(state, i);
        const labelMesh = labelState.mesh;
        labelMesh.visible = true;

        const textStr = rawVal.toFixed(labelDecimals);

        if (labelState.lastText !== textStr && typeof document !== "undefined" && document.createElement) {
          if (!labelState.canvas) labelState.canvas = document.createElement("canvas");
          const canvas = labelState.canvas;
          const ctx2d = canvas.getContext ? canvas.getContext("2d") : null;

          if (ctx2d) {
            const fontSize = 256;
            ctx2d.font = `bold ${fontSize}px sans-serif`;
            const metrics = ctx2d.measureText(textStr);
            const w = Math.max(128, Math.ceil((metrics.width || 128) + fontSize * 0.4));
            const h = Math.max(64, Math.ceil(fontSize * 1.4));
            canvas.width = w;
            canvas.height = h;

            ctx2d.font = `bold ${fontSize}px sans-serif`;
            ctx2d.fillStyle = "#ffffff";
            ctx2d.textAlign = "center";
            ctx2d.textBaseline = "middle";
            ctx2d.clearRect(0, 0, w, h);
            ctx2d.fillText(textStr, w / 2, h / 2);

            if (labelState.texture) labelState.texture.dispose();
            const tex = new THREE.CanvasTexture(canvas);
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            tex.anisotropy = 16;
            labelState.texture = tex;
            (labelMesh.material as THREE.MeshBasicMaterial).map = tex;
            (labelMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;

            labelState.aspect = w / h;
          }
          labelState.lastText = textStr;
        }

        const aspect = labelState.aspect ?? 2;
        const labelWorldHeight = 0.4;
        const labelWorldWidth = labelWorldHeight * aspect;
        labelMesh.scale.set(labelWorldWidth, labelWorldHeight, 1);

        if (labelPosition === "below") {
          labelMesh.position.set(posX, -labelGap - labelWorldHeight / 2, barDepth / 2 + 0.01);
          labelMesh.rotation.set(0, 0, 0);
        } else if (labelPosition === "below_flat") {
          labelMesh.position.set(posX, 0.01, barDepth / 2 + labelWorldWidth / 2 + labelGap);
          labelMesh.rotation.set(-Math.PI / 2, 0, 0);
        } else if (labelPosition === "above_aligned") {
          labelMesh.position.set(posX, labelHeight, 0);
          labelMesh.rotation.set(0, 0, 0);
        } else {
          // "above" (default)
          labelMesh.position.set(posX, height + labelGap + labelWorldHeight / 2, 0);
          labelMesh.rotation.set(0, 0, 0);
        }
      }
    }

    // Hide extra label meshes beyond count
    for (const [idx, labelState] of state.labelStates.entries()) {
      if (idx >= count) {
        labelState.mesh.visible = false;
      }
    }

    return { geometry: group };
  },
};







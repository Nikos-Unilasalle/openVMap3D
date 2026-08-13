import * as THREE from "three";
import { NodeDefinition, ParamFieldDef } from "../types";
import { toBoolean } from "../sockets";
import { defaultFont } from "../../three/fonts/helvetikerFont";
import { createNodeCache, disposeObject3D } from "../nodeCaches";

export function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function asColor(v: unknown, fallback = new THREE.Color(0xffffff)): THREE.Color {
  if (v instanceof THREE.Color) return v;
  if (typeof v === "object" && v !== null && "r" in v && "g" in v && "b" in v) {
    const { r, g, b } = v as { r: number; g: number; b: number };
    return new THREE.Color(r, g, b);
  }
  if (typeof v === "string" || typeof v === "number") {
    try {
      return new THREE.Color(v as any);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

interface PrimitiveTextureState {
  textureMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  lastTexturePath?: string;
  lastNormalPath?: string;
}

const primitiveTextureCache = createNodeCache<PrimitiveTextureState>();

function getOrCreatePrimitiveTextureState(nodeId: string): PrimitiveTextureState {
  let state = primitiveTextureCache.get(nodeId);
  if (!state) {
    state = {};
    primitiveTextureCache.set(nodeId, state);
  }
  return state;
}

export interface TextureParams {
  activeDiffuse: THREE.Texture | null;
  activeNormal: THREE.Texture | null;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export function extractTextureParams(
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  nodeId: string
): TextureParams {
  const state = getOrCreatePrimitiveTextureState(nodeId);

  const inputDiffuse = inputs.texture instanceof THREE.Texture && inputs.texture.image ? inputs.texture : null;
  const inputNormal = inputs.normal instanceof THREE.Texture && inputs.normal.image ? inputs.normal : null;

  const activeDiffuse = inputDiffuse || state.textureMap || null;
  const activeNormal = inputNormal || state.normalMap || null;

  let scaleX = Number(params.uvScaleX);
  if (!Number.isFinite(scaleX)) scaleX = 1;
  let scaleY = Number(params.uvScaleY);
  if (!Number.isFinite(scaleY)) scaleY = 1;

  if (inputs.uvScale instanceof THREE.Vector3) {
    scaleX = inputs.uvScale.x;
    scaleY = inputs.uvScale.y;
  }

  let offsetX = Number(params.uvOffsetX);
  if (!Number.isFinite(offsetX)) offsetX = 0;
  let offsetY = Number(params.uvOffsetY);
  if (!Number.isFinite(offsetY)) offsetY = 0;

  if (inputs.uvOffset instanceof THREE.Vector3) {
    offsetX = inputs.uvOffset.x;
    offsetY = inputs.uvOffset.y;
  }

  return { activeDiffuse, activeNormal, scaleX, scaleY, offsetX, offsetY };
}

export interface MaterialParams {
  color: THREE.Color;
  emissive: THREE.Color;
  emissiveIntensity: number;
  shadeless: boolean;
  roughness: number;
  metalness: number;
  wireframe: boolean;
  wireframeLinewidth: number;
  opacity: number;
}

export function extractMaterialParams(inputs: Record<string, unknown>, params: Record<string, unknown>): MaterialParams {
  const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
  const emissive = asColor(inputs.emissive, asColor(params.emissive, new THREE.Color(0x000000)));
  const emissiveIntensity = Math.max(0, numberInput(inputs.emissiveIntensity, params.emissiveIntensity, 1.0));
  const shadeless = toBoolean(inputs.shadeless !== undefined ? inputs.shadeless : params.shadeless ?? 0);
  const roughness = numberInput(inputs.roughness, params.roughness, 0.4);
  const metalness = numberInput(inputs.metalness, params.metalness, 0.1);
  const wireframe = toBoolean(inputs.wireframe !== undefined ? inputs.wireframe : params.wireframe ?? 0);
  const wireframeLinewidth = Math.max(1, numberInput(inputs.wireframeLinewidth ?? inputs.wireframeWidth, params.wireframeLinewidth ?? params.wireframeWidth, 1.0));
  const opacity = Math.min(1, Math.max(0, numberInput(inputs.opacity, params.opacity, 1.0)));

  return { color, emissive, emissiveIntensity, shadeless, roughness, metalness, wireframe, wireframeLinewidth, opacity };
}

export function applyMaterialParams(
  mesh: THREE.Mesh,
  matParams: MaterialParams,
  defaultSide: THREE.Side = THREE.FrontSide,
  texParams?: TextureParams
) {
  const isTransparent = matParams.opacity < 0.999 || (texParams?.activeDiffuse ? true : false);

  if (matParams.shadeless) {
    if (!(mesh.material instanceof THREE.MeshBasicMaterial)) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
      mesh.material = new THREE.MeshBasicMaterial({ side: defaultSide });
    }
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.copy(matParams.color);
    mat.wireframe = matParams.wireframe;
    mat.wireframeLinewidth = matParams.wireframeLinewidth;
    mat.transparent = isTransparent;
    mat.opacity = matParams.opacity;
    mat.side = defaultSide;

    if (texParams?.activeDiffuse) {
      mat.map = texParams.activeDiffuse;
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.wrapS = THREE.RepeatWrapping;
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(texParams.scaleX, texParams.scaleY);
      mat.map.offset.set(texParams.offsetX, texParams.offsetY);
      mat.map.needsUpdate = true;
    } else {
      mat.map = null;
    }

    mat.needsUpdate = true;
  } else {
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
      mesh.material = new THREE.MeshStandardMaterial({ side: defaultSide });
    }
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.color.copy(matParams.color);
    mat.emissive.copy(matParams.emissive);
    mat.emissiveIntensity = matParams.emissiveIntensity;
    mat.roughness = matParams.roughness;
    mat.metalness = matParams.metalness;
    mat.wireframe = matParams.wireframe;
    mat.wireframeLinewidth = matParams.wireframeLinewidth;
    mat.transparent = isTransparent;
    mat.opacity = matParams.opacity;
    mat.side = defaultSide;

    if (texParams?.activeDiffuse) {
      mat.map = texParams.activeDiffuse;
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.wrapS = THREE.RepeatWrapping;
      mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(texParams.scaleX, texParams.scaleY);
      mat.map.offset.set(texParams.offsetX, texParams.offsetY);
      mat.map.needsUpdate = true;
    } else {
      mat.map = null;
    }

    if (texParams?.activeNormal) {
      mat.normalMap = texParams.activeNormal;
      mat.normalMap.wrapS = THREE.RepeatWrapping;
      mat.normalMap.wrapT = THREE.RepeatWrapping;
      mat.normalMap.repeat.set(texParams.scaleX, texParams.scaleY);
      mat.normalMap.offset.set(texParams.offsetX, texParams.offsetY);
      mat.normalMap.needsUpdate = true;
    } else {
      mat.normalMap = null;
    }

    mat.needsUpdate = true;
  }
}

const COMMON_PRIMITIVE_INPUTS = [
  { id: "texture", label: "Texture Map", type: "texture" as const },
  { id: "normal", label: "Normal Map", type: "texture" as const },
  { id: "matrix", label: "Matrix", type: "matrix" as const },
  { id: "color", label: "Color", type: "color" as const },
  { id: "emissive", label: "Emissive Color", type: "color" as const },
  { id: "emissiveIntensity", label: "Emissive Intensity", type: "value" as const },
  { id: "uvScale", label: "UV Scale", type: "vector" as const },
  { id: "uvOffset", label: "UV Offset", type: "vector" as const },
  { id: "shadeless", label: "Shadeless", type: "value" as const },
  { id: "roughness", label: "Roughness", type: "value" as const },
  { id: "metalness", label: "Metalness", type: "value" as const },
  { id: "wireframe", label: "Wireframe", type: "value" as const },
  { id: "wireframeLinewidth", label: "Wireframe Width", type: "value" as const },
  { id: "opacity", label: "Opacity", type: "value" as const },
];

const COMMON_MATERIAL_PARAM_FIELDS: ParamFieldDef[] = [
  { id: "color", label: "Color (fallback)", kind: "color" },
  { id: "emissive", label: "Emissive (Glow)", kind: "color" },
  { id: "emissiveIntensity", label: "Emissive Intensity", kind: "number", step: 0.1 },
  { id: "shadeless", label: "Shadeless (Unlit)", kind: "boolean" },
  { id: "roughness", label: "Roughness", kind: "number", step: 0.05 },
  { id: "metalness", label: "Metalness", kind: "number", step: 0.05 },
  { id: "wireframe", label: "Wireframe", kind: "boolean" },
  { id: "wireframeLinewidth", label: "Wireframe Width", kind: "number", step: 0.5 },
  { id: "opacity", label: "Opacity", kind: "number", step: 0.05 },
];

function buildPrimitiveDynamicParamFields(extraFields: ParamFieldDef[] = []): () => ParamFieldDef[] {
  return () => [
    ...extraFields,
    {
      id: "texturePath",
      label: "Texture Image",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".svg"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreatePrimitiveTextureState(nodeId);
        state.lastTexturePath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, () => {
            const mesh = meshCache.get(nodeId);
            if (mesh && mesh.material) {
              if (Array.isArray(mesh.material)) mesh.material.forEach((m) => (m.needsUpdate = true));
              else mesh.material.needsUpdate = true;
            }
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          state.textureMap = texture;
        } catch (err) {
          console.error("Failed to load primitive texture image:", err);
        }
      },
    },
    {
      id: "normalMapPath",
      label: "Normal Map",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreatePrimitiveTextureState(nodeId);
        state.lastNormalPath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, () => {
            const mesh = meshCache.get(nodeId);
            if (mesh && mesh.material) {
              if (Array.isArray(mesh.material)) mesh.material.forEach((m) => (m.needsUpdate = true));
              else mesh.material.needsUpdate = true;
            }
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          state.normalMap = texture;
        } catch (err) {
          console.error("Failed to load primitive normal map image:", err);
        }
      },
    },
    { id: "uvScaleX", label: "UV Scale X (Tile)", kind: "number", step: 0.1 },
    { id: "uvScaleY", label: "UV Scale Y (Tile)", kind: "number", step: 0.1 },
    { id: "uvOffsetX", label: "UV Offset X", kind: "number", step: 0.05 },
    { id: "uvOffsetY", label: "UV Offset Y", kind: "number", step: 0.05 },
    ...COMMON_MATERIAL_PARAM_FIELDS,
  ];
}

const COMMON_DEFAULT_PARAMS = {
  texturePath: "",
  normalMapPath: "",
  uvScaleX: 1,
  uvScaleY: 1,
  uvOffsetX: 0,
  uvOffsetY: 0,
  color: new THREE.Color(0xffffff),
  emissive: new THREE.Color(0x000000),
  emissiveIntensity: 1.0,
  shadeless: 0,
  roughness: 0.4,
  metalness: 0.1,
  wireframe: 0,
  wireframeLinewidth: 1.0,
  opacity: 1.0,
};

const meshCache = createNodeCache<THREE.Mesh>(disposeObject3D);

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

/** Box 3D geometry primitive with texture mapping, PBR and Shadeless material controls. */
export const OBJECT_BOX_NODE: NodeDefinition = {
  type: "object/box",
  label: "Box",
  category: "structure",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = boxMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

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

/** 2D Plane polygon primitive (flat z=0 quad in 3D) with texture mapping. */
export const OBJECT_PLANE_NODE: NodeDefinition = {
  type: "object/plane",
  label: "Plane",
  category: "structure",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = planeMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.DoubleSide, texParams);

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

/** Sphere 3D geometry primitive with UV texture mapping. */
export const OBJECT_SPHERE_NODE: NodeDefinition = {
  type: "object/sphere",
  label: "Sphere",
  category: "structure",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = sphereMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return { geometry: mesh };
  },
};

function discMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** 2D Disc / 3D Extruded Cylinder primitive with texture mapping (default depth = 0). */
export const OBJECT_DISC_NODE: NodeDefinition = {
  type: "object/disc",
  label: "Disc",
  category: "structure",
  inputs: [
    { id: "depth", label: "Depth", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { depth: 0, ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields([{ id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 }])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([{ id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 }]),
  evaluate: (inputs, params, ctx) => {
    const mesh = discMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const depth = Math.max(0, numberInput(inputs.depth, params.depth, 0));
    const lastDepth = (mesh as any)._lastDepth;

    if (lastDepth !== depth) {
      mesh.geometry.dispose();
      if (depth > 0) {
        // 3D Cylinder extruded along Z axis
        const cylGeom = new THREE.CylinderGeometry(0.5, 0.5, depth, 32);
        cylGeom.rotateX(Math.PI / 2);
        mesh.geometry = cylGeom;
      } else {
        // 2D Circle disc on Z=0 plane
        mesh.geometry = new THREE.CircleGeometry(0.5, 32);
      }
      (mesh as any)._lastDepth = depth;
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    const defaultSide: THREE.Side = depth > 0 ? THREE.FrontSide : THREE.DoubleSide;
    applyMaterialParams(mesh, matParams, defaultSide, texParams);

    return { geometry: mesh };
  },
};

function cylinderMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 1, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** 3D Cylinder geometry primitive with UV texture mapping and opacity. */
export const OBJECT_CYLINDER_NODE: NodeDefinition = {
  type: "object/cylinder",
  label: "Cylinder",
  category: "structure",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = cylinderMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return { geometry: mesh };
  },
};

function coneMesh(nodeId: string): THREE.Mesh {
  const existing = meshCache.get(nodeId);
  if (existing) return existing;
  const mesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1, 32),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.nodeId = nodeId;
  meshCache.set(nodeId, mesh);
  return mesh;
}

/** 3D Cone geometry primitive with UV texture mapping and opacity. */
export const OBJECT_CONE_NODE: NodeDefinition = {
  type: "object/cone",
  label: "Cone",
  category: "structure",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = coneMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

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

interface TextMeshState {
  mesh: THREE.Mesh;
  lastText?: string;
  lastFontSize?: number;
  lastDepth?: number;
}

const textMeshCache = createNodeCache<TextMeshState>();

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

/** 3D Extruded Text Object with texture mapping and vector font glyph outlines. */
export const OBJECT_TEXT_NODE: NodeDefinition = {
  type: "object/text",
  label: "Text",
  category: "structure",
  inputs: [
    { id: "text", label: "Text", type: "text" },
    { id: "font", label: "Font", type: "text" },
    { id: "fontSize", label: "Font Size", type: "value" },
    { id: "depth", label: "Depth", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    text: "OpenVMap3D",
    font: "sans-serif",
    fontSize: 64,
    depth: 0.1,
    ...COMMON_DEFAULT_PARAMS,
  },
  paramFields: buildPrimitiveDynamicParamFields([
    { id: "text", label: "Text (fallback)", kind: "text" },
    { id: "font", label: "Font Family", kind: "select", options: FONT_FAMILIES },
    { id: "fontSize", label: "Font Size (px)", kind: "number" },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([
    { id: "text", label: "Text (fallback)", kind: "text" },
    { id: "font", label: "Font Family", kind: "select", options: FONT_FAMILIES },
    { id: "fontSize", label: "Font Size (px)", kind: "number" },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ]),
  evaluate: (inputs, params, ctx) => {
    const textState = textMesh(ctx.nodeId);
    const mesh = textState.mesh;

    const textStr = inputs.text !== undefined ? String(inputs.text) : String(params.text ?? "OpenVMap3D");
    const fontSize = Math.max(8, inputs.fontSize !== undefined ? Number(inputs.fontSize) || 64 : Number(params.fontSize) || 64);
    const depth = Math.max(0.001, inputs.depth !== undefined ? Number(inputs.depth) : Number(params.depth) ?? 0.1);

    const baseMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();

    const stateChanged =
      textState.lastText !== textStr ||
      textState.lastFontSize !== fontSize ||
      textState.lastDepth !== depth;

    if (stateChanged) {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      const scale = fontSize * 0.015;
      const shapes = defaultFont.generateShapes(textStr || " ", scale);

      const geometry = new THREE.ExtrudeGeometry(shapes, {
        depth: depth,
        bevelEnabled: true,
        bevelThickness: Math.min(0.02, depth * 0.2),
        bevelSize: Math.min(0.01, depth * 0.1),
        bevelSegments: 3,
        curveSegments: 12,
      });

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

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

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

const barGraphCache = createNodeCache<BarGraphState>();

function barGraphState(nodeId: string): BarGraphState {
  const existing = barGraphCache.get(nodeId);
  if (existing) return existing;

  const group = new THREE.Group();
  const barsGroup = new THREE.Group();
  const labelsGroup = new THREE.Group();
  group.add(barsGroup);
  group.add(labelsGroup);

  const unitGeometry = new THREE.BoxGeometry(1, 1, 1);
  unitGeometry.translate(0, 0.5, 0); // Origin at bottom center for easy scaling

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

function getOrCreateLabelState(parentState: BarGraphState, index: number): LabelMeshState {
  let labelState = parentState.labelStates.get(index);
  if (!labelState) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide });
    const geom = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = false;
    parentState.labelsGroup.add(mesh);

    labelState = { mesh };
    parentState.labelStates.set(index, labelState);
  }
  return labelState;
}

/** 3D Bar Graph primitive with data visualization, texture mapping and material controls. */
export const OBJECT_BAR_GRAPH_NODE: NodeDefinition = {
  type: "object/bar_graph",
  label: "Bar Graph",
  category: "structure",
  inputs: [
    { id: "values", label: "Values (List)", type: "any" },
    { id: "colors", label: "Colors (List)", type: "any" },
    { id: "count", label: "Bar Count", type: "value" },
    { id: "spacing", label: "Spacing", type: "value" },
    { id: "barWidth", label: "Bar Width", type: "value" },
    { id: "maxHeight", label: "Max Height", type: "value" },
    { id: "barDepth", label: "Bar Depth", type: "value" },
    { id: "showLabels", label: "Show Labels", type: "value" },
    { id: "labelPosition", label: "Label Position", type: "text" },
    { id: "labelDecimals", label: "Decimals", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    count: 5,
    spacing: 0.2,
    barWidth: 0.8,
    maxHeight: 5,
    barDepth: 0.8,
    alignment: "center",
    showLabels: 0,
    labelPosition: "above",
    labelDecimals: 1,
    ...COMMON_DEFAULT_PARAMS,
  },
  paramFields: buildPrimitiveDynamicParamFields([
    { id: "count", label: "Bar Count", kind: "number", step: 1 },
    { id: "spacing", label: "Spacing", kind: "number", step: 0.05 },
    { id: "barWidth", label: "Bar Width", kind: "number", step: 0.05 },
    { id: "maxHeight", label: "Max Height", kind: "number", step: 0.5 },
    { id: "barDepth", label: "Bar Depth", kind: "number", step: 0.05 },
    { id: "alignment", label: "Alignment", kind: "select", options: ALIGNMENT_OPTIONS },
    { id: "showLabels", label: "Show Labels", kind: "boolean" },
    { id: "labelPosition", label: "Label Pos", kind: "select", options: LABEL_POSITION_OPTIONS },
    { id: "labelDecimals", label: "Decimals", kind: "number", step: 1 },
  ])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([
    { id: "count", label: "Bar Count", kind: "number", step: 1 },
    { id: "spacing", label: "Spacing", kind: "number", step: 0.05 },
    { id: "barWidth", label: "Bar Width", kind: "number", step: 0.05 },
    { id: "maxHeight", label: "Max Height", kind: "number", step: 0.5 },
    { id: "barDepth", label: "Bar Depth", kind: "number", step: 0.05 },
    { id: "alignment", label: "Alignment", kind: "select", options: ALIGNMENT_OPTIONS },
    { id: "showLabels", label: "Show Labels", kind: "boolean" },
    { id: "labelPosition", label: "Label Pos", kind: "select", options: LABEL_POSITION_OPTIONS },
    { id: "labelDecimals", label: "Decimals", kind: "number", step: 1 },
  ]),
  evaluate: (inputs, params, ctx) => {
    const state = barGraphState(ctx.nodeId);
    const group = state.group;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      group.matrixAutoUpdate = false;
      group.matrix.copy(matrix);
    }

    const rawValues = Array.isArray(inputs.values)
      ? inputs.values.map(Number)
      : typeof inputs.values === "number"
        ? [inputs.values]
        : [0.4, 0.7, 0.2, 0.9, 0.5];

    const rawColors = Array.isArray(inputs.colors)
      ? inputs.colors.map((c) => asColor(c, new THREE.Color(0xffffff)))
      : [];

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);

    const count = Math.max(1, numberInput(inputs.count, params.count, 5));
    const spacing = numberInput(inputs.spacing, params.spacing, 0.2);
    const barWidth = Math.max(0.01, numberInput(inputs.barWidth, params.barWidth, 0.8));
    const maxHeight = Math.max(0.01, numberInput(inputs.maxHeight, params.maxHeight, 5));
    const barDepth = Math.max(0.01, numberInput(inputs.barDepth, params.barDepth, 0.8));
    const alignment = String(params.alignment ?? "center");
    const showLabels = toBoolean(inputs.showLabels !== undefined ? inputs.showLabels : params.showLabels ?? 0);
    const labelPosition = String(params.labelPosition ?? "above");
    const labelDecimals = Math.max(0, Math.min(6, numberInput(inputs.labelDecimals, params.labelDecimals, 1)));

    const stepWidth = barWidth + spacing;
    const totalWidth = count * barWidth + Math.max(0, count - 1) * spacing;

    let startX = 0;
    if (alignment === "center") {
      startX = -totalWidth / 2 + barWidth / 2;
    } else if (alignment === "right") {
      startX = -totalWidth + barWidth / 2;
    } else {
      startX = barWidth / 2;
    }

    while (state.barsGroup.children.length < count) {
      const mesh = new THREE.Mesh(
        state.unitGeometry,
        matParams.shadeless
          ? new THREE.MeshBasicMaterial({ color: 0xffffff })
          : new THREE.MeshStandardMaterial({ color: 0xffffff })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state.barsGroup.add(mesh);
    }
    while (state.barsGroup.children.length > count) {
      const child = state.barsGroup.children.pop();
      if (child instanceof THREE.Mesh) {
        if (child.material) child.material.dispose();
      }
    }

    state.labelStates.forEach((lState, idx) => {
      if (idx >= count) lState.mesh.visible = false;
    });

    for (let i = 0; i < count; i++) {
      const barMesh = state.barsGroup.children[i] as THREE.Mesh;
      const rawVal = rawValues[i % rawValues.length] ?? 0;
      const barHeight = Math.max(0.001, rawVal * maxHeight);

      const posX = startX + i * stepWidth;
      barMesh.position.set(posX, 0, 0);
      barMesh.scale.set(barWidth, barHeight, barDepth);

      let barColor = matParams.color;
      if (rawColors.length > 0) {
        barColor = rawColors[i % rawColors.length];
      }

      const singleMatParams = { ...matParams, color: barColor };
      applyMaterialParams(barMesh, singleMatParams, THREE.FrontSide, texParams);

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
          labelMesh.position.set(posX, barHeight + labelGap + labelWorldHeight / 2, 0);
          labelMesh.rotation.set(0, 0, 0);
        } else {
          labelMesh.position.set(posX, barHeight + labelGap + labelWorldHeight / 2, 0);
          labelMesh.rotation.set(0, 0, 0);
        }
      }
    }

    return { geometry: group };
  },
};

const labelGap = 0.2;

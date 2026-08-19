import * as THREE from "three";
import { Font, FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { NodeDefinition, ParamFieldDef } from "../types";
import { toBoolean } from "../sockets";
import { defaultFont } from "../../three/fonts/helvetikerFont";
import { BUILTIN_FONTS, FONT_NAMES } from "../../three/fonts/fonts";
import { createNodeCache, disposeObject3D } from "../nodeCaches";
import { composeNativeMatrix } from "./transform";

export function numberInput(input: unknown, param: unknown, fallback: number): number {
  const raw = input !== undefined ? input : param;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * The time a time-driven node should run on.
 *
 * A node can't just test `inputs.time !== undefined` to see whether its Time
 * socket is wired: the evaluator fills every unconnected socket with that
 * socket's default param, so an unwired Time reads as a perfectly valid 0 and
 * the node freezes at the first frame forever. `connectedInputs` is the only
 * thing that actually knows, which is why it exists (see EvalContext).
 *
 * Wired: use the incoming value, so a Time Remap or a scrubbed clock drives the
 * node. Unwired: fall back to the graph's own clock, so the node animates out
 * of the box instead of standing still.
 */
export function clockInput(
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  ctx: { time?: number; connectedInputs?: ReadonlySet<string> },
  socketId = "time",
): number {
  if (ctx.connectedInputs ? ctx.connectedInputs.has(socketId) : inputs[socketId] !== undefined) {
    return numberInput(inputs[socketId], params[socketId], 0);
  }
  const clock = Number(ctx.time);
  return Number.isFinite(clock) ? clock : 0;
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

/**
 * Whether a diffuse texture actually carries transparent pixels. A material
 * must be `transparent` for PNG alpha to show, but marking it so for *every*
 * textured material would push those objects into three.js's transparent pass —
 * and the transmission buffer only renders opaque objects, so textured objects
 * would silently vanish behind glass. The check is one-time per texture.
 */
const textureAlphaCache = new WeakMap<THREE.Texture, boolean>();

function textureHasAlpha(tex: THREE.Texture): boolean {
  const cached = textureAlphaCache.get(tex);
  if (cached !== undefined) return cached;

  let hasAlpha = false;
  const img = tex.image as unknown;
  try {
    if (img && typeof img === "object" && "data" in img) {
      const data = (img as { data: ArrayLike<number> }).data;
      if (data && typeof data.length === "number") {
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 255) {
            hasAlpha = true;
            break;
          }
        }
      }
    } else if (typeof document !== "undefined" && img) {
      const el = img as {
        width?: number;
        height?: number;
        videoWidth?: number;
        videoHeight?: number;
        getContext?: (type: string, opts?: object) => { getImageData: (x: number, y: number, w: number, h: number) => { data: ArrayLike<number> } } | null;
      };
      const w = el.width || el.videoWidth || 0;
      const h = el.height || el.videoHeight || 0;
      if (w > 0 && h > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(img as CanvasImageSource, 0, 0);
          const data = ctx.getImageData(0, 0, w, h).data;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) {
              hasAlpha = true;
              break;
            }
          }
        }
      }
    }
  } catch {
    hasAlpha = false;
  }

  textureAlphaCache.set(tex, hasAlpha);
  return hasAlpha;
}

/** `prefix` + `key` with the first letter of key capitalised — "surface" + "color" → "surfaceColor". */
export function prefixedParamKey(prefix: string, key: string): string {
  return prefix ? `${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}` : key;
}

export function extractTextureParams(
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  nodeId: string,
  prefix = ""
): TextureParams {
  const state = getOrCreatePrimitiveTextureState(nodeId);
  const p = (key: string) => prefixedParamKey(prefix, key);

  const diffuseVal = inputs[p("texture")];
  const normalVal = inputs[p("normal")];
  const inputDiffuse = diffuseVal instanceof THREE.Texture && diffuseVal.image ? diffuseVal : null;
  const inputNormal = normalVal instanceof THREE.Texture && normalVal.image ? normalVal : null;

  const activeDiffuse = inputDiffuse || state.textureMap || null;
  const activeNormal = inputNormal || state.normalMap || null;

  let scaleX = Number(params[p("uvScaleX")]);
  if (!Number.isFinite(scaleX)) scaleX = 1;
  let scaleY = Number(params[p("uvScaleY")]);
  if (!Number.isFinite(scaleY)) scaleY = 1;

  if (inputs[p("uvScale")] instanceof THREE.Vector3) {
    scaleX = (inputs[p("uvScale")] as THREE.Vector3).x;
    scaleY = (inputs[p("uvScale")] as THREE.Vector3).y;
  }

  let offsetX = Number(params[p("uvOffsetX")]);
  if (!Number.isFinite(offsetX)) offsetX = 0;
  let offsetY = Number(params[p("uvOffsetY")]);
  if (!Number.isFinite(offsetY)) offsetY = 0;

  if (inputs[p("uvOffset")] instanceof THREE.Vector3) {
    offsetX = (inputs[p("uvOffset")] as THREE.Vector3).x;
    offsetY = (inputs[p("uvOffset")] as THREE.Vector3).y;
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
  opacity: number;
  /** 0..1 — how much light passes through the surface (0 = opaque). Upgrades the material to MeshPhysicalMaterial. */
  transmission: number;
  /** Physical-material thickness in world units — how glass-like the transmission looks. */
  thickness: number;
}

function materialParamsFromValue(v: unknown): MaterialParams | null {
  if (typeof v !== "object" || v === null) return null;
  const m = v as Record<string, unknown>;
  if (!("color" in m) && !("roughness" in m) && !("opacity" in m)) return null;
  return {
    color: asColor(m.color, new THREE.Color(0xffffff)),
    emissive: asColor(m.emissive, new THREE.Color(0x000000)),
    emissiveIntensity: Math.max(0, numberInput(m.emissiveIntensity, undefined, 1.0)),
    shadeless: toBoolean(m.shadeless),
    roughness: numberInput(m.roughness, undefined, 0.4),
    metalness: numberInput(m.metalness, undefined, 0.1),
    wireframe: toBoolean(m.wireframe),
    opacity: Math.min(1, Math.max(0, numberInput(m.opacity, undefined, 1.0))),
    transmission: Math.min(1, Math.max(0, numberInput(m.transmission, undefined, 0))),
    thickness: Math.max(0, numberInput(m.thickness, undefined, 0.5)),
  };
}

export function extractMaterialParams(
  inputs: Record<string, unknown>,
  params: Record<string, unknown>,
  prefix = ""
): MaterialParams {
  const p = (key: string) => prefixedParamKey(prefix, key);

  const connected = materialParamsFromValue(inputs[p("material")]);
  if (connected) return connected;

  const color = asColor(inputs[p("color")], asColor(params[p("color")], new THREE.Color(0xffffff)));
  const emissive = asColor(inputs[p("emissive")], asColor(params[p("emissive")], new THREE.Color(0x000000)));
  const emissiveIntensity = Math.max(0, numberInput(inputs[p("emissiveIntensity")], params[p("emissiveIntensity")], 1.0));
  const shadeless = toBoolean(inputs[p("shadeless")] !== undefined ? inputs[p("shadeless")] : params[p("shadeless")] ?? 0);
  const roughness = numberInput(inputs[p("roughness")], params[p("roughness")], 0.4);
  const metalness = numberInput(inputs[p("metalness")], params[p("metalness")], 0.1);
  const wireframe = toBoolean(inputs[p("wireframe")] !== undefined ? inputs[p("wireframe")] : params[p("wireframe")] ?? 0);
  const opacity = Math.min(1, Math.max(0, numberInput(inputs[p("opacity")], params[p("opacity")], 1.0)));
  const transmission = Math.min(1, Math.max(0, numberInput(inputs[p("transmission")], params[p("transmission")], 0)));
  const thickness = Math.max(0, numberInput(inputs[p("thickness")], params[p("thickness")], 0.5));

  return { color, emissive, emissiveIntensity, shadeless, roughness, metalness, wireframe, opacity, transmission, thickness };
}

/**
 * Applied-signature cache: evaluate runs every frame and would otherwise set
 * `material.needsUpdate = true` (shader recompile) and `texture.needsUpdate =
 * true` (full GPU re-upload) on every single frame — catastrophic with a big
 * texture. We only touch the material when something it depends on changed.
 */
const appliedMaterialSignatures = new WeakMap<THREE.Mesh, string>();

export function applyMaterialParams(
  mesh: THREE.Mesh,
  matParams: MaterialParams,
  defaultSide: THREE.Side = THREE.FrontSide,
  texParams?: TextureParams
) {
  const alpha = texParams?.activeDiffuse ? textureHasAlpha(texParams.activeDiffuse) : false;
  const signature = [
    matParams.color.getHex(),
    matParams.emissive.getHex(),
    matParams.emissiveIntensity,
    matParams.shadeless,
    matParams.roughness,
    matParams.metalness,
    matParams.wireframe,
    matParams.opacity,
    matParams.transmission,
    matParams.thickness,
    defaultSide,
    texParams?.activeDiffuse?.uuid ?? "",
    texParams?.activeNormal?.uuid ?? "",
    texParams?.scaleX,
    texParams?.scaleY,
    texParams?.offsetX,
    texParams?.offsetY,
    alpha,
  ].join("|");

  if (appliedMaterialSignatures.get(mesh) === signature) return;
  appliedMaterialSignatures.set(mesh, signature);

  const isTransparent = matParams.opacity < 0.999 || alpha;

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
    const wantPhysical = matParams.transmission > 0;
    if (wantPhysical) {
      if (!(mesh.material instanceof THREE.MeshPhysicalMaterial)) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
        mesh.material = new THREE.MeshPhysicalMaterial({ side: defaultSide });
      }
    } else if (mesh.material instanceof THREE.MeshPhysicalMaterial) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else if (mesh.material) {
        mesh.material.dispose();
      }
      mesh.material = new THREE.MeshStandardMaterial({ side: defaultSide });
    } else if (!(mesh.material instanceof THREE.MeshStandardMaterial)) {
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
    mat.transparent = isTransparent;
    mat.opacity = matParams.opacity;
    mat.side = defaultSide;

    if (wantPhysical) {
      const physical = mat as THREE.MeshPhysicalMaterial;
      physical.transmission = matParams.transmission;
      physical.thickness = matParams.thickness;
    }

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

export const COMMON_PRIMITIVE_INPUTS = [
  { id: "visible", label: "Visible", type: "value" as const },
  { id: "texture", label: "Texture Map", type: "texture" as const },
  { id: "normal", label: "Normal Map", type: "texture" as const },
  { id: "matrix", label: "Matrix", type: "matrix" as const },
  { id: "material", label: "Material", type: "material" as const },
  { id: "uvScale", label: "UV Scale", type: "vector" as const },
  { id: "uvOffset", label: "UV Offset", type: "vector" as const },
];

export const COMMON_PRIMITIVE_OUTPUTS = [
  { id: "geometry", label: "Geometry", type: "geometry" as const },
  { id: "matrix", label: "Matrix", type: "matrix" as const },
];

/**
 * Geometry plus the object's own pose. The geometry socket carries a live
 * THREE object, and reading a position back out of it means walking a parent
 * chain whose cached `matrixWorld` is stale during evaluation — the Matrix4 is
 * the direct handle downstream nodes (Distance, Proximity, Pivot, Look At…)
 * need. It is the object's *local* pose, exactly what this node applied, not
 * its world transform: whatever an Array or Set Instance Transform does to a
 * copy of it later is not part of this node's own state.
 *
 * Cloned, so a downstream node mutating the matrix cannot move the object
 * behind its back.
 */
export function primitiveOutputs(object: THREE.Object3D): Record<string, unknown> {
  if (object.matrixAutoUpdate) object.updateMatrix();
  return { geometry: object, matrix: object.matrix.clone() };
}

export const COMMON_MATERIAL_PARAM_FIELDS: ParamFieldDef[] = [
  { id: "color", label: "Color (fallback)", kind: "color", group: "Material" },
  { id: "emissive", label: "Emissive (Glow)", kind: "color", group: "Material" },
  { id: "emissiveIntensity", label: "Emissive Intensity", kind: "number", step: 0.1, group: "Material" },
  { id: "shadeless", label: "Shadeless (Unlit)", kind: "boolean", group: "Material" },
  { id: "roughness", label: "Roughness", kind: "number", step: 0.05, group: "Material" },
  { id: "metalness", label: "Metalness", kind: "number", step: 0.05, group: "Material" },
  { id: "wireframe", label: "Wireframe", kind: "boolean", group: "Material" },
  { id: "opacity", label: "Opacity", kind: "number", step: 0.05, group: "Material" },
  { id: "transmission", label: "Transmission (Glass)", kind: "number", step: 0.05, group: "Material" },
  { id: "thickness", label: "Glass Thickness", kind: "number", step: 0.05, group: "Material" },
];

/**
 * A second, independent set of material params (for a node that needs to style
 * two objects differently, e.g. a curve and its surface): every field of
 * `COMMON_MATERIAL_PARAM_FIELDS` with a `prefix`ed id and a new group. Keys line
 * up with `extractMaterialParams(..., prefix)`.
 */
export function prefixedMaterialParamFields(prefix: string, group: string): ParamFieldDef[] {
  return COMMON_MATERIAL_PARAM_FIELDS.map((f) => ({
    ...f,
    id: prefixedParamKey(prefix, f.id),
    group,
  }));
}

/**
 * The object's own initial pose — see composeNativeMatrix in transform.ts.
 * Listed first, same convention as TRANSFORM_NODE putting location/rotation/
 * scale ahead of everything else: it's the property every other field here
 * is positioned/oriented/sized relative to.
 */
const NATIVE_TRANSFORM_PARAM_FIELDS: ParamFieldDef[] = [
  { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
  { id: "location", label: "Location", kind: "vector", group: "Transform" },
  { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true, group: "Transform" },
  { id: "scale", label: "Scale", kind: "vector", group: "Transform" },
];

export function buildPrimitiveDynamicParamFields(extraFields: ParamFieldDef[] = []): () => ParamFieldDef[] {
  return () => [
    ...NATIVE_TRANSFORM_PARAM_FIELDS,
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
          const texture = new THREE.TextureLoader().load(
            url,
            () => {
              URL.revokeObjectURL(url);
              textureAlphaCache.delete(texture);
              const mesh = meshCache.get(nodeId);
              if (mesh && mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => (m.needsUpdate = true));
                else mesh.material.needsUpdate = true;
              }
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
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
          const texture = new THREE.TextureLoader().load(
            url,
            () => {
              URL.revokeObjectURL(url);
              const mesh = meshCache.get(nodeId);
              if (mesh && mesh.material) {
                if (Array.isArray(mesh.material)) mesh.material.forEach((m) => (m.needsUpdate = true));
                else mesh.material.needsUpdate = true;
              }
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
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

export const COMMON_DEFAULT_PARAMS = {
  visible: 1,
  location: new THREE.Vector3(0, 0, 0),
  rotation: new THREE.Vector3(0, 0, 0),
  scale: new THREE.Vector3(1, 1, 1),
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
  opacity: 1.0,
  transmission: 0,
  thickness: 0.5,
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
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = boxMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
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
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = planeMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.DoubleSide, texParams);

    return primitiveOutputs(mesh);
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
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = sphereMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
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

/** 2D Disc / Ring / Arc / 3D Extruded geometry primitive with UV texture mapping and opacity. */
export const OBJECT_DISC_NODE: NodeDefinition = {
  type: "object/disc",
  label: "Disc",
  category: "object",
  inputs: [
    { id: "radius", label: "Radius", type: "value" },
    { id: "innerRadius", label: "Inner Radius", type: "value" },
    { id: "startAngle", label: "Start Angle", type: "value" },
    { id: "arcAngle", label: "Arc Angle", type: "value" },
    { id: "depth", label: "Depth", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    radius: 0.5,
    innerRadius: 0,
    startAngle: 0,
    arcAngle: Math.PI * 2,
    depth: 0,
    ...COMMON_DEFAULT_PARAMS,
  },
  paramFields: buildPrimitiveDynamicParamFields([
    { id: "radius", label: "Radius", kind: "number", step: 0.05 },
    { id: "innerRadius", label: "Inner Radius (Hole)", kind: "number", step: 0.05 },
    { id: "startAngle", label: "Start Angle (°)", kind: "number", step: 1, degrees: true },
    { id: "arcAngle", label: "Arc Angle (°)", kind: "number", step: 1, degrees: true },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([
    { id: "radius", label: "Radius", kind: "number", step: 0.05 },
    { id: "innerRadius", label: "Inner Radius (Hole)", kind: "number", step: 0.05 },
    { id: "startAngle", label: "Start Angle (°)", kind: "number", step: 1, degrees: true },
    { id: "arcAngle", label: "Arc Angle (°)", kind: "number", step: 1, degrees: true },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ]),
  evaluate: (inputs, params, ctx) => {
    const mesh = discMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const radius = Math.max(0.001, numberInput(inputs.radius, params.radius, 0.5));
    const innerRadius = Math.max(0, Math.min(radius - 0.0001, numberInput(inputs.innerRadius, params.innerRadius, 0)));
    const startAngle = numberInput(inputs.startAngle, params.startAngle, 0);
    const arcAngle = Math.max(0, Math.min(Math.PI * 2, numberInput(inputs.arcAngle, params.arcAngle, Math.PI * 2)));
    const depth = Math.max(0, numberInput(inputs.depth, params.depth, 0));

    const key = `${radius}_${innerRadius}_${startAngle}_${arcAngle}_${depth}`;
    const lastKey = (mesh as any)._lastDiscKey;

    if (lastKey !== key) {
      mesh.geometry.dispose();
      if (depth === 0) {
        if (innerRadius === 0 && startAngle === 0 && arcAngle >= Math.PI * 2 - 1e-4) {
          mesh.geometry = new THREE.CircleGeometry(radius, 64);
        } else {
          mesh.geometry = new THREE.RingGeometry(innerRadius, radius, 64, 1, startAngle, arcAngle);
        }
      } else {
        if (innerRadius === 0 && startAngle === 0 && arcAngle >= Math.PI * 2 - 1e-4) {
          const cylGeom = new THREE.CylinderGeometry(radius, radius, depth, 64);
          cylGeom.rotateX(Math.PI / 2);
          mesh.geometry = cylGeom;
        } else {
          const shape = new THREE.Shape();
          const endAngle = startAngle + arcAngle;
          const isFullCircle = arcAngle >= Math.PI * 2 - 1e-4;

          if (innerRadius === 0 && isFullCircle) {
            shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
          } else if (innerRadius > 0 && isFullCircle) {
            shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
            const holePath = new THREE.Path();
            holePath.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
            shape.holes.push(holePath);
          } else {
            shape.absarc(0, 0, radius, startAngle, endAngle, false);
            if (innerRadius > 0) {
              shape.absarc(0, 0, innerRadius, endAngle, startAngle, true);
            } else {
              shape.lineTo(0, 0);
            }
          }

          const extrudeGeom = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: false,
            curveSegments: 64,
          });
          extrudeGeom.translate(0, 0, -depth / 2);
          mesh.geometry = extrudeGeom;
        }
      }
      (mesh as any)._lastDiscKey = key;
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    const defaultSide: THREE.Side = depth > 0 ? THREE.FrontSide : THREE.DoubleSide;
    applyMaterialParams(mesh, matParams, defaultSide, texParams);

    return primitiveOutputs(mesh);
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
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = cylinderMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
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
  category: "object",
  inputs: [...COMMON_PRIMITIVE_INPUTS],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: { ...COMMON_DEFAULT_PARAMS },
  paramFields: buildPrimitiveDynamicParamFields()(),
  dynamicParamFields: buildPrimitiveDynamicParamFields(),
  evaluate: (inputs, params, ctx) => {
    const mesh = coneMesh(ctx.nodeId);

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
  },
};

/** 3D Extruded Text Object with texture mapping and vector font glyph outlines. */
export const OBJECT_TEXT_NODE: NodeDefinition = {
  type: "object/text",
  label: "Text",
  category: "object",
  inputs: [
    { id: "text", label: "Text", type: "text" },
    { id: "fontSize", label: "Font Size", type: "value" },
    { id: "depth", label: "Depth", type: "value" },
    ...COMMON_PRIMITIVE_INPUTS,
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    text: "OpenVMap3D",
    fontPreset: "Helvetiker",
    fontSize: 64,
    depth: 0.1,
    fontPath: "",
    ...COMMON_DEFAULT_PARAMS,
  },
  paramFields: buildPrimitiveDynamicParamFields([
    { id: "text", label: "Text (fallback)", kind: "text" },
    { id: "fontPreset", label: "Font", kind: "select", options: FONT_NAMES },
    { id: "fontPath", label: "Custom Font (.json)", kind: "file", accept: [".json"], onLoaded: (nodeId, _path, content) => {
      const state = textMesh(nodeId);
      try {
        state.font = new FontLoader().parse(JSON.parse(String(content)));
      } catch (err) {
        console.error("Failed to parse font:", err);
        state.font = undefined;
      }
    } },
    { id: "fontSize", label: "Font Size (px)", kind: "number" },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ])(),
  dynamicParamFields: buildPrimitiveDynamicParamFields([
    { id: "text", label: "Text (fallback)", kind: "text" },
    { id: "fontPreset", label: "Font", kind: "select", options: FONT_NAMES },
    { id: "fontPath", label: "Custom Font (.json)", kind: "file", accept: [".json"], onLoaded: (nodeId, _path, content) => {
      const state = textMesh(nodeId);
      try {
        state.font = new FontLoader().parse(JSON.parse(String(content)));
      } catch (err) {
        console.error("Failed to parse font:", err);
        state.font = undefined;
      }
    } },
    { id: "fontSize", label: "Font Size (px)", kind: "number" },
    { id: "depth", label: "Depth / Relief", kind: "number", step: 0.05 },
  ]),
  evaluate: (inputs, params, ctx) => {
    const textState = textMesh(ctx.nodeId);
    const mesh = textState.mesh;

    const textStr = inputs.text !== undefined ? String(inputs.text) : String(params.text ?? "OpenVMap3D");
    const fontSize = Math.max(8, inputs.fontSize !== undefined ? Number(inputs.fontSize) || 64 : Number(params.fontSize) || 64);
    const depth = Math.max(0.001, inputs.depth !== undefined ? Number(inputs.depth) : Number(params.depth) ?? 0.1);
    // A custom font loaded via the file field wins; otherwise the Font menu.
    const font = textState.font ?? BUILTIN_FONTS[String(params.fontPreset ?? "Helvetiker")] ?? defaultFont;

    const baseMatrix = composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale);

    const stateChanged =
      textState.lastText !== textStr ||
      textState.lastFontSize !== fontSize ||
      textState.lastDepth !== depth ||
      textState.lastFont !== font;

    if (stateChanged) {
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      const scale = fontSize * 0.015;
      const shapes = font.generateShapes(textStr || " ", scale);

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
      textState.lastFont = font;
    }

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(baseMatrix);
    }

    const matParams = extractMaterialParams(inputs, params);
    const texParams = extractTextureParams(inputs, params, ctx.nodeId);
    applyMaterialParams(mesh, matParams, THREE.FrontSide, texParams);

    return primitiveOutputs(mesh);
  },
};

const textMeshCache = createNodeCache<TextMeshState>();

interface TextMeshState {
  mesh: THREE.Mesh;
  lastText?: string;
  lastFontSize?: number;
  lastDepth?: number;
  /** The font loaded via the Font (.json) file field — undefined falls back to helvetiker. */
  font?: Font;
  /** Reference for rebuild detection: a newly loaded font object must re-extrude. */
  lastFont?: Font;
}

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
  group.userData.nodeId = nodeId;
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
  category: "object",
  inputs: [
    { id: "values", label: "Values (List)", type: "list" },
    { id: "colors", label: "Colors (List)", type: "list" },
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
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
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
      group.matrixAutoUpdate = false;
      group.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
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
    const labelPosition = String(inputs.labelPosition ?? params.labelPosition ?? "above");
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
      const child = state.barsGroup.children[state.barsGroup.children.length - 1];
      state.barsGroup.remove(child);
      if (child instanceof THREE.Mesh && child.material) {
        (child.material as THREE.Material).dispose();
      }
    }

    state.labelStates.forEach((lState, idx) => {
      if (idx >= count) lState.mesh.visible = false;
    });

    const safeValues = rawValues.map((v) => (Number.isFinite(v) ? v : 0));

    for (let i = 0; i < count; i++) {
      const barMesh = state.barsGroup.children[i] as THREE.Mesh;
      const rawVal = safeValues[i % rawValues.length] ?? 0;
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

    return primitiveOutputs(group);
  },
};

const labelGap = 0.2;

const emptyGroupCache = createNodeCache<THREE.Group>(disposeObject3D);

/** Empty object node — null transform anchor helper in 3D viewport, invisible in final camera render. */
export const OBJECT_EMPTY_NODE: NodeDefinition = {
  type: "object/empty",
  label: "Empty",
  category: "object",
  inputs: [
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "location", label: "Location", type: "vector" },
  ],
  defaultParams: {
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
  },
  paramFields: [
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale", kind: "vector" },
  ],
  evaluate: (inputs, params, ctx) => {
    let group = emptyGroupCache.get(ctx.nodeId);
    if (!group) {
      group = new THREE.Group();

      const pickGeo = new THREE.SphereGeometry(0.5, 8, 8);
      const pickMat = new THREE.MeshBasicMaterial({ visible: false });
      const pickMesh = new THREE.Mesh(pickGeo, pickMat);
      group.add(pickMesh);

      const axes = new THREE.AxesHelper(0.8);
      axes.userData.isHelper = true;
      group.add(axes);

      const points = [
        new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.4, 0, 0),
        new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, 0.4, 0),
        new THREE.Vector3(0, 0, -0.4), new THREE.Vector3(0, 0, 0.4),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0xffcc00, opacity: 0.9, transparent: true });
      const crosshair = new THREE.LineSegments(geom, mat);
      crosshair.userData.isHelper = true;
      group.add(crosshair);

      group.userData.nodeId = ctx.nodeId;
      group.userData.isEmpty = true;
      group.traverse((c) => {
        c.userData.nodeId = ctx.nodeId;
      });
      emptyGroupCache.set(ctx.nodeId, group);
    }

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      group.matrixAutoUpdate = false;
      group.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    group.matrix.decompose(pos, quat, scl);

    return {
      geometry: group,
      matrix: group.matrix.clone(),
      location: pos,
    };
  },
};

import * as THREE from "three";
import { NodeDefinition } from "../types";

interface TextureNodeState {
  texture?: THREE.Texture;
  mesh?: THREE.Mesh;
  aspectRatio: number;
  lastPath?: string;
}

const textureCache = new Map<string, TextureNodeState>();

function getState(nodeId: string): TextureNodeState {
  let state = textureCache.get(nodeId);
  if (!state) {
    state = { aspectRatio: 1.0 };
    textureCache.set(nodeId, state);
  }
  return state;
}

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

/** Image Texture node — loads image files (.png, .jpg, .webp) into a THREE.Texture socket output. */
export const TEXTURE_IMAGE_NODE: NodeDefinition = {
  type: "texture/image",
  label: "Image Texture",
  category: "texture",
  inputs: [
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
  ],
  outputs: [
    { id: "texture", label: "Texture", type: "texture" },
    { id: "aspectRatio", label: "Aspect Ratio", type: "value" },
  ],
  defaultParams: {
    filePath: "",
    wrapS: "repeat",
    wrapT: "repeat",
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "Image File",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
      onLoaded: (nodeId, path, content) => {
        const state = getState(nodeId);
        state.lastPath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, (loaded) => {
            if (loaded.image?.width && loaded.image?.height) {
              state.aspectRatio = loaded.image.width / loaded.image.height;
            }
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          state.texture = texture;
        } catch (err) {
          console.error("Failed to load image texture:", err);
        }
      },
    },
    { id: "wrapS", label: "Wrap S", kind: "select", options: ["repeat", "clamp", "mirror"] },
    { id: "wrapT", label: "Wrap T", kind: "select", options: ["repeat", "clamp", "mirror"] },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);
    const texture = state.texture;

    if (texture) {
      const wrapMap: Record<string, THREE.Wrapping> = {
        repeat: THREE.RepeatWrapping,
        clamp: THREE.ClampToEdgeWrapping,
        mirror: THREE.MirroredRepeatWrapping,
      };
      texture.wrapS = wrapMap[String(params.wrapS || "repeat")] ?? THREE.RepeatWrapping;
      texture.wrapT = wrapMap[String(params.wrapT || "repeat")] ?? THREE.RepeatWrapping;

      if (inputs.uvScale instanceof THREE.Vector3) {
        texture.repeat.set(inputs.uvScale.x, inputs.uvScale.y);
      }
      if (inputs.uvOffset instanceof THREE.Vector3) {
        texture.offset.set(inputs.uvOffset.x, inputs.uvOffset.y);
      }
      texture.needsUpdate = true;
    }

    return {
      texture: texture ?? new THREE.Texture(),
      aspectRatio: state.aspectRatio,
    };
  },
};

/**
 * Texture to Plane node — turns an image texture (or direct file pick) into a 3D Plane object
 * pre-mapped with proper aspect ratio, shadows, double-sided rendering, and PBR controls.
 */
export const TEXTURE_PLANE_NODE: NodeDefinition = {
  type: "texture/plane",
  label: "Texture to Plane",
  category: "texture",
  inputs: [
    { id: "texture", label: "Texture", type: "texture" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color Tint", type: "color" },
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    filePath: "",
    color: new THREE.Color(0xffffff),
    doubleSided: true,
    keepAspect: true,
    roughness: 0.5,
    metalness: 0.1,
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "Image File (Fallback)",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp"],
      onLoaded: (nodeId, path, content) => {
        const state = getState(nodeId);
        state.lastPath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, (loaded) => {
            if (loaded.image?.width && loaded.image?.height) {
              state.aspectRatio = loaded.image.width / loaded.image.height;
            }
            if (state.mesh?.material) {
              (state.mesh.material as THREE.Material).needsUpdate = true;
            }
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          state.texture = texture;
        } catch (err) {
          console.error("Failed to load texture for plane:", err);
        }
      },
    },
    { id: "color", label: "Color Tint", kind: "color" },
    { id: "doubleSided", label: "Double Sided", kind: "boolean" },
    { id: "keepAspect", label: "Keep Aspect Ratio", kind: "boolean" },
    { id: "roughness", label: "Roughness", kind: "number", step: 0.05 },
    { id: "metalness", label: "Metalness", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getState(ctx.nodeId);

    // Create or retrieve 3D Plane Mesh
    if (!state.mesh) {
      const geom = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state.mesh = mesh;
    }

    const mesh = state.mesh;

    // Determine active texture (from input socket or param file fallback)
    const inputTexture = inputs.texture instanceof THREE.Texture && inputs.texture.image ? inputs.texture : null;
    const activeTexture = inputTexture || state.texture;

    // Calculate aspect ratio scaling
    const keepAspect = Boolean(params.keepAspect ?? true);
    let aspect = 1.0;
    if (activeTexture && activeTexture.image?.width && activeTexture.image?.height) {
      aspect = activeTexture.image.width / activeTexture.image.height;
    } else if (state.aspectRatio) {
      aspect = state.aspectRatio;
    }

    // Apply Matrix transformation
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix.clone() : new THREE.Matrix4();
      if (keepAspect && aspect !== 1.0) {
        matrix.multiply(new THREE.Matrix4().makeScale(aspect, 1.0, 1.0));
      }
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix);
    }

    // Update material properties
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    mat.color.copy(color);
    mat.side = Boolean(params.doubleSided ?? true) ? THREE.DoubleSide : THREE.FrontSide;
    mat.roughness = Math.max(0, Math.min(1, Number(params.roughness) ?? 0.5));
    mat.metalness = Math.max(0, Math.min(1, Number(params.metalness) ?? 0.1));

    if (activeTexture) {
      mat.map = activeTexture;
      mat.map.colorSpace = THREE.SRGBColorSpace;

      let scaleX = 1;
      let scaleY = 1;
      if (inputs.uvScale instanceof THREE.Vector3) {
        scaleX = inputs.uvScale.x;
        scaleY = inputs.uvScale.y;
      }
      let offsetX = 0;
      let offsetY = 0;
      if (inputs.uvOffset instanceof THREE.Vector3) {
        offsetX = inputs.uvOffset.x;
        offsetY = inputs.uvOffset.y;
      }

      mat.map.repeat.set(scaleX, scaleY);
      mat.map.offset.set(offsetX, offsetY);
      mat.map.needsUpdate = true;
    } else {
      mat.map = null;
    }
    mat.needsUpdate = true;

    return { geometry: mesh };
  },
};

/** Texture Transform node — modifies UV repeat, offset, and rotation of a THREE.Texture. */
export const TEXTURE_TRANSFORM_NODE: NodeDefinition = {
  type: "texture/transform",
  label: "Texture Transform",
  category: "texture",
  inputs: [
    { id: "texture", label: "Texture", type: "texture" },
    { id: "scale", label: "Scale", type: "vector" },
    { id: "offset", label: "Offset", type: "vector" },
    { id: "rotation", label: "Rotation (°)", type: "value" },
  ],
  outputs: [{ id: "texture", label: "Texture", type: "texture" }],
  defaultParams: {
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
  },
  paramFields: [
    { id: "scaleX", label: "Scale X", kind: "number", step: 0.1 },
    { id: "scaleY", label: "Scale Y", kind: "number", step: 0.1 },
    { id: "offsetX", label: "Offset X", kind: "number", step: 0.05 },
    { id: "offsetY", label: "Offset Y", kind: "number", step: 0.05 },
    { id: "rotation", label: "Rotation (°)", kind: "number", step: 5 },
  ],
  evaluate: (inputs, params) => {
    const source = inputs.texture instanceof THREE.Texture ? inputs.texture : new THREE.Texture();
    const texture = source.clone();

    let scaleX = Number(params.scaleX) || 1;
    let scaleY = Number(params.scaleY) || 1;
    if (inputs.scale instanceof THREE.Vector3) {
      scaleX = inputs.scale.x;
      scaleY = inputs.scale.y;
    }

    let offsetX = Number(params.offsetX) || 0;
    let offsetY = Number(params.offsetY) || 0;
    if (inputs.offset instanceof THREE.Vector3) {
      offsetX = inputs.offset.x;
      offsetY = inputs.offset.y;
    }

    const rotDeg = inputs.rotation !== undefined ? Number(inputs.rotation) : Number(params.rotation) || 0;

    texture.repeat.set(scaleX, scaleY);
    texture.offset.set(offsetX, offsetY);
    texture.rotation = (rotDeg * Math.PI) / 180;
    texture.center.set(0.5, 0.5);
    texture.needsUpdate = true;

    return { texture };
  },
};

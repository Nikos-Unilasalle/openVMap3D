import * as THREE from "three";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { composeNativeMatrix } from "./transform";
import { COMMON_PRIMITIVE_OUTPUTS, primitiveOutputs } from "./object";

interface TextureNodeState {
  texture?: THREE.Texture;
  mesh?: THREE.Mesh;
  aspectRatio: number;
  lastPath?: string;
}

const textureCache = createNodeCache<TextureNodeState>((s) => s.texture?.dispose());

function getState(nodeId: string): TextureNodeState {
  let state = textureCache.get(nodeId);
  if (!state) {
    state = { aspectRatio: 1.0 };
    textureCache.set(nodeId, state);
  }
  return state;
}

function createTextureBlob(content: unknown, path: string): Blob {
  const ext = path.split(".").pop()?.toLowerCase() ?? "png";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  };
  const mime = mimeMap[ext] || "image/png";
  return content instanceof Uint8Array ? new Blob([content], { type: mime }) : new Blob([content as any], { type: mime });
}

function asColor(v: unknown, fallback: THREE.Color): THREE.Color {
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
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".svg"],
      onLoaded: (nodeId, path, content) => {
        const state = getState(nodeId);
        state.lastPath = path;
        try {
          const blob = createTextureBlob(content, path);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(
            url,
            (loaded) => {
              URL.revokeObjectURL(url);
              if (loaded.image?.width && loaded.image?.height) {
                state.aspectRatio = loaded.image.width / loaded.image.height;
              }
              loaded.needsUpdate = true;
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
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
      texture.colorSpace = THREE.SRGBColorSpace;
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
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    filePath: "",
    color: new THREE.Color(0xffffff),
    transparent: true,
    alphaCutoff: 0.001,
    doubleSided: true,
    keepAspect: true,
    roughness: 0.5,
    metalness: 0.1,
  },
  dynamicParamFields: () => [
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale", kind: "vector" },
    {
      id: "filePath",
      label: "Image File (Fallback)",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".svg"],
      onLoaded: (nodeId, path, content) => {
        const state = getState(nodeId);
        state.lastPath = path;
        try {
          const blob = createTextureBlob(content, path);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(
            url,
            (loaded) => {
              URL.revokeObjectURL(url);
              if (loaded.image?.width && loaded.image?.height) {
                state.aspectRatio = loaded.image.width / loaded.image.height;
              }
              loaded.needsUpdate = true;
              if (state.mesh?.material) {
                (state.mesh.material as THREE.Material).needsUpdate = true;
              }
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
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
    { id: "transparent", label: "Transparent (Alpha)", kind: "boolean" },
    { id: "alphaCutoff", label: "Alpha Cutoff", kind: "number", step: 0.01 },
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
        transparent: true,
        alphaTest: 0.001,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.nodeId = ctx.nodeId;
      state.mesh = mesh;
    }

    const mesh = state.mesh;

    // Determine active texture (from input socket or param file fallback)
    const inputTexture = inputs.texture instanceof THREE.Texture ? inputs.texture : null;
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
      const wiredMatrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix.clone() : new THREE.Matrix4();
      if (keepAspect && aspect !== 1.0) {
        wiredMatrix.multiply(new THREE.Matrix4().makeScale(aspect, 1.0, 1.0));
      }
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(composeNativeMatrix(wiredMatrix, params.location, params.rotation, params.scale));
    }

    // Update material properties
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    mat.color.copy(color);
    mat.side = Boolean(params.doubleSided ?? true) ? THREE.DoubleSide : THREE.FrontSide;
    mat.roughness = Math.max(0, Math.min(1, Number(params.roughness) ?? 0.5));
    mat.metalness = Math.max(0, Math.min(1, Number(params.metalness) ?? 0.1));

    const isTransparent = Boolean(params.transparent ?? true);
    mat.transparent = isTransparent;
    mat.alphaTest = isTransparent ? Math.max(0, Number(params.alphaCutoff ?? 0.001)) : 0;
    mat.depthWrite = !isTransparent || mat.alphaTest > 0;

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

    return primitiveOutputs(mesh);
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

interface ProcTextureState {
  texture?: THREE.CanvasTexture;
  canvas?: HTMLCanvasElement;
  signature?: string;
}

const procTextureCache = createNodeCache<ProcTextureState>((s) => s.texture?.dispose());

function getProcState(nodeId: string): ProcTextureState {
  let state = procTextureCache.get(nodeId);
  if (!state) {
    state = {};
    procTextureCache.set(nodeId, state);
  }
  return state;
}

function drawProcedural(canvas: HTMLCanvasElement, type: string, colorA: THREE.Color, colorB: THREE.Color, scale: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  const cells = Math.max(1, Math.round(scale));
  const cell = size / cells;
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;

  ctx.fillStyle = hex(colorA);
  ctx.fillRect(0, 0, size, size);

  if (type === "checker") {
    ctx.fillStyle = hex(colorB);
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        if ((i + j) % 2 === 1) ctx.fillRect(i * cell, j * cell, cell + 1, cell + 1);
      }
    }
  } else if (type === "stripes") {
    ctx.fillStyle = hex(colorB);
    for (let i = 1; i < cells; i += 2) ctx.fillRect(i * cell, 0, cell + 1, size);
  } else if (type === "grid") {
    ctx.strokeStyle = hex(colorB);
    ctx.lineWidth = Math.max(1, cell * 0.12);
    for (let i = 0; i <= cells; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cell, 0);
      ctx.lineTo(i * cell, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cell);
      ctx.lineTo(size, i * cell);
      ctx.stroke();
    }
  } else if (type === "gradient") {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, hex(colorA));
    g.addColorStop(1, hex(colorB));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  } else if (type === "rings") {
    const c = size / 2;
    ctx.strokeStyle = hex(colorB);
    ctx.lineWidth = Math.max(1, cell * 0.25);
    for (let r = 1; r <= cells; r++) {
      ctx.beginPath();
      ctx.arc(c, c, (r / cells) * c, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (type === "noise") {
    ctx.fillStyle = hex(colorB);
    for (let i = 0; i < (size * size) / 8; i++) {
      const x = Math.floor(Math.random() * size);
      const y = Math.floor(Math.random() * size);
      ctx.fillRect(x, y, 2, 2);
    }
  }
}

/** Procedural Texture node — generates a checker/gradient/stripe/… texture on a canvas. */
export const TEXTURE_PROCEDURAL_NODE: NodeDefinition = {
  type: "texture/procedural",
  label: "Procedural Texture",
  category: "texture",
  inputs: [
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
  ],
  outputs: [{ id: "texture", label: "Texture", type: "texture" }],
  defaultParams: {
    type: "checker",
    colorA: new THREE.Color(0xffffff),
    colorB: new THREE.Color(0x222222),
    scale: 8,
    resolution: 256,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
  },
  dynamicParamFields: () => [
    { id: "type", label: "Pattern", kind: "select", options: ["checker", "gradient", "stripes", "grid", "rings", "noise"] },
    { id: "colorA", label: "Color A", kind: "color" },
    { id: "colorB", label: "Color B", kind: "color" },
    { id: "scale", label: "Scale / Density", kind: "number", step: 1 },
    { id: "resolution", label: "Resolution (px)", kind: "number", step: 64 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getProcState(ctx.nodeId);
    if (typeof document === "undefined") return { texture: null };

    const type = String(params.type || "checker");
    const resolution = Math.max(16, Math.min(1024, Math.round(Number(params.resolution) || 256)));
    const scale = Math.max(1, Number(params.scale) || 8);
    const colorA = asColor(params.colorA, new THREE.Color(0xffffff));
    const colorB = asColor(params.colorB, new THREE.Color(0x222222));

    if (!state.canvas) state.canvas = document.createElement("canvas");
    const sig = JSON.stringify([type, resolution, scale, colorA.getHexString(), colorB.getHexString()]);
    if (sig !== state.signature) {
      state.signature = sig;
      state.canvas.width = resolution;
      state.canvas.height = resolution;
      drawProcedural(state.canvas, type, colorA, colorB, scale);
      if (!state.texture) {
        state.texture = new THREE.CanvasTexture(state.canvas);
        state.texture.wrapS = THREE.RepeatWrapping;
        state.texture.wrapT = THREE.RepeatWrapping;
        state.texture.colorSpace = THREE.SRGBColorSpace;
      } else {
        state.texture.image = state.canvas;
        state.texture.needsUpdate = true;
      }
    }

    // UV tiling / offset, like the image texture node.
    if (inputs.uvScale instanceof THREE.Vector3) state.texture!.repeat.set(inputs.uvScale.x, inputs.uvScale.y);
    else state.texture!.repeat.set(Number(params.uvScaleX) || 1, Number(params.uvScaleY) || 1);
    if (inputs.uvOffset instanceof THREE.Vector3) state.texture!.offset.set(inputs.uvOffset.x, inputs.uvOffset.y);
    else state.texture!.offset.set(Number(params.uvOffsetX) || 0, Number(params.uvOffsetY) || 0);

    return { texture: state.texture };
  },
};

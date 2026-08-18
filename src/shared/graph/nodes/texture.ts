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

/** Deterministic PRNG so a pattern stays stable for a given seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded 2D lattice hash → 0..1, used for value noise / voronoi sites. */
function hash2(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

function colorAt(a: THREE.Color, b: THREE.Color, t: number): [number, number, number] {
  return [
    Math.round(lerpN(a.r, b.r, t) * 255),
    Math.round(lerpN(a.g, b.g, t) * 255),
    Math.round(lerpN(a.b, b.b, t) * 255),
  ];
}

/** Fills the canvas from a per-pixel RGB function via an ImageData buffer (fast for noise/voronoi). */
function drawPerPixel(canvas: HTMLCanvasElement, fn: (x: number, y: number) => [number, number, number]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * size + x) * 4;
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawProcedural(
  canvas: HTMLCanvasElement,
  type: string,
  colorA: THREE.Color,
  colorB: THREE.Color,
  scale: number,
  seed: number,
  octaves: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = canvas.width;
  const cells = Math.max(1, Math.round(scale));
  const cell = size / cells;
  const hex = (c: THREE.Color) => `#${c.getHexString()}`;

  if (type === "perlin" || type === "voronoi" || type === "wave" || type === "noise") {
    if (type === "perlin") {
      const o = Math.max(1, Math.round(octaves));
      drawPerPixel(canvas, (x, y) => colorAt(colorA, colorB, fbm(x / cell, y / cell, seed, o)));
    } else if (type === "voronoi") {
      const rand = mulberry32(seed);
      const sites: { x: number; y: number }[] = [];
      for (let i = 0; i < cells * cells; i++) sites.push({ x: rand() * size, y: rand() * size });
      drawPerPixel(canvas, (x, y) => {
        let minD = Infinity;
        for (const s of sites) {
          const dx = x - s.x;
          const dy = y - s.y;
          const dd = dx * dx + dy * dy;
          if (dd < minD) minD = dd;
        }
        return colorAt(colorB, colorA, Math.min(1, Math.sqrt(minD) / cell));
      });
    } else if (type === "wave") {
      drawPerPixel(canvas, (x, y) => {
        const n = 0.5 + 0.5 * Math.sin((x / cell) * Math.PI * 2) * Math.sin((y / cell) * Math.PI * 2);
        return colorAt(colorA, colorB, n);
      });
    } else {
      // noise — deterministic sprinkled dots
      const rand = mulberry32(seed);
      drawPerPixel(canvas, () => colorAt(colorA, colorB, rand()));
    }
    return;
  }

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
    seed: 1,
    octaves: 3,
    resolution: 256,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
  },
  dynamicParamFields: (instance) => {
    const type = String(instance.params.type || "checker");
    return [
      { id: "type", label: "Pattern", kind: "select", options: ["checker", "gradient", "stripes", "grid", "rings", "wave", "perlin", "voronoi", "noise"] },
      { id: "colorA", label: "Color A", kind: "color" },
      { id: "colorB", label: "Color B", kind: "color" },
      { id: "scale", label: "Scale / Density", kind: "number", step: 1 },
      ...(type === "perlin" ? [{ id: "octaves", label: "Octaves", kind: "number", step: 1 } as const] : []),
      { id: "seed", label: "Seed", kind: "number", step: 1 },
      { id: "resolution", label: "Resolution (px)", kind: "number", step: 64 },
    ];
  },
  evaluate: (inputs, params, ctx) => {
    const state = getProcState(ctx.nodeId);
    if (typeof document === "undefined") return { texture: null };

    const type = String(params.type || "checker");
    const resolution = Math.max(16, Math.min(1024, Math.round(Number(params.resolution) || 256)));
    const scale = Math.max(1, Number(params.scale) || 8);
    const seed = Math.floor(Number(params.seed) || 1);
    const octaves = Math.max(1, Math.round(Number(params.octaves) || 3));
    const colorA = asColor(params.colorA, new THREE.Color(0xffffff));
    const colorB = asColor(params.colorB, new THREE.Color(0x222222));

    if (!state.canvas) state.canvas = document.createElement("canvas");
    const sig = JSON.stringify([type, resolution, scale, seed, octaves, colorA.getHexString(), colorB.getHexString()]);
    if (sig !== state.signature) {
      state.signature = sig;
      state.canvas.width = resolution;
      state.canvas.height = resolution;
      drawProcedural(state.canvas, type, colorA, colorB, scale, seed, octaves);
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

interface ToNormalState {
  texture?: THREE.CanvasTexture;
  canvas?: HTMLCanvasElement;
  heightCanvas?: HTMLCanvasElement;
  signature?: string;
}

const toNormalCache = createNodeCache<ToNormalState>((s) => s.texture?.dispose());

function getToNormalState(nodeId: string): ToNormalState {
  let state = toNormalCache.get(nodeId);
  if (!state) {
    state = {};
    toNormalCache.set(nodeId, state);
  }
  return state;
}

function isDrawable(v: unknown): boolean {
  return (
    (typeof HTMLCanvasElement !== "undefined" && v instanceof HTMLCanvasElement) ||
    (typeof HTMLImageElement !== "undefined" && v instanceof HTMLImageElement) ||
    (typeof ImageBitmap !== "undefined" && v instanceof ImageBitmap) ||
    (typeof HTMLVideoElement !== "undefined" && v instanceof HTMLVideoElement)
  );
}

/** Texture to Normal node — derives a tangent-space normal map from a texture's luminance. */
export const TEXTURE_TO_NORMAL_NODE: NodeDefinition = {
  type: "texture/to_normal",
  label: "Texture to Normal",
  category: "texture",
  inputs: [{ id: "texture", label: "Texture", type: "texture" }],
  outputs: [{ id: "normal", label: "Normal Map", type: "texture" }],
  defaultParams: { strength: 1, resolution: 256 },
  dynamicParamFields: () => [
    { id: "strength", label: "Strength", kind: "number", step: 0.1 },
    { id: "resolution", label: "Resolution (px)", kind: "number", step: 64 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getToNormalState(ctx.nodeId);
    if (typeof document === "undefined") return { normal: null };
    const source = inputs.texture instanceof THREE.Texture ? inputs.texture : null;
    if (!source || !isDrawable(source.image)) return { normal: null };

    const strength = Math.max(0, Number(params.strength) || 1);
    const resolution = Math.max(16, Math.min(1024, Math.round(Number(params.resolution) || 256)));
    const sig = JSON.stringify([strength, resolution, source.uuid, source.version]);
    if (sig !== state.signature) {
      state.signature = sig;
      if (!state.heightCanvas) state.heightCanvas = document.createElement("canvas");
      if (!state.canvas) state.canvas = document.createElement("canvas");

      const hc = state.heightCanvas;
      hc.width = resolution;
      hc.height = resolution;
      const hctx = hc.getContext("2d");
      if (!hctx) return { normal: null };
      hctx.drawImage(source.image as CanvasImageSource, 0, 0, resolution, resolution);
      const hData = hctx.getImageData(0, 0, resolution, resolution).data;

      // Grayscale height map.
      const height = new Float32Array(resolution * resolution);
      for (let i = 0; i < height.length; i++) {
        height[i] = (0.299 * hData[i * 4] + 0.587 * hData[i * 4 + 1] + 0.114 * hData[i * 4 + 2]) / 255;
      }

      const nc = state.canvas;
      nc.width = resolution;
      nc.height = resolution;
      const nctx = nc.getContext("2d");
      if (!nctx) return { normal: null };
      const nImg = nctx.createImageData(resolution, resolution);
      const nd = nImg.data;
      const at = (x: number, y: number) =>
        (((y + resolution) % resolution) * resolution) + ((x + resolution) % resolution);
      const n = new THREE.Vector3();
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const dx = (height[at(x + 1, y)] - height[at(x - 1, y)]) * 0.5;
          const dy = (height[at(x, y + 1)] - height[at(x, y - 1)]) * 0.5;
          n.set(-dx * strength, -dy * strength, 1).normalize();
          const i = (y * resolution + x) * 4;
          nd[i] = (n.x * 0.5 + 0.5) * 255;
          nd[i + 1] = (n.y * 0.5 + 0.5) * 255;
          nd[i + 2] = (n.z * 0.5 + 0.5) * 255;
          nd[i + 3] = 255;
        }
      }
      nctx.putImageData(nImg, 0, 0);

      if (!state.texture) {
        state.texture = new THREE.CanvasTexture(nc);
        state.texture.wrapS = THREE.RepeatWrapping;
        state.texture.wrapT = THREE.RepeatWrapping;
        state.texture.colorSpace = THREE.LinearSRGBColorSpace; // normal maps stay linear
      } else {
        state.texture.image = nc;
        state.texture.needsUpdate = true;
      }
    }

    return { normal: state.texture };
  },
};

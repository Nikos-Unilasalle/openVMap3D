import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { NodeDefinition } from "../types";
import { toBoolean } from "../sockets";
import { createNodeCache } from "../nodeCaches";

interface ObjState {
  group: THREE.Group;
  lastObjContent?: string;
  lastObjPath?: string;
  textureMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  lastTexturePath?: string;
  lastNormalPath?: string;
}

const objStateCache = createNodeCache<ObjState>();

function getOrCreateObjState(nodeId: string): ObjState {
  const existing = objStateCache.get(nodeId);
  if (existing) return existing;

  // Default fallback mesh if no OBJ loaded yet (unit cube)
  const defaultMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
  );
  defaultMesh.castShadow = true;
  defaultMesh.receiveShadow = true;
  defaultMesh.userData.nodeId = nodeId;

  const group = new THREE.Group();
  group.add(defaultMesh);

  const state: ObjState = { group };
  objStateCache.set(nodeId, state);
  return state;
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

/**
 * OBJ Model node — imports 3D .OBJ models with UV texture mapping, normal maps,
 * UV tiling/offset scaling, and PBR/Shadeless material controls.
 */
export const OBJECT_OBJ_NODE: NodeDefinition = {
  type: "object/obj",
  label: "OBJ Model",
  category: "structure",
  inputs: [
    { id: "diffuse", label: "Diffuse Map", type: "texture" },
    { id: "normal", label: "Normal Map", type: "texture" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "color", label: "Color", type: "color" },
    { id: "shadeless", label: "Shadeless", type: "value" },
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
    { id: "roughness", label: "Roughness", type: "value" },
    { id: "metalness", label: "Metalness", type: "value" },
    { id: "wireframe", label: "Wireframe", type: "value" },
    { id: "wireframeLinewidth", label: "Wireframe Width", type: "value" },
    { id: "opacity", label: "Opacity", type: "value" },
  ],
  outputs: [{ id: "geometry", label: "Geometry", type: "geometry" }],
  defaultParams: {
    filePath: "",
    texturePath: "",
    normalMapPath: "",
    color: new THREE.Color(0xffffff),
    shadeless: 0,
    uvScaleX: 1,
    uvScaleY: 1,
    uvOffsetX: 0,
    uvOffsetY: 0,
    roughness: 0.5,
    metalness: 0.1,
    wireframe: 0,
    wireframeLinewidth: 1.0,
    opacity: 1.0,
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "3D Model (.obj)",
      kind: "file",
      accept: [".obj"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreateObjState(nodeId);
        state.lastObjPath = path;
        state.lastObjContent = content;

        try {
          const loader = new OBJLoader();
          const parsed = loader.parse(content);

          // Configure shadows & nodeId metadata on parsed child meshes
          parsed.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.userData.nodeId = nodeId;
            }
          });

          state.group.clear();
          state.group.add(parsed);
        } catch (err) {
          console.error("Failed to parse OBJ file content:", err);
        }
      },
    },
    {
      id: "texturePath",
      label: "Diffuse Texture Map",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreateObjState(nodeId);
        state.lastTexturePath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, () => {
            state.group.traverse((c) => {
              if (c instanceof THREE.Mesh && c.material) {
                c.material.needsUpdate = true;
              }
            });
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          state.textureMap = texture;
        } catch (err) {
          console.error("Failed to load texture image:", err);
        }
      },
    },
    {
      id: "normalMapPath",
      label: "Normal Map",
      kind: "file",
      accept: [".png", ".jpg", ".jpeg", ".webp"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreateObjState(nodeId);
        state.lastNormalPath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(url, () => {
            state.group.traverse((c) => {
              if (c instanceof THREE.Mesh && c.material) {
                c.material.needsUpdate = true;
              }
            });
          });
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          state.normalMap = texture;
        } catch (err) {
          console.error("Failed to load normal map image:", err);
        }
      },
    },
    { id: "color", label: "Color (fallback)", kind: "color" },
    { id: "shadeless", label: "Shadeless (Unlit)", kind: "boolean" },
    { id: "uvScaleX", label: "UV Scale X (Tile)", kind: "number", step: 0.1 },
    { id: "uvScaleY", label: "UV Scale Y (Tile)", kind: "number", step: 0.1 },
    { id: "uvOffsetX", label: "UV Offset X", kind: "number", step: 0.05 },
    { id: "uvOffsetY", label: "UV Offset Y", kind: "number", step: 0.05 },
    { id: "roughness", label: "Roughness", kind: "number", step: 0.05 },
    { id: "metalness", label: "Metalness", kind: "number", step: 0.05 },
    { id: "wireframe", label: "Wireframe", kind: "boolean" },
    { id: "wireframeLinewidth", label: "Wireframe Width", kind: "number", step: 0.5 },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getOrCreateObjState(ctx.nodeId);
    const group = state.group;

    // Apply matrix transformation
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      const matrix = inputs.matrix instanceof THREE.Matrix4 ? inputs.matrix : new THREE.Matrix4();
      group.matrixAutoUpdate = false;
      group.matrix.copy(matrix);
    }

    const color = asColor(inputs.color, asColor(params.color, new THREE.Color(0xffffff)));
    const shadeless = toBoolean(inputs.shadeless !== undefined ? inputs.shadeless : params.shadeless ?? 0);
    const wireframe = toBoolean(inputs.wireframe !== undefined ? inputs.wireframe : params.wireframe ?? 0);
    const wireframeLinewidth = Math.max(1, Number(inputs.wireframeLinewidth ?? inputs.wireframeWidth) || Number(params.wireframeLinewidth ?? params.wireframeWidth) || 1.0);
    const opacity = Math.min(1, Math.max(0, inputs.opacity !== undefined ? Number(inputs.opacity) : Number(params.opacity) ?? 1.0));
    const isTransparent = opacity < 0.999;

    let scaleX = Number(params.uvScaleX) || 1;
    let scaleY = Number(params.uvScaleY) || 1;
    if (inputs.uvScale instanceof THREE.Vector3) {
      scaleX = inputs.uvScale.x;
      scaleY = inputs.uvScale.y;
    }

    let offsetX = Number(params.uvOffsetX) || 0;
    let offsetY = Number(params.uvOffsetY) || 0;
    if (inputs.uvOffset instanceof THREE.Vector3) {
      offsetX = inputs.uvOffset.x;
      offsetY = inputs.uvOffset.y;
    }

    const roughness = Math.max(0, Math.min(1, inputs.roughness !== undefined ? Number(inputs.roughness) : Number(params.roughness) ?? 0.5));
    const metalness = Math.max(0, Math.min(1, inputs.metalness !== undefined ? Number(inputs.metalness) : Number(params.metalness) ?? 0.1));

    const inputDiffuse = inputs.diffuse instanceof THREE.Texture && inputs.diffuse.image ? inputs.diffuse : null;
    const inputNormal = inputs.normal instanceof THREE.Texture && inputs.normal.image ? inputs.normal : null;

    const activeDiffuse = inputDiffuse || state.textureMap;
    const activeNormal = inputNormal || state.normalMap;

    // Update material properties, textures, and UV scaling on all meshes inside group
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (shadeless) {
          if (!(child.material instanceof THREE.MeshBasicMaterial)) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else if (child.material) child.material.dispose();
            child.material = new THREE.MeshBasicMaterial({ color });
          }
          const mat = child.material as THREE.MeshBasicMaterial;
          mat.color.copy(color);
          mat.wireframe = wireframe;
          mat.wireframeLinewidth = wireframeLinewidth;
          mat.transparent = isTransparent;
          mat.opacity = opacity;

          if (activeDiffuse) {
            mat.map = activeDiffuse;
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.repeat.set(scaleX, scaleY);
            mat.map.offset.set(offsetX, offsetY);
            mat.map.needsUpdate = true;
          } else {
            mat.map = null;
          }
          mat.needsUpdate = true;
        } else {
          if (!(child.material instanceof THREE.MeshStandardMaterial)) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else if (child.material) child.material.dispose();
            child.material = new THREE.MeshStandardMaterial({ color });
          }
          const mat = child.material as THREE.MeshStandardMaterial;
          mat.color.copy(color);
          mat.roughness = roughness;
          mat.metalness = metalness;
          mat.wireframe = wireframe;
          mat.wireframeLinewidth = wireframeLinewidth;
          mat.transparent = isTransparent;
          mat.opacity = opacity;

          if (activeDiffuse) {
            mat.map = activeDiffuse;
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.repeat.set(scaleX, scaleY);
            mat.map.offset.set(offsetX, offsetY);
            mat.map.needsUpdate = true;
          } else {
            mat.map = null;
          }

          if (activeNormal) {
            mat.normalMap = activeNormal;
            mat.normalMap.repeat.set(scaleX, scaleY);
            mat.normalMap.offset.set(offsetX, offsetY);
            mat.normalMap.needsUpdate = true;
          } else {
            mat.normalMap = null;
          }

          mat.needsUpdate = true;
        }
      }
    });

    return { geometry: group };
  },
};

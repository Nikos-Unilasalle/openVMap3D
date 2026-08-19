import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { composeNativeMatrix } from "./transform";
import { COMMON_PRIMITIVE_OUTPUTS, extractMaterialParams, primitiveOutputs } from "./object";

interface ObjState {
  group: THREE.Group;
  lastObjContent?: string;
  lastObjPath?: string;
  textureMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  lastTexturePath?: string;
  lastNormalPath?: string;
  /** Last material/texture signature applied — skip the per-frame re-apply when unchanged. */
  lastMaterialSig?: string;
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

/**
 * OBJ Model node — imports 3D .OBJ models with UV texture mapping, normal maps,
 * UV tiling/offset scaling, and PBR/Shadeless material controls.
 */
export const OBJECT_OBJ_NODE: NodeDefinition = {
  type: "object/obj",
  label: "OBJ Model",
  category: "object",
  inputs: [
    { id: "diffuse", label: "Diffuse Map", type: "texture" },
    { id: "normal", label: "Normal Map", type: "texture" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "material", label: "Material", type: "material" },
    { id: "uvScale", label: "UV Scale", type: "vector" },
    { id: "uvOffset", label: "UV Offset", type: "vector" },
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
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
        if (!path) {
          if (state.textureMap) {
            state.textureMap.dispose();
            state.textureMap = undefined;
          }
          state.lastTexturePath = undefined;
          state.group.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material) {
              c.material.needsUpdate = true;
            }
          });
          return;
        }
        state.lastTexturePath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(
            url,
            () => {
              URL.revokeObjectURL(url);
              state.group.traverse((c) => {
                if (c instanceof THREE.Mesh && c.material) {
                  c.material.needsUpdate = true;
                }
              });
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
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
        if (!path) {
          if (state.normalMap) {
            state.normalMap.dispose();
            state.normalMap = undefined;
          }
          state.lastNormalPath = undefined;
          state.group.traverse((c) => {
            if (c instanceof THREE.Mesh && c.material) {
              c.material.needsUpdate = true;
            }
          });
          return;
        }
        state.lastNormalPath = path;
        try {
          const blob = content instanceof Uint8Array ? new Blob([content]) : new Blob([content]);
          const url = URL.createObjectURL(blob);
          const texture = new THREE.TextureLoader().load(
            url,
            () => {
              URL.revokeObjectURL(url);
              state.group.traverse((c) => {
                if (c instanceof THREE.Mesh && c.material) {
                  c.material.needsUpdate = true;
                }
              });
            },
            undefined,
            () => URL.revokeObjectURL(url)
          );
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          state.normalMap = texture;
        } catch (err) {
          console.error("Failed to load normal map image:", err);
        }
      },
    },
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale", kind: "vector" },
    { id: "color", label: "Color (fallback)", kind: "color" },
    { id: "shadeless", label: "Shadeless (Unlit)", kind: "boolean" },
    { id: "uvScaleX", label: "UV Scale X (Tile)", kind: "number", step: 0.1 },
    { id: "uvScaleY", label: "UV Scale Y (Tile)", kind: "number", step: 0.1 },
    { id: "uvOffsetX", label: "UV Offset X", kind: "number", step: 0.05 },
    { id: "uvOffsetY", label: "UV Offset Y", kind: "number", step: 0.05 },
    { id: "roughness", label: "Roughness", kind: "number", step: 0.05 },
    { id: "metalness", label: "Metalness", kind: "number", step: 0.05 },
    { id: "wireframe", label: "Wireframe", kind: "boolean" },
    { id: "opacity", label: "Opacity", kind: "number", step: 0.05 },
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getOrCreateObjState(ctx.nodeId);
    const group = state.group;

    // Apply matrix transformation
    if (ctx.nodeId !== ctx.liveEditNodeId) {
      group.matrixAutoUpdate = false;
      group.matrix.copy(composeNativeMatrix(inputs.matrix, params.location, params.rotation, params.scale));
    }

    const matParams = extractMaterialParams(inputs, params);
    const color = matParams.color;
    const shadeless = matParams.shadeless;
    const wireframe = matParams.wireframe;
    const opacity = matParams.opacity;
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

    const roughness = Math.max(0, Math.min(1, matParams.roughness));
    const metalness = Math.max(0, Math.min(1, matParams.metalness));

    const inputDiffuse = inputs.diffuse instanceof THREE.Texture && inputs.diffuse.image ? inputs.diffuse : null;
    const inputNormal = inputs.normal instanceof THREE.Texture && inputs.normal.image ? inputs.normal : null;

    const activeDiffuse = (inputDiffuse || state.textureMap) ?? null;
    const activeNormal = (inputNormal || state.normalMap) ?? null;

    // Re-apply (and set needsUpdate on) materials only when something they
    // depend on actually changed — doing it every frame recompiles the shader
    // and re-uploads the 2MB texture 60×/s.
    const sig = [
      color.getHex(),
      shadeless,
      wireframe,
      opacity,
      roughness,
      metalness,
      activeDiffuse?.uuid ?? "",
      activeNormal?.uuid ?? "",
      scaleX,
      scaleY,
      offsetX,
      offsetY,
    ].join("|");
    if (state.lastMaterialSig !== sig) {
      state.lastMaterialSig = sig;
      updateObjMaterials(group, {
        color,
        shadeless,
        wireframe,
        opacity,
        isTransparent,
        roughness,
        metalness,
        activeDiffuse,
        activeNormal,
        scaleX,
        scaleY,
        offsetX,
        offsetY,
      });
    }

    return primitiveOutputs(group);
  },
};

interface ObjMaterialParams {
  color: THREE.Color;
  shadeless: boolean;
  wireframe: boolean;
  opacity: number;
  isTransparent: boolean;
  roughness: number;
  metalness: number;
  activeDiffuse: THREE.Texture | null;
  activeNormal: THREE.Texture | null;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

function updateObjMaterials(group: THREE.Group, p: ObjMaterialParams): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (p.shadeless) {
        if (!(child.material instanceof THREE.MeshBasicMaterial)) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else if (child.material) child.material.dispose();
          child.material = new THREE.MeshBasicMaterial({ color: p.color });
        }
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.color.copy(p.color);
        mat.wireframe = p.wireframe;
        mat.transparent = p.isTransparent;
        mat.opacity = p.opacity;

        if (p.activeDiffuse) {
          mat.map = p.activeDiffuse;
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.repeat.set(p.scaleX, p.scaleY);
          mat.map.offset.set(p.offsetX, p.offsetY);
        } else {
          mat.map = null;
        }
        mat.needsUpdate = true;
      } else {
        if (!(child.material instanceof THREE.MeshStandardMaterial)) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else if (child.material) child.material.dispose();
          child.material = new THREE.MeshStandardMaterial({ color: p.color });
        }
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.color.copy(p.color);
        mat.roughness = p.roughness;
        mat.metalness = p.metalness;
        mat.wireframe = p.wireframe;
        mat.transparent = p.isTransparent;
        mat.opacity = p.opacity;

        if (p.activeDiffuse) {
          mat.map = p.activeDiffuse;
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.repeat.set(p.scaleX, p.scaleY);
          mat.map.offset.set(p.offsetX, p.offsetY);
        } else {
          mat.map = null;
        }

        if (p.activeNormal) {
          mat.normalMap = p.activeNormal;
          mat.normalMap.repeat.set(p.scaleX, p.scaleY);
          mat.normalMap.offset.set(p.offsetX, p.offsetY);
        } else {
          mat.normalMap = null;
        }

        mat.needsUpdate = true;
      }
    }
  });
}

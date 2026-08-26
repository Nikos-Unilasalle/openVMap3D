import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { NodeDefinition } from "../types";
import { createNodeCache } from "../nodeCaches";
import { composeNativeMatrixWithPivot } from "./transform";
import { COMMON_PRIMITIVE_OUTPUTS, TextureParams, applyMaterialParams, extractMaterialParams, primitiveOutputs } from "./object";

interface GltfState {
  group: THREE.Group;
  lastPath?: string;
}

const gltfStateCache = createNodeCache<GltfState>();

function getOrCreateGltfState(nodeId: string): GltfState {
  const existing = gltfStateCache.get(nodeId);
  if (existing) return existing;

  // Default fallback mesh if no glTF loaded yet (unit cube), same convention
  // as OBJ Model's fallback.
  const defaultMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
  );
  defaultMesh.castShadow = true;
  defaultMesh.receiveShadow = true;
  defaultMesh.userData.nodeId = nodeId;

  const group = new THREE.Group();
  group.add(defaultMesh);

  const state: GltfState = { group };
  gltfStateCache.set(nodeId, state);
  return state;
}

/**
 * glTF/GLB Model node — imports .gltf/.glb models. Only self-contained files
 * are supported (a .glb, or a .gltf whose buffers/textures are embedded as
 * data URIs): GLTFLoader.parse is given no resourcePath to resolve external
 * .bin/texture files against, matching how OBJ Model has no external-texture
 * resolution either (textures come in via the Diffuse/Normal Map sockets or
 * their own file pickers instead).
 */
export const OBJECT_GLTF_NODE: NodeDefinition = {
  type: "object/gltf",
  label: "glTF Model",
  category: "object",
  inputs: [
    { id: "visible", label: "Visible", type: "value" },
    { id: "matrix", label: "Matrix", type: "matrix" },
    { id: "material", label: "Material", type: "material" },
    // glTF has no pivot concept of its own — vertices sit wherever the
    // exporting app left them relative to (0,0,0), which a plain Transform
    // always rotates/scales around. This lets rotation/scale pivot around
    // whatever point actually matches the model instead.
    { id: "pivot", label: "Pivot", type: "vector" },
  ],
  outputs: [...COMMON_PRIMITIVE_OUTPUTS],
  defaultParams: {
    visible: 1,
    pivot: new THREE.Vector3(0, 0, 0),
    location: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Vector3(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
    filePath: "",
    color: new THREE.Color(0xffffff),
    emissive: new THREE.Color(0x000000),
    emissiveIntensity: 1.0,
    shadeless: 0,
    roughness: 0.5,
    metalness: 0.1,
    wireframe: 0,
    opacity: 1.0,
    transmission: 0,
    thickness: 0.5,
    useOwnMaterials: 1,
  },
  dynamicParamFields: () => [
    {
      id: "filePath",
      label: "3D Model (.gltf/.glb)",
      kind: "file",
      accept: [".gltf", ".glb"],
      onLoaded: (nodeId, path, content) => {
        const state = getOrCreateGltfState(nodeId);
        state.lastPath = path;
        if (!path) {
          state.group.clear();
          return;
        }

        try {
          const loader = new GLTFLoader();
          const data = content instanceof Uint8Array ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) : content;
          loader.parse(
            data,
            "",
            (gltf) => {
              gltf.scene.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.userData.nodeId = nodeId;
                }
              });
              state.group.clear();
              state.group.add(gltf.scene);
            },
            (err) => console.error("Failed to parse glTF file content:", err),
          );
        } catch (err) {
          console.error("Failed to parse glTF file content:", err);
        }
      },
    },
    { id: "visible", label: "Visible", kind: "boolean", group: "Transform" },
    { id: "location", label: "Location", kind: "vector" },
    { id: "rotation", label: "Rotation (°)", kind: "vector", step: 1, degrees: true },
    { id: "scale", label: "Scale", kind: "vector" },
    { id: "pivot", label: "Pivot", kind: "vector", group: "Transform" },
    {
      id: "useOwnMaterials",
      label: "Use Model's Own Materials",
      kind: "boolean",
      group: "Material",
    },
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
  ],
  evaluate: (inputs, params, ctx) => {
    const state = getOrCreateGltfState(ctx.nodeId);
    const group = state.group;

    if (ctx.nodeId !== ctx.liveEditNodeId) {
      group.matrixAutoUpdate = false;
      group.matrix.copy(
        composeNativeMatrixWithPivot(inputs.matrix, params.location, params.rotation, params.scale, inputs.pivot),
      );
    }

    // glTF ships PBR materials per-mesh (base color, metallic/roughness maps,
    // etc.) that OBJ never carries — overwriting them with the shared
    // primitive material pipeline by default would flatten every imported
    // model to a single flat color. Only override when the user explicitly
    // asks to (matching the graph a Material socket, or dialling in the
    // fallback color/roughness/etc. by hand).
    const useOwnMaterials = params.useOwnMaterials !== undefined ? Boolean(params.useOwnMaterials) : true;
    if (!useOwnMaterials) {
      const matParams = extractMaterialParams(inputs, params);
      const texParams: TextureParams = { activeDiffuse: null, activeNormal: null, activeRoughness: null, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          applyMaterialParams(child, matParams, THREE.FrontSide, texParams);
        }
      });
    }

    return primitiveOutputs(group);
  },
};

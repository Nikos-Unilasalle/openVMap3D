import * as THREE from "three";
import { NodeDefinition } from "../types";
import { asVector3 } from "./transform";
import { primitiveOutputs } from "./object";

const DEFAULT_POINT = new THREE.Vector3(0, 0, 0);
const DEFAULT_NORMAL = new THREE.Vector3(0, 1, 0);

/**
 * Visual Slice — hides everything on the back side of a plane, GPU-side, via
 * THREE.Material.clippingPlanes. Unlike Boolean this never touches geometry:
 * no CSG, no watertight-mesh requirement, works on a whole instanced pack at
 * once (every mesh in the subtree, not just the first one Boolean would find)
 * and is effectively free to animate every frame. The tradeoff is the cut is
 * an open hole, not a capped solid — for "make the bottom of a randomly-tall
 * pole stop existing below the floor" that's exactly the point; reach for
 * Boolean instead when the cut face itself needs to look solid.
 */
export const VISUAL_SLICE_NODE: NodeDefinition = {
  type: "modifier/visual-slice",
  label: "Visual Slice",
  category: "transform",
  inputs: [
    { id: "geometry", label: "Geometry", type: "geometry", owns: true },
    { id: "point", label: "Plane Point", type: "vector" },
    { id: "direction", label: "Plane Normal", type: "vector" },
  ],
  outputs: [
    { id: "geometry", label: "Geometry", type: "geometry" },
    { id: "matrix", label: "Matrix", type: "matrix" },
  ],
  defaultParams: {
    point: DEFAULT_POINT.clone(),
    direction: DEFAULT_NORMAL.clone(),
    invert: 0,
  },
  paramFields: [
    { id: "point", label: "Plane Point", kind: "vector" },
    // Any id containing "normal" (case-insensitive) gets auto-grouped into
    // "Texture & Files" by ParamPanel's heuristic, built for Normal Map
    // sockets — "direction" sidesteps that; this field has nothing to do
    // with textures.
    { id: "direction", label: "Plane Normal", kind: "vector" },
    { id: "invert", label: "Invert", kind: "boolean" },
  ],
  evaluate: (inputs, params, ctx) => {
    const inputObj = inputs.geometry instanceof THREE.Object3D ? inputs.geometry : null;
    if (!inputObj) return { geometry: null, matrix: new THREE.Matrix4() };

    // clippingPlanes is a renderer-level feature — off by default, and a
    // single flag switches it on for every clipped material in the scene, so
    // flip it here rather than asking every project to remember a viewport
    // setting just because one node exists somewhere in the graph.
    if (ctx.renderer) ctx.renderer.localClippingEnabled = true;

    const point = asVector3(inputs.point, asVector3(params.point, DEFAULT_POINT));
    const normal = asVector3(inputs.direction, asVector3(params.direction, DEFAULT_NORMAL)).clone();
    if (normal.lengthSq() < 1e-12) normal.copy(DEFAULT_NORMAL);
    normal.normalize();
    if (params.invert) normal.negate();

    // world-space plane: clippingPlanes are compared against each vertex's
    // world position, so the plane needs no relation to this node's own
    // input transform beyond point/normal already being in world units.
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);

    inputObj.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of materials) {
        if (!mat) continue;
        mat.clippingPlanes = [plane];
        mat.clipShadows = true;
      }
    });

    return primitiveOutputs(inputObj);
  },
};

import * as THREE from "three";
import { createNodeCache } from "./nodeCaches";

/**
 * The native pose (location/rotation/scale + wired matrix) that a curve node
 * applied last, keyed by node id. Curve consumers that build *geometry* from a
 * curve (Curve to Mesh) need to know where the gizmo put the curve, but the
 * curve value itself is just a path in local space — so the curve node writes
 * its pose here and the consumer composes it into its own matrix, keeping the
 * built geometry local (a spawned copy then sits on its support instead of
 * being pushed off it by a baked-in world offset).
 *
 * createNodeCache, not a bare Map: node ids are stable, so an unregistered
 * cache would let a deleted curve node's pose silently reattach to whatever
 * node next lands on that id.
 */
const poses = createNodeCache<THREE.Matrix4>();

export function setCurveNodePose(nodeId: string, matrix: THREE.Matrix4): void {
  poses.set(nodeId, matrix.clone());
}

export function getCurveNodePose(nodeId: string): THREE.Matrix4 | undefined {
  return poses.get(nodeId);
}

import * as THREE from "three";
import { isFatLine, isRealMesh } from "../three/objectKinds";

/**
 * The mesh-only contract, in one place.
 *
 * Vertex-level nodes (Lattice Deform, Subdivide, Boolean, and everything
 * BVH-backed) can only act on a THREE.Mesh — they read
 * `geometry.attributes.position` and rewrite it. But the `geometry` socket
 * carries *any* Object3D, so they routinely receive a THREE.Points (Point
 * Cloud, Particle Render) or a Line2 (Curve to Line, Capture Trails,
 * Connect Nearby) instead.
 *
 * Those nodes already degraded gracefully — `findFirstMesh` returns null and
 * the node hands its input straight back. The problem was that it happened
 * *silently*: no error, no warning, and no visual change, so the operator
 * sees a node that appears wired correctly and does nothing, and goes
 * looking for a parameter they got wrong. `warnMeshRequired` turns that into
 * one console warning naming the node and what it actually received.
 *
 * Warn-once per node id (not per frame): evaluate() runs every frame, and an
 * un-deduplicated warning here would emit sixty lines a second and bury
 * everything else in the console. Same "log once, then stay quiet" contract
 * as particleRuntime.ts's missing-renderer warning.
 */
const warned = new Set<string>();

/**
 * *Every* real Mesh in an object tree, in traversal order — for the nodes
 * that must act on a whole multi-part object rather than one piece of it.
 *
 * `findFirstMesh` is the right call for a node that reads a single surface,
 * but a node combining shapes has to see all of them: Array/Merge/an imported
 * model hand down a Group of many meshes, and taking only the first silently
 * drops the rest (a Boolean fed an Array cut one instance and ignored the
 * other N-1, with nothing to say why).
 */
export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (isRealMesh(child) && child.geometry?.attributes.position) found.push(child);
  });
  return found;
}

/** The first *real* Mesh anywhere in an object tree — what a vertex-level node actually operates on. Fat lines are excluded, see isFatLine. */
export function findFirstMesh(root: THREE.Object3D): THREE.Mesh | null {
  if (isRealMesh(root)) return root;
  let found: THREE.Mesh | null = null;
  root.traverse((child) => {
    if (!found && isRealMesh(child)) found = child;
  });
  return found;
}

/** What kind of thing the operator actually wired in, in their vocabulary rather than three.js's. */
function describe(object: THREE.Object3D): string {
  // isFatLine first: these extend Mesh, so any Mesh-shaped test would claim
  // them before the more specific description could run.
  if (isFatLine(object)) return `a line object (${object.type})`;
  if (object instanceof THREE.Points) return "a point cloud / particle system (THREE.Points)";
  if (object instanceof THREE.Line) return "a line object (THREE.Line)";
  if (object instanceof THREE.Group) return "a group with no mesh inside it";
  return `a ${object.type}`;
}

/**
 * Warns once that `nodeLabel` needed a mesh and did not get one. Returns
 * nothing — the caller still decides what to hand back (every current caller
 * passes its input through unchanged).
 */
export function warnMeshRequired(nodeId: string, nodeLabel: string, received: THREE.Object3D | null): void {
  if (warned.has(nodeId)) return;
  warned.add(nodeId);
  const what = received ? describe(received) : "nothing";
  console.warn(
    `${nodeLabel}: needs a mesh to work on, but received ${what} — the node is passing its input through unchanged. ` +
      `Vertex-level nodes (Subdivide, Lattice Deform, Boolean, Sample Surface, Ray Burst, Spawner) only act on mesh objects.`,
  );
}

/** Lets a node warn again after the operator rewires it — called when a mesh IS found. */
export function clearMeshWarning(nodeId: string): void {
  warned.delete(nodeId);
}

/** Test seam — drops every remembered warning so one test's warning can't silence another's. */
export function resetMeshWarnings(): void {
  warned.clear();
}

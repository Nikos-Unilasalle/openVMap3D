import * as THREE from "three";

/**
 * What kind of thing a THREE.Object3D actually is, where `instanceof` alone
 * gives the wrong answer.
 *
 * Lives in the `three/` layer rather than alongside the graph nodes because
 * both layers need it: `bvh.ts` (surface sampling, BVH building) and the
 * vertex-level graph nodes (Subdivide, Lattice, Boolean) all have to make the
 * same distinction, and the graph layer may import from `three/` but not the
 * reverse.
 */

/**
 * True for three's fat lines — Line2, LineSegments2 and Wireframe.
 *
 * These are implemented as `class LineSegments2 extends Mesh`, so a bare
 * `instanceof THREE.Mesh` accepts them, and every mesh-only code path in the
 * app used to take that bait. It is actively harmful rather than merely
 * imprecise: a fat line's `attributes.position` is the 8-vertex *quad
 * template* that each segment is instanced from, while the real line path
 * lives in the `instanceStart` / `instanceEnd` interleaved attributes. Code
 * that treats one as an ordinary mesh reads the template as if it were
 * geometry — Subdivide on a Capture Trails output returned an 8-vertex Mesh
 * with the instance attributes dropped entirely, i.e. it destroyed the line
 * rather than leaving it alone, and Sample Surface would have scattered
 * points across that same meaningless template.
 *
 * Checked by `.type` rather than importing the classes: it keeps this module
 * free of a dependency on three's examples/jsm bundle, and `.type` is the
 * documented, stable discriminator three itself sets on these classes.
 */
export function isFatLine(object: THREE.Object3D): boolean {
  return object.type === "Line2" || object.type === "LineSegments2" || object.type === "Wireframe";
}

/** A real, vertex-addressable mesh — a THREE.Mesh that is not one of three's fat lines. */
export function isRealMesh(object: THREE.Object3D): object is THREE.Mesh {
  return object instanceof THREE.Mesh && !isFatLine(object);
}

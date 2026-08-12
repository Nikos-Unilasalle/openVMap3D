import * as THREE from "three";

/**
 * The physical reference the operator calibrates against: the corner of the
 * room the projector is aimed at, as two perpendicular walls meeting at the
 * origin with the floor at y=0.
 *
 * Why a *room* and not just an abstract target: every reference point below
 * lands on an actual corner of the actual room — the vertical corner where
 * the two walls meet, and where each wall meets the next corner along. Those
 * are unambiguous things to aim at with a dragged handle. A point floating
 * mid-wall would need a tape mark to be aimable at all, so there are none.
 *
 * The geometric bonus is the one that makes the whole method work: two
 * perpendicular walls put the reference points on more than one plane, which
 * is exactly the non-degenerate configuration the DLT needs (see dlt.ts).
 * The install constraint — "a small area, one or two walls, usually a room
 * corner" — is an advantage here rather than the problem it was for the
 * vanishing-point approach.
 */

export interface RoomCornerDimensions {
  /** Wall A runs along +X from the corner, in the z=0 plane. Metres. */
  width: number;
  /** Floor to ceiling, along +Y. Metres. */
  height: number;
  /** Wall B runs along +Z from the corner, in the x=0 plane. Metres. */
  depth: number;
}

export interface ReferencePoint {
  id: string;
  label: string;
  world: THREE.Vector3;
}

export const DEFAULT_ROOM_CORNER: RoomCornerDimensions = { width: 3.2, height: 2.5, depth: 2.8 };

/** The six room corners visible on the two walls — the points the operator drags onto the real thing. */
export function roomCornerReferencePoints({ width, height, depth }: RoomCornerDimensions): ReferencePoint[] {
  return [
    { id: "corner-floor", label: "Corner / floor", world: new THREE.Vector3(0, 0, 0) },
    { id: "corner-ceiling", label: "Corner / ceiling", world: new THREE.Vector3(0, height, 0) },
    { id: "wallA-floor", label: "Wall A end / floor", world: new THREE.Vector3(width, 0, 0) },
    { id: "wallA-ceiling", label: "Wall A end / ceiling", world: new THREE.Vector3(width, height, 0) },
    { id: "wallB-floor", label: "Wall B end / floor", world: new THREE.Vector3(0, 0, depth) },
    { id: "wallB-ceiling", label: "Wall B end / ceiling", world: new THREE.Vector3(0, height, depth) },
  ];
}

function wallEdges(
  origin: THREE.Vector3,
  across: THREE.Vector3,
  up: THREE.Vector3,
  subdivisions: number,
): [THREE.Vector3, THREE.Vector3][] {
  const edges: [THREE.Vector3, THREE.Vector3][] = [];
  const steps = Math.max(1, subdivisions);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const base = origin.clone().addScaledVector(across, t);
    edges.push([base, base.clone().add(up)]);
  }
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const base = origin.clone().addScaledVector(up, t);
    edges.push([base, base.clone().add(across)]);
  }
  return edges;
}

/**
 * Line segments drawing both walls. Subdivisions matter more than they look:
 * a bare outline gives the eye almost nothing to judge alignment by once
 * it's projected onto a real corner, whereas a grid makes any residual
 * skew obvious across the whole surface.
 */
export function roomCornerEdges(
  { width, height, depth }: RoomCornerDimensions,
  subdivisions: number,
): [THREE.Vector3, THREE.Vector3][] {
  const up = new THREE.Vector3(0, height, 0);
  const wallA = wallEdges(new THREE.Vector3(0, 0, 0), new THREE.Vector3(width, 0, 0), up, subdivisions);
  const wallB = wallEdges(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, depth), up, subdivisions);
  return [...wallA, ...wallB];
}

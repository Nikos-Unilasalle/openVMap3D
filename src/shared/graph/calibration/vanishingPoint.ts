import * as THREE from "three";

/**
 * Camera orientation + FOV from two vanishing points, traced live over the
 * viewport instead of a still photo — same math fSpy uses (Guillou,
 * Meneveaux, Maisel, Bouatouch, "Using Vanishing Points for Camera
 * Calibration and Coarse 3D Reconstruction from a Single Image"; ported
 * from fSpy's own solver.ts, github.com/stuffmatic/fSpy), just solved
 * continuously as the operator drags line endpoints rather than once from
 * a photo. No translation/position solving here on purpose — that needs a
 * real-world reference distance we don't have, and unlike rotation it's
 * forgiving enough to eyeball via the existing Location scrub fields.
 */
export interface Point2D {
  x: number;
  y: number;
}

export type LineSegment = [Point2D, Point2D];

function normalized(v: Point2D): Point2D {
  const length = Math.hypot(v.x, v.y);
  return length !== 0 ? { x: v.x / length, y: v.y / length } : { x: 0, y: 0 };
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const EPSILON = 1e-8;

/** Intersection of two (infinite) lines through the given segments — the vanishing point of a real-world direction, given two of its edges as seen in the image. */
export function lineIntersection(line1: LineSegment, line2: LineSegment): Point2D | null {
  if (distance(line1[0], line1[1]) < EPSILON || distance(line2[0], line2[1]) < EPSILON) return null;

  const [{ x: x1, y: y1 }, { x: x2, y: y2 }] = line1;
  const [{ x: x3, y: y3 }, { x: x4, y: y4 }] = line2;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < EPSILON) return null; // parallel on screen — no finite vanishing point

  return {
    x: ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator,
    y: ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator,
  };
}

/**
 * Screen pixels (origin top-left, +y down) -> fSpy's "ImagePlane" frame:
 * centered at 0, +y up, aspect-corrected so the SHORT side spans [-1, 1].
 * Everything downstream (focal length, rotation) is defined in this frame.
 */
export function toImagePlane(p: Point2D, width: number, height: number): Point2D {
  const rx = p.x / width;
  const ry = p.y / height;
  const aspect = width / height;
  return aspect <= 1
    ? { x: (-1 + 2 * rx) * aspect, y: 1 - 2 * ry }
    : { x: -1 + 2 * rx, y: (1 - 2 * ry) / aspect };
}

/** Relative focal length from two vanishing points and the principal point (image center in ImagePlane coords — always (0,0) here, no manual principal-point offset). Section 3.2 of the paper above. Null when the VP pair can't produce a valid (positive) focal length. */
export function computeFocalLength(Fu: Point2D, Fv: Point2D, principalPoint: Point2D): number | null {
  const dir = normalized({ x: Fu.x - Fv.x, y: Fu.y - Fv.y });
  const FvP = { x: principalPoint.x - Fv.x, y: principalPoint.y - Fv.y };
  const proj = dir.x * FvP.x + dir.y * FvP.y;
  const Puv = { x: proj * dir.x + Fv.x, y: proj * dir.y + Fv.y };

  const PPuv = distance(principalPoint, Puv);
  const FvPuv = distance(Fv, Puv);
  const FuPuv = distance(Fu, Puv);
  const fSquared = FvPuv * FuPuv - PPuv * PPuv;

  return fSquared > 0 ? Math.sqrt(fSquared) : null;
}

/** Section 3.3: the three orthonormal camera-space directions pointing at Fu, Fv, and their cross product. */
function cameraBasis(Fu: Point2D, Fv: Point2D, f: number, principalPoint: Point2D): THREE.Matrix4 {
  const towardFu = new THREE.Vector3(Fu.x - principalPoint.x, Fu.y - principalPoint.y, -f).normalize();
  const towardFv = new THREE.Vector3(Fv.x - principalPoint.x, Fv.y - principalPoint.y, -f).normalize();
  const third = towardFu.clone().cross(towardFv);
  return new THREE.Matrix4().makeBasis(towardFu, towardFv, third);
}

export interface TwoPointCalibration {
  /** The camera's own world-space orientation — feed straight into CAMERA_NODE's Rotation (as Euler) or apply directly as a quaternion. */
  quaternion: THREE.Quaternion;
  fovDegrees: number;
}

/**
 * Line set A's vanishing point maps to world Z, line set B's to world X —
 * an arbitrary but fixed convention (either physical wall could be "A"),
 * with world Y (up) derived automatically as their cross product, exactly
 * like fSpy derives its third axis. No separate vertical line needed.
 */
export function solveTwoPointCalibration(
  lineSetA: [LineSegment, LineSegment],
  lineSetB: [LineSegment, LineSegment],
  viewportWidth: number,
  viewportHeight: number,
): TwoPointCalibration | null {
  const toPlane = (p: Point2D) => toImagePlane(p, viewportWidth, viewportHeight);
  const toPlaneLine = (line: LineSegment): LineSegment => [toPlane(line[0]), toPlane(line[1])];

  const vpA = lineIntersection(toPlaneLine(lineSetA[0]), toPlaneLine(lineSetA[1]));
  const vpB = lineIntersection(toPlaneLine(lineSetB[0]), toPlaneLine(lineSetB[1]));
  if (!vpA || !vpB) return null;

  const principalPoint: Point2D = { x: 0, y: 0 };
  const f = computeFocalLength(vpA, vpB, principalPoint);
  if (f === null) return null;

  const rotation = cameraBasis(vpA, vpB, f, principalPoint);

  // fSpy's axis-assignment step: row1/row2 pick which world axis each VP
  // represents. Fixed here to -Z, -X (not +Z, +X — verified empirically via
  // a round-trip test against a known camera; the sign follows from how the
  // vanishing-point ray convention (z=-f, matching THREE's own "camera
  // looks down -Z") relates to "world direction a line runs along," which
  // isn't the same thing to eyeball from the formulas alone). Row3 is their
  // cross product, +Y since (-Z)×(-X)=+Y in a right-handed basis.
  // viewTransform = rotation * axisAssignment; cameraTransform = its inverse.
  const axisAssignment = new THREE.Matrix4().set(
    0, 0, -1, 0,
    -1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  );
  const viewTransform = rotation.clone().multiply(axisAssignment);
  const cameraTransform = viewTransform.clone().invert();

  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  cameraTransform.decompose(position, quaternion, scale);

  const aspectRatio = viewportWidth / viewportHeight;
  const verticalFovRadians = 2 * Math.atan(1 / (aspectRatio * f));

  return { quaternion, fovDegrees: THREE.MathUtils.radToDeg(verticalFovRadians) };
}

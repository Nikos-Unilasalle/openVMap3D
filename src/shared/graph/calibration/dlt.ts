import * as THREE from "three";
import {
  determinant3,
  invert3,
  jacobiEigenSymmetric,
  Mat,
  multiply,
  rq3,
  smallestEigenvector,
  transpose,
} from "./linalg";
import { Point2D } from "./types";

/**
 * Calibration by 3D<->2D point correspondence (the Direct Linear Transform),
 * which is what BIBLE.md's Calibration section actually describes and what
 * every projection-mapping tool does in practice: project reference geometry
 * live, let the operator drag each of its points onto the matching physical
 * feature, and solve the projector's full pose from the pairs.
 *
 * This replaces the vanishing-point approach for three concrete reasons found
 * on the real install:
 *   1. Two vanishing points recover rotation and focal length only — never
 *      *position*. The projector is somewhere specific in the room, so the
 *      scene landed nowhere near the physical space no matter how carefully
 *      the lines were traced.
 *   2. A projector's principal point is far off-centre (lens shift / throw
 *      offset — the image is thrown well above the lens axis). The
 *      vanishing-point formula assumes a centred principal point, so its
 *      model could not describe the actual hardware at all.
 *   3. A small projection area means near-parallel reference lines, so the
 *      vanishing points sit near infinity and the solve is wildly
 *      ill-conditioned — pixels of drag swinging the focal length by tens of
 *      percent.
 *
 * The DLT has none of those problems: it solves position, rotation, both
 * focal lengths and the principal point together, and its one degeneracy —
 * all reference points on a single plane — is precisely what a room *corner*
 * avoids by construction.
 */

const ONE = new THREE.Vector3(1, 1, 1);

/** Each unknown of the 3x4 projection matrix needs two equations; six points is the exact minimum. */
export const MIN_CORRESPONDENCES = 6;

/**
 * Ratio of out-of-plane spread to in-plane spread below which the point set
 * counts as flat. The DLT goes rank-deficient on coplanar points and returns
 * a confident-looking but meaningless camera, so this is refused up front.
 */
const COPLANARITY_RATIO = 0.01;

const NEAR_PLANE = 0.05;
const FAR_PLANE = 500;

export interface Correspondence {
  /** Where the point is in the real room, in metres. */
  world: THREE.Vector3;
  /** Where the operator dragged it in the projected image, in pixels, origin top-left, y down. */
  image: Point2D;
}

export interface ProjectorCalibration {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Focal lengths in pixels — separate x and y absorb non-square pixels and anamorphic lenses. */
  focalX: number;
  focalY: number;
  /** Principal point in pixels (origin top-left, y down). Far from the image centre on a real projector — this *is* the lens shift. */
  principalX: number;
  principalY: number;
  /** Axis skew. Physically ~0 on any real lens; kept because the solve produces it and dropping it would silently bias the other terms. */
  skew: number;
  /** RMS distance in pixels between where the operator put each point and where the solved projector puts it. The honest quality readout. */
  reprojectionError: number;
}

function centroidOf(points: { x: number; y: number; z?: number }[]): { x: number; y: number; z: number } {
  const sum = points.reduce(
    (acc: { x: number; y: number; z: number }, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + (p.z ?? 0) }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

/**
 * Hartley normalization — recentre on the centroid and scale so the mean
 * distance from it is sqrt(2) (2D) or sqrt(3) (3D). Without this the design
 * matrix mixes terms of wildly different magnitude (pixel coordinates in the
 * thousands against metres near 1) and the solve loses most of its precision.
 */
function normalize2D(points: Point2D[]): { matrix: Mat; normalized: Point2D[] } {
  const c = centroidOf(points);
  const meanDistance = points.reduce((acc, p) => acc + Math.hypot(p.x - c.x, p.y - c.y), 0) / points.length;
  const s = meanDistance === 0 ? 1 : Math.SQRT2 / meanDistance;
  return {
    matrix: [
      [s, 0, -s * c.x],
      [0, s, -s * c.y],
      [0, 0, 1],
    ],
    normalized: points.map((p) => ({ x: s * (p.x - c.x), y: s * (p.y - c.y) })),
  };
}

function normalize3D(points: THREE.Vector3[]): { matrix: Mat; normalized: THREE.Vector3[] } {
  const c = centroidOf(points);
  const meanDistance =
    points.reduce((acc, p) => acc + Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z), 0) / points.length;
  const s = meanDistance === 0 ? 1 : Math.sqrt(3) / meanDistance;
  return {
    matrix: [
      [s, 0, 0, -s * c.x],
      [0, s, 0, -s * c.y],
      [0, 0, s, -s * c.z],
      [0, 0, 0, 1],
    ],
    normalized: points.map((p) => new THREE.Vector3(s * (p.x - c.x), s * (p.y - c.y), s * (p.z - c.z))),
  };
}

/** True when the reference points all sit on (or very near) a single plane — the DLT's one hard degeneracy. */
export function isCoplanar(points: THREE.Vector3[]): boolean {
  const c = centroidOf(points);
  const covariance: Mat = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of points) {
    const d = [p.x - c.x, p.y - c.y, p.z - c.z];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) covariance[i][j] += d[i] * d[j];
    }
  }
  const { values } = jacobiEigenSymmetric(covariance);
  const sorted = [...values].sort((a, b) => a - b);
  const largest = sorted[2];
  if (largest <= 0) return true;
  // Eigenvalues are squared spreads, so compare their square roots.
  return Math.sqrt(sorted[0] / largest) < COPLANARITY_RATIO;
}

/** Solves the homogeneous system for the 3x4 projection matrix, in normalized coordinates. */
function solveProjectionMatrix(world: THREE.Vector3[], image: Point2D[]): Mat {
  const rows: number[][] = [];
  for (let i = 0; i < world.length; i++) {
    const { x: X, y: Y, z: Z } = world[i];
    const { x: u, y: v } = image[i];
    rows.push([X, Y, Z, 1, 0, 0, 0, 0, -u * X, -u * Y, -u * Z, -u]);
    rows.push([0, 0, 0, 0, X, Y, Z, 1, -v * X, -v * Y, -v * Z, -v]);
  }
  const p = smallestEigenvector(multiply(transpose(rows), rows));
  return [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12)];
}

/**
 * Splits the projection matrix into intrinsics (K) and pose, converting from
 * the computer-vision convention the DLT works in (+Z forward, image y down)
 * to three.js's (-Z forward, y up).
 */
function decompose(projection: Mat): ProjectorCalibration | null {
  const m: Mat = projection.map((row) => row.slice(0, 3));
  const translationColumn = projection.map((row) => row[3]);

  // The eigenvector's overall sign is arbitrary. det(M) = lambda^3 * det(K),
  // and det(K) > 0 for any real lens, so a negative determinant means the
  // solve came back with the wrong sign — flip the whole matrix. This also
  // guarantees RQ hands back a proper rotation with a positive diagonal.
  const flip = determinant3(m) < 0 ? -1 : 1;
  const signedM = m.map((row) => row.map((x) => x * flip));
  const signedT = translationColumn.map((x) => x * flip);

  const { r, q } = rq3(signedM);
  const lambda = r[2][2];
  if (!Number.isFinite(lambda) || Math.abs(lambda) < 1e-12) return null;

  const k: Mat = r.map((row) => row.map((x) => x / lambda));
  const kInverse = invert3(k);
  if (!kInverse) return null;

  // t is the world origin expressed in camera coordinates; the camera's own
  // position in the world is -R^T t.
  const scaledTranslation = signedT.map((x) => x / lambda);
  const t = kInverse.map((row) => row[0] * scaledTranslation[0] + row[1] * scaledTranslation[1] + row[2] * scaledTranslation[2]);
  const cameraCenter = transpose(q).map((row) => -(row[0] * t[0] + row[1] * t[1] + row[2] * t[2]));

  // q's rows are the CV camera axes in world space. three.js looks down -Z
  // with +Y up, so its y and z axes are the negated CV ones.
  const basis = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(q[0][0], q[0][1], q[0][2]),
    new THREE.Vector3(-q[1][0], -q[1][1], -q[1][2]),
    new THREE.Vector3(-q[2][0], -q[2][1], -q[2][2]),
  );

  return {
    position: new THREE.Vector3(cameraCenter[0], cameraCenter[1], cameraCenter[2]),
    quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
    focalX: k[0][0],
    focalY: k[1][1],
    principalX: k[0][2],
    principalY: k[1][2],
    skew: k[0][1],
    reprojectionError: 0,
  };
}

/**
 * Projects a world point through a solved calibration, back to pixels.
 * Used both to score the solve (reprojection error) and to draw the
 * reference geometry's handles where the operator expects them.
 * Returns null for anything behind the projector.
 */
export function projectWithCalibration(world: THREE.Vector3, calibration: ProjectorCalibration): Point2D | null {
  const view = new THREE.Matrix4().compose(calibration.position, calibration.quaternion, ONE).invert();
  const camera = world.clone().applyMatrix4(view);
  const depth = -camera.z;
  if (depth <= 1e-9) return null;
  return {
    x: (calibration.focalX * camera.x + calibration.skew * -camera.y) / depth + calibration.principalX,
    y: (-calibration.focalY * camera.y) / depth + calibration.principalY,
  };
}

function rmsReprojectionError(correspondences: Correspondence[], calibration: ProjectorCalibration): number {
  let total = 0;
  for (const { world, image } of correspondences) {
    const projected = projectWithCalibration(world, calibration);
    if (!projected) return Number.POSITIVE_INFINITY;
    total += (projected.x - image.x) ** 2 + (projected.y - image.y) ** 2;
  }
  return Math.sqrt(total / correspondences.length);
}

/**
 * The entry point: hand it at least six 3D<->2D pairs spread over more than
 * one plane and it returns the projector's full calibration, or null if the
 * configuration cannot support a solve.
 *
 * `width`/`height` are the output resolution the image coordinates were
 * measured in — they don't enter the solve itself (the DLT is scale-free in
 * pixels) but they define what the returned principal point is relative to.
 */
export function solveProjectorCalibration(
  correspondences: Correspondence[],
  _width: number,
  _height: number,
): ProjectorCalibration | null {
  if (correspondences.length < MIN_CORRESPONDENCES) return null;

  const worldPoints = correspondences.map((c) => c.world);
  const imagePoints = correspondences.map((c) => c.image);
  if (isCoplanar(worldPoints)) return null;

  const { matrix: imageTransform, normalized: normalizedImage } = normalize2D(imagePoints);
  const { matrix: worldTransform, normalized: normalizedWorld } = normalize3D(worldPoints);

  const normalizedProjection = solveProjectionMatrix(normalizedWorld, normalizedImage);

  const imageTransformInverse = invert3(imageTransform);
  if (!imageTransformInverse) return null;
  const projection = multiply(multiply(imageTransformInverse, normalizedProjection), worldTransform);

  const calibration = decompose(projection);
  if (!calibration) return null;

  const withError = { ...calibration, reprojectionError: rmsReprojectionError(correspondences, calibration) };
  return Number.isFinite(withError.reprojectionError) ? withError : null;
}

/**
 * The asymmetric frustum that makes three.js render exactly what the solved
 * projector sees. A plain PerspectiveCamera cannot express this: `fov` alone
 * forces the principal point to the image centre, which is the very
 * assumption a projector's lens shift breaks.
 *
 * Skew is dropped here — three.js has no way to express it, and on real
 * hardware it is a rounding error next to the focal lengths.
 */
export function projectionMatrixFromCalibration(
  calibration: ProjectorCalibration,
  width: number,
  height: number,
  near: number = NEAR_PLANE,
  far: number = FAR_PLANE,
): THREE.Matrix4 {
  const left = (-near * calibration.principalX) / calibration.focalX;
  const right = (near * (width - calibration.principalX)) / calibration.focalX;
  const top = (near * calibration.principalY) / calibration.focalY;
  const bottom = (-near * (height - calibration.principalY)) / calibration.focalY;
  return new THREE.Matrix4().makePerspective(left, right, top, bottom, near, far);
}

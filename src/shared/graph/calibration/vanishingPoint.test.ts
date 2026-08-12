import * as THREE from "three";
import { describe, expect, test } from "vitest";
import { LineSegment, computeFocalLength, lineIntersection, solveTwoPointCalibration } from "./vanishingPoint";

const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;

function buildCamera(fovDeg: number, rotation: THREE.Euler): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(fovDeg, VIEWPORT_WIDTH / VIEWPORT_HEIGHT, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.setRotationFromEuler(rotation);
  camera.updateMatrixWorld(true);
  return camera;
}

/** World point -> screen pixel coords (origin top-left, +y down) through a known camera — the inverse of what the solver has to recover. */
function projectToScreen(point: THREE.Vector3, camera: THREE.PerspectiveCamera): { x: number; y: number } {
  const ndc = point.clone().project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * VIEWPORT_WIDTH,
    y: (1 - (ndc.y * 0.5 + 0.5)) * VIEWPORT_HEIGHT,
  };
}

function projectLine(a: THREE.Vector3, b: THREE.Vector3, camera: THREE.PerspectiveCamera): LineSegment {
  return [projectToScreen(a, camera), projectToScreen(b, camera)];
}

describe("lineIntersection", () => {
  test("two crossing segments intersect where expected", () => {
    const p = lineIntersection(
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 0 }],
    );
    expect(p?.x).toBeCloseTo(5);
    expect(p?.y).toBeCloseTo(5);
  });

  test("parallel lines: no intersection, not a throw", () => {
    const p = lineIntersection(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 5 }, { x: 10, y: 5 }],
    );
    expect(p).toBeNull();
  });

  test("a degenerate (zero-length) segment: no intersection, not a throw", () => {
    const p = lineIntersection(
      [{ x: 3, y: 3 }, { x: 3, y: 3 }],
      [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    );
    expect(p).toBeNull();
  });
});

describe("computeFocalLength", () => {
  test("two vanishing points symmetric about the principal point give a valid, positive focal length", () => {
    const f = computeFocalLength({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -0.3 });
    expect(f).not.toBeNull();
    expect(f!).toBeGreaterThan(0);
  });

  test("a vanishing point pair with no valid solution returns null, not NaN", () => {
    // Principal point far off the FuFv line, directly "above" its
    // midpoint — too far out of plane for any positive focal length to
    // make both rays from P orthogonal.
    const f = computeFocalLength({ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 10 });
    expect(f).toBeNull();
  });
});

describe("solveTwoPointCalibration — round trip against a known camera", () => {
  test("recovers a known camera's rotation and vertical FOV from projected reference lines", () => {
    const trueFov = 55;
    const trueRotation = new THREE.Euler(-0.15, 0.4, 0);
    const camera = buildCamera(trueFov, trueRotation);

    // Two parallel lines along world Z (line set A), ceiling/floor-style — offset in Y, not X, so they can't
    // coincidentally land near-collinear on screen the way an X-symmetric offset can for particular rotations.
    const lineSetA: [LineSegment, LineSegment] = [
      projectLine(new THREE.Vector3(2, 1.5, -3), new THREE.Vector3(2, 1.5, -25), camera),
      projectLine(new THREE.Vector3(2, -1.5, -3), new THREE.Vector3(2, -1.5, -25), camera),
    ];
    // Two parallel lines along world X (line set B), also offset in Y.
    const lineSetB: [LineSegment, LineSegment] = [
      projectLine(new THREE.Vector3(-10, 1.5, -8), new THREE.Vector3(10, 1.5, -8), camera),
      projectLine(new THREE.Vector3(-10, -1.5, -8), new THREE.Vector3(10, -1.5, -8), camera),
    ];

    const result = solveTwoPointCalibration(lineSetA, lineSetB, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    expect(result).not.toBeNull();
    // Quaternion sign is ambiguous (q and -q are the same rotation) — compare via |dot|.
    const expectedQuat = new THREE.Quaternion().setFromEuler(trueRotation);
    expect(Math.abs(result!.quaternion.dot(expectedQuat))).toBeGreaterThan(0.999);
    expect(result!.fovDegrees).toBeCloseTo(trueFov, 0);
  });

  test("a near-straight-on camera round-trips too — not just a strongly oblique angle", () => {
    // Not exactly (0,0,0): a camera with *literally* zero rotation makes
    // world-X/world-Z reference lines project to perfectly horizontal/
    // vertical screen lines, which are parallel and have no finite
    // vanishing point — a genuine degeneracy of the method (real fSpy has
    // the same limitation), not something a solver can be expected to
    // handle. Any nonzero tilt, however small, is fine.
    const trueFov = 45;
    const trueRotation = new THREE.Euler(0.02, 0.03, 0);
    const camera = buildCamera(trueFov, trueRotation);

    const lineSetA: [LineSegment, LineSegment] = [
      projectLine(new THREE.Vector3(2, 1.5, -3), new THREE.Vector3(2, 1.5, -25), camera),
      projectLine(new THREE.Vector3(2, -1.5, -3), new THREE.Vector3(2, -1.5, -25), camera),
    ];
    const lineSetB: [LineSegment, LineSegment] = [
      projectLine(new THREE.Vector3(-10, 1, -8), new THREE.Vector3(10, 1, -8), camera),
      projectLine(new THREE.Vector3(-10, -1, -8), new THREE.Vector3(10, -1, -8), camera),
    ];

    const result = solveTwoPointCalibration(lineSetA, lineSetB, VIEWPORT_WIDTH, VIEWPORT_HEIGHT);

    expect(result).not.toBeNull();
    const expectedQuat = new THREE.Quaternion().setFromEuler(trueRotation);
    expect(Math.abs(result!.quaternion.dot(expectedQuat))).toBeGreaterThan(0.999);
    expect(result!.fovDegrees).toBeCloseTo(trueFov, 0);
  });

  test("degenerate input (parallel-on-screen lines) fails gracefully, not a throw", () => {
    const flatLine: LineSegment = [{ x: 0, y: 100 }, { x: 800, y: 100 }];
    const result = solveTwoPointCalibration(
      [flatLine, flatLine],
      [
        [{ x: 100, y: 0 }, { x: 100, y: 600 }],
        [{ x: 200, y: 0 }, { x: 200, y: 600 }],
      ],
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );
    expect(result).toBeNull();
  });
});

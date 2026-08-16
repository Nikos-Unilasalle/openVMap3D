import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { Correspondence, projectWithCalibration, solveProjectorCalibration } from "./dlt";

const ONE = new THREE.Vector3(1, 1, 1);

/** Ground-truth projector used by the round-trip tests: off to one side of a room corner, aimed back at it. */
function referenceProjector() {
  const position = new THREE.Vector3(2.1, 1.7, 2.6);
  const target = new THREE.Vector3(0.4, 1.1, 0.4);
  const lookAt = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0));
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(lookAt);
  return { position, quaternion };
}

/**
 * Forward model, written independently of the solver so the round-trip
 * actually tests something: world point -> camera space -> pixels, with
 * three.js's -Z-forward/Y-up convention and image y measured downward.
 */
function project(
  world: THREE.Vector3,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  focalX: number,
  focalY: number,
  principalX: number,
  principalY: number,
) {
  const view = new THREE.Matrix4().compose(position, quaternion, ONE).invert();
  const camera = world.clone().applyMatrix4(view);
  const depth = -camera.z;
  return { x: (focalX * camera.x) / depth + principalX, y: (-focalY * camera.y) / depth + principalY };
}

/**
 * A room corner: two perpendicular walls meeting at the origin, floor at
 * y=0. Deliberately non-coplanar — that is exactly the configuration the
 * DLT needs, and exactly what the user's physical install already provides.
 */
function roomCornerPoints(wallA = 2.4, wallB = 2.0, height = 2.5): THREE.Vector3[] {
  return [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, height, 0),
    new THREE.Vector3(wallA, 0, 0),
    new THREE.Vector3(wallA, height, 0),
    new THREE.Vector3(0, 0, wallB),
    new THREE.Vector3(0, height, wallB),
    new THREE.Vector3(wallA * 0.5, height * 0.5, 0),
    new THREE.Vector3(0, height * 0.5, wallB * 0.5),
  ];
}

function makeCorrespondences(
  focalX: number,
  focalY: number,
  principalX: number,
  principalY: number,
): Correspondence[] {
  const { position, quaternion } = referenceProjector();
  return roomCornerPoints().map((world) => ({
    world,
    image: project(world, position, quaternion, focalX, focalY, principalX, principalY),
  }));
}

describe("solveProjectorCalibration", () => {
  it("recovers the pose and intrinsics of a centred camera", () => {
    // Arrange
    const width = 1920;
    const height = 1080;
    const correspondences = makeCorrespondences(1500, 1500, width / 2, height / 2);
    const truth = referenceProjector();

    // Act
    const result = solveProjectorCalibration(correspondences, width, height);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.focalX).toBeCloseTo(1500, 3);
    expect(result!.focalY).toBeCloseTo(1500, 3);
    expect(result!.principalX).toBeCloseTo(width / 2, 3);
    expect(result!.principalY).toBeCloseTo(height / 2, 3);
    expect(result!.position.distanceTo(truth.position)).toBeLessThan(1e-6);
    // Quaternions are double-cover: q and -q are the same rotation.
    expect(Math.abs(result!.quaternion.dot(truth.quaternion))).toBeCloseTo(1, 8);
    expect(result!.reprojectionError).toBeLessThan(1e-6);
  });

  it("recovers a strong lens shift, which a centred-principal-point model cannot express", () => {
    // Arrange — a real projector throws its image well off the lens axis;
    // this is the case the vanishing-point method structurally could not
    // represent (it assumes the principal point sits at the image centre).
    const width = 1920;
    const height = 1080;
    const shiftedPrincipalY = height * 1.15;
    const correspondences = makeCorrespondences(1800, 1800, width * 0.5, shiftedPrincipalY);

    // Act
    const result = solveProjectorCalibration(correspondences, width, height);

    // Assert
    expect(result).not.toBeNull();
    expect(result!.principalY).toBeCloseTo(shiftedPrincipalY, 3);
    expect(result!.focalX).toBeCloseTo(1800, 3);
    expect(result!.reprojectionError).toBeLessThan(1e-6);
  });

  it("recovers non-square pixels (independent focal lengths)", () => {
    const width = 1280;
    const height = 800;
    const correspondences = makeCorrespondences(1400, 1250, 600, 900);
    const result = solveProjectorCalibration(correspondences, width, height);
    expect(result).not.toBeNull();
    expect(result!.focalX).toBeCloseTo(1400, 3);
    expect(result!.focalY).toBeCloseTo(1250, 3);
  });

  it("still solves from the minimum of six correspondences", () => {
    const width = 1920;
    const height = 1080;
    const correspondences = makeCorrespondences(1500, 1500, 960, 1200).slice(0, 6);
    const result = solveProjectorCalibration(correspondences, width, height);
    expect(result).not.toBeNull();
    expect(result!.reprojectionError).toBeLessThan(1e-5);
  });

  it("returns null with fewer than six correspondences", () => {
    const correspondences = makeCorrespondences(1500, 1500, 960, 540).slice(0, 5);
    expect(solveProjectorCalibration(correspondences, 1920, 1080)).toBeNull();
  });

  it("returns null when every image point is coincident (a 2D degeneracy)", () => {
    // The 3D points are fine (spread over two walls) but the operator has not
    // moved the handles: every image point sits at the same pixel. The DLT's
    // design matrix is then rank-deficient on the 2D side too — without this
    // guard it would hand back an arbitrary but confident-looking solve whose
    // reprojection error was small only because the fit lives in the collapsed
    // pixels. That must refuse, like the coplanar 3D case does.
    const base = makeCorrespondences(1500, 1500, 960, 540);
    const collapsed = base.map((c) => ({ ...c, image: { x: 960, y: 540 } }));
    expect(solveProjectorCalibration(collapsed, 1920, 1080)).toBeNull();
  });

  it("returns null when every reference point lies on one wall", () => {
    // Arrange — a single plane is the classic DLT degeneracy: the system
    // goes rank-deficient and the "solution" is meaningless. Catching it
    // here is what lets the UI say "spread your points across both walls"
    // instead of silently handing back a wrong camera.
    const { position, quaternion } = referenceProjector();
    const coplanar = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(2, 0, 0),
      new THREE.Vector3(0, 2, 0),
      new THREE.Vector3(2, 2, 0),
      new THREE.Vector3(1, 1, 0),
      new THREE.Vector3(1.5, 0.5, 0),
      new THREE.Vector3(0.5, 1.5, 0),
    ];
    const correspondences: Correspondence[] = coplanar.map((world) => ({
      world,
      image: project(world, position, quaternion, 1500, 1500, 960, 540),
    }));

    // Act / Assert
    expect(solveProjectorCalibration(correspondences, 1920, 1080)).toBeNull();
  });

  it("reports a non-zero reprojection error when the operator's picks are sloppy", () => {
    // Arrange — nudge one picked point by 4 px, as a hand-drag would
    const width = 1920;
    const height = 1080;
    const correspondences = makeCorrespondences(1500, 1500, 960, 1100);
    correspondences[2] = {
      ...correspondences[2],
      image: { x: correspondences[2].image.x + 4, y: correspondences[2].image.y - 3 },
    };

    // Act
    const result = solveProjectorCalibration(correspondences, width, height);

    // Assert — still solves, but honestly reports it is not exact
    expect(result).not.toBeNull();
    expect(result!.reprojectionError).toBeGreaterThan(0.1);
    expect(result!.reprojectionError).toBeLessThan(10);
  });
});

describe("projectWithCalibration", () => {
  it("round-trips a world point back to the pixel it came from", () => {
    // Arrange
    const width = 1920;
    const height = 1080;
    const correspondences = makeCorrespondences(1500, 1500, 960, 1200);
    const result = solveProjectorCalibration(correspondences, width, height)!;

    // Act / Assert
    for (const { world, image } of correspondences) {
      const projected = projectWithCalibration(world, result);
      expect(projected).not.toBeNull();
      expect(projected!.x).toBeCloseTo(image.x, 4);
      expect(projected!.y).toBeCloseTo(image.y, 4);
    }
  });

  it("returns null for a point behind the projector", () => {
    const correspondences = makeCorrespondences(1500, 1500, 960, 540);
    const result = solveProjectorCalibration(correspondences, 1920, 1080)!;
    const behind = result.position.clone().add(new THREE.Vector3(0, 0, 0).addScaledVector(
      new THREE.Vector3(0, 0, -1).applyQuaternion(result.quaternion),
      -5,
    ));
    expect(projectWithCalibration(behind, result)).toBeNull();
  });
});

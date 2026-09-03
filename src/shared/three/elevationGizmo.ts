import * as THREE from "three";

export interface ElevationHUD {
  group: THREE.Group;
  update: (targetObject: THREE.Object3D | null, isElevationView: boolean) => void;
  dispose: () => void;
}

/**
 * Snaps a continuous Y elevation coordinate to discrete steps (e.g. 0.5 or 1.0 units).
 */
export function snapElevationValue(val: number, step: number = 0.5): number {
  if (step <= 0) return val;
  const snapped = Math.round(val / step) * step;
  // Guard against -0 in floating point math
  return Object.is(snapped, -0) ? 0 : snapped;
}

/**
 * Creates the 3D Elevation HUD for the secondary Elevation Viewport:
 * - Outline on the selected object.
 * - Vertical line from ground (Y=0) to object elevation.
 * - Ground target circle.
 * - Elevation ticks along Y.
 */
export function createElevationHUD(): ElevationHUD {
  const group = new THREE.Group();
  group.name = "ElevationHUD";

  // 1. Vertical Laser Line (ground to object)
  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array([0, 0, 0, 0, 0, 0]);
  lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x00f3ff,
    linewidth: 2,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
  });
  const verticalLine = new THREE.Line(lineGeo, lineMat);
  verticalLine.renderOrder = 999;
  group.add(verticalLine);

  // 2. Ground Anchor Ring at Y=0 (fine neon ring)
  const ringGeo = new THREE.RingGeometry(0.29, 0.31, 64);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthTest: false,
  });
  const groundRing = new THREE.Mesh(ringGeo, ringMat);
  groundRing.renderOrder = 999;
  group.add(groundRing);

  // 3. Elevation Collar / Indicator Ring at Object Height (fine neon ring)
  const collarGeo = new THREE.RingGeometry(0.39, 0.41, 64);
  collarGeo.rotateX(-Math.PI / 2);
  const collarMat = new THREE.MeshBasicMaterial({
    color: 0xff0077,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const collarRing = new THREE.Mesh(collarGeo, collarMat);
  collarRing.renderOrder = 1000;
  group.add(collarRing);

  // 4. Selection Outline Box
  const boxGeo = new THREE.BufferGeometry();
  const boxMat = new THREE.LineBasicMaterial({
    color: 0x00f3ff,
    linewidth: 2,
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const outlineBox = new THREE.LineSegments(boxGeo, boxMat);
  outlineBox.renderOrder = 998;
  group.add(outlineBox);

  const worldPos = new THREE.Vector3();
  const box3 = new THREE.Box3();

  const update = (targetObject: THREE.Object3D | null, isElevationView: boolean) => {
    if (!targetObject || !isElevationView) {
      group.visible = false;
      return;
    }

    group.visible = true;
    targetObject.getWorldPosition(worldPos);

    const x = worldPos.x;
    const y = worldPos.y;
    const z = worldPos.z;

    // Update vertical line: from (x, 0, z) to (x, y, z)
    const posAttr = verticalLine.geometry.attributes.position as THREE.BufferAttribute;
    posAttr.setXYZ(0, x, 0, z);
    posAttr.setXYZ(1, x, y, z);
    posAttr.needsUpdate = true;

    // Ground ring position
    groundRing.position.set(x, 0.01, z);

    // Collar ring position at object altitude
    collarRing.position.set(x, y, z);

    // Compute bounding box outline
    box3.setFromObject(targetObject);
    if (!box3.isEmpty()) {
      outlineBox.visible = true;
      const min = box3.min;
      const max = box3.max;

      // 12 edges of the bounding box
      const corners = [
        min.x, min.y, min.z, max.x, min.y, min.z,
        max.x, min.y, min.z, max.x, max.y, min.z,
        max.x, max.y, min.z, min.x, max.y, min.z,
        min.x, max.y, min.z, min.x, min.y, min.z,

        min.x, min.y, max.z, max.x, min.y, max.z,
        max.x, min.y, max.z, max.x, max.y, max.z,
        max.x, max.y, max.z, min.x, max.y, max.z,
        min.x, max.y, max.z, min.x, min.y, max.z,

        min.x, min.y, min.z, min.x, min.y, max.z,
        max.x, min.y, min.z, max.x, min.y, max.z,
        max.x, max.y, min.z, max.x, max.y, max.z,
        min.x, max.y, min.z, min.x, max.y, max.z,
      ];
      outlineBox.geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
      outlineBox.geometry.computeBoundingSphere();
    } else {
      outlineBox.visible = false;
    }
  };

  const dispose = () => {
    lineGeo.dispose();
    lineMat.dispose();
    ringGeo.dispose();
    ringMat.dispose();
    collarGeo.dispose();
    collarMat.dispose();
    boxGeo.dispose();
    boxMat.dispose();
    group.clear();
  };

  return { group, update, dispose };
}

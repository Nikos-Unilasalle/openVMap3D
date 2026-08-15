import * as THREE from "three";

/**
 * The draggable control-point handles the viewport draws for a selected curve
 * (see curveLookup.ts for which node's points those are).
 *
 * Everything lives under one Group whose matrix is the *curve's* space — the
 * world matrix of the object that draws the curve. Handles are therefore
 * positioned with the raw, unmodified `pointsList` values, and a drag can be
 * read straight back out of `handle.position` with no manual conversion:
 * TransformControls already resolves its world-space math against the
 * parent's matrixWorld. Move the tube with the gizmo and the handles come
 * along, because they are children of the same transform.
 */

const HANDLE_RADIUS = 0.08;
const HANDLE_SEGMENTS = 12;
const HANDLE_COLOR = 0x84cc16;
const HANDLE_SELECTED_COLOR = 0x38bdf8;
/** Screen-space pick radius. A world-space one would be unclickable zoomed out and grab half the scene zoomed in. */
const PICK_RADIUS_PX = 12;
const HANDLE_RENDER_ORDER = 999;
const LINE_RENDER_ORDER = 998;

export interface CurvePointHandles {
  readonly group: THREE.Group;
  /** Rebuild or update the handles for `points`, expressed in the space of `spaceMatrix`. */
  sync(
    points: THREE.Vector3[],
    spaceMatrix: THREE.Matrix4,
    selectedIndices: Set<number> | number[] | number | null,
    frozenIndices: Set<number> | number[] | number | null,
    showLine?: boolean
  ): void;
  /** Remove and dispose every handle. */
  clear(): void;
  handleAt(index: number | null): THREE.Mesh | null;
  /** Returns the centroid anchor object when multiple points are selected. */
  getCentroidHandle(): THREE.Object3D | null;
  /** Index of the handle nearest the pointer within PICK_RADIUS_PX, or null. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera, widthPx: number, heightPx: number): number | null;
  /** All handle indices falling inside the screen-space marquee bounding box. */
  pickRect(
    rect: { minX: number; minY: number; maxX: number; maxY: number },
    camera: THREE.Camera,
    widthPx: number,
    heightPx: number
  ): number[];
  count(): number;
}

function disposeChild(child: THREE.Object3D) {
  if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  }
}

const EPSILON = 1e-6;

export function createCurvePointHandles(): CurvePointHandles {
  const spacePosition = new THREE.Vector3();
  const spaceQuaternion = new THREE.Quaternion();
  const spaceScale = new THREE.Vector3();
  const group = new THREE.Group();
  // Driven by the curve object's world matrix, never by position/quaternion/scale.
  group.matrixAutoUpdate = false;
  let handles: THREE.Mesh[] = [];
  let line: THREE.Line | null = null;

  // Invisible proxy anchor representing the centroid of selected control points
  const centroid = new THREE.Object3D();
  centroid.matrixAutoUpdate = false;
  centroid.userData.isCurveCentroidHandle = true;

  function clear() {
    for (const child of [...group.children]) {
      group.remove(child);
      disposeChild(child);
    }
    handles = [];
    line = null;
  }

  function build(count: number) {
    clear();
    for (let idx = 0; idx < count; idx++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(HANDLE_RADIUS, HANDLE_SEGMENTS, HANDLE_SEGMENTS),
        // depthTest off so a handle buried inside the tube it belongs to is
        // still visible and clickable.
        new THREE.MeshBasicMaterial({ color: HANDLE_COLOR, depthTest: false }),
      );
      mesh.renderOrder = HANDLE_RENDER_ORDER;
      mesh.userData.isCurvePointHandle = true;
      mesh.userData.pointIndex = idx;
      group.add(mesh);
      handles.push(mesh);
    }

    line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: HANDLE_COLOR, depthTest: false }),
    );
    line.renderOrder = LINE_RENDER_ORDER;
    group.add(line);
  }

  function toSet(val: Set<number> | number[] | number | null): Set<number> {
    if (val === null || val === undefined) return new Set();
    if (typeof val === "number") return new Set([val]);
    if (Array.isArray(val)) return new Set(val);
    return val;
  }

  return {
    group,

    sync(points, spaceMatrix, selectedIndices, frozenIndices, showLine = true) {
      if (points.length !== handles.length) build(points.length);

      const selectedSet = toSet(selectedIndices);
      const frozenSet = toSet(frozenIndices);

      // Handles are children of the curve's space, so a scaled object would
      // stretch them into ellipsoids (and a 0.1× one shrink them to
      // unclickable specks). Undo exactly that scale, per axis.
      spaceMatrix.decompose(spacePosition, spaceQuaternion, spaceScale);
      const counterScale = new THREE.Vector3(
        1 / (Math.abs(spaceScale.x) > EPSILON ? spaceScale.x : 1),
        1 / (Math.abs(spaceScale.y) > EPSILON ? spaceScale.y : 1),
        1 / (Math.abs(spaceScale.z) > EPSILON ? spaceScale.z : 1),
      );

      points.forEach((point, idx) => {
        const handle = handles[idx];
        if (!handle) return;
        // The handle being dragged owns its own position for the duration of
        // the drag — the graph is one frame behind it.
        if (!frozenSet.has(idx)) handle.position.copy(point);
        handle.scale.copy(counterScale);
        (handle.material as THREE.MeshBasicMaterial).color.setHex(
          selectedSet.has(idx) ? HANDLE_SELECTED_COLOR : HANDLE_COLOR,
        );
      });

      if (line) {
        line.visible = showLine !== false;
        if (line.visible) {
          line.geometry.setFromPoints(handles.map((h) => h.position));
        }
      }

      // Compute centroid position for all selected handles
      if (selectedSet.size > 0) {
        const sum = new THREE.Vector3();
        let count = 0;
        selectedSet.forEach((idx) => {
          if (handles[idx]) {
            sum.add(handles[idx].position);
            count++;
          }
        });
        if (count > 0) {
          sum.divideScalar(count);
          centroid.position.copy(sum);
          centroid.rotation.set(0, 0, 0);
          centroid.scale.set(1, 1, 1);
          centroid.updateMatrix();
        }
        if (selectedSet.size > 1 && centroid.parent !== group) {
          group.add(centroid);
        } else if (selectedSet.size <= 1 && centroid.parent === group) {
          group.remove(centroid);
        }
      } else if (centroid.parent === group) {
        group.remove(centroid);
      }

      group.matrix.copy(spaceMatrix);
      // Forced: nothing else recomputes matrixWorld for a group whose matrix
      // is assigned rather than derived, and TransformControls does all of its
      // drag math against the parent's world matrix.
      group.updateMatrixWorld(true);
    },

    clear,

    handleAt(index) {
      if (index === null) return null;
      return handles[index] ?? null;
    },

    getCentroidHandle() {
      return centroid;
    },

    pick(ndc, camera, widthPx, heightPx) {
      let bestIndex: number | null = null;
      let bestDistance = PICK_RADIUS_PX;
      const worldPosition = new THREE.Vector3();

      handles.forEach((handle, idx) => {
        handle.getWorldPosition(worldPosition).project(camera);
        if (worldPosition.z > 1) return; // behind the camera
        const dx = ((worldPosition.x - ndc.x) * widthPx) / 2;
        const dy = ((worldPosition.y - ndc.y) * heightPx) / 2;
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = idx;
        }
      });

      return bestIndex;
    },

    pickRect(rect, camera, widthPx, heightPx) {
      const minX = Math.min(rect.minX, rect.maxX);
      const maxX = Math.max(rect.minX, rect.maxX);
      const minY = Math.min(rect.minY, rect.maxY);
      const maxY = Math.max(rect.minY, rect.maxY);

      const worldPosition = new THREE.Vector3();
      const matches: number[] = [];

      handles.forEach((handle, idx) => {
        handle.getWorldPosition(worldPosition).project(camera);
        if (worldPosition.z > 1) return; // behind camera
        // Convert NDC (-1..1, 1..-1) to pixel coords (0..widthPx, 0..heightPx)
        const px = ((worldPosition.x + 1) * widthPx) / 2;
        const py = ((-worldPosition.y + 1) * heightPx) / 2;

        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
          matches.push(idx);
        }
      });

      return matches;
    },

    count() {
      return handles.length;
    },
  };
}

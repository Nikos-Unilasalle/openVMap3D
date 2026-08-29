import * as THREE from "three";

/**
 * The green face highlight for Face Selection editing (meshEdit.ts) — a
 * sub-mesh built from exactly the selected faces of the picked-on geometry,
 * drawn in the viewport's main scene so it depth-tests against the surface
 * it sits on (occluded faces stay hidden, unlike the point/curve handles in
 * the editor overlay scene).
 *
 * The source geometry is expanded to non-indexed triangles once per source
 * geometry (cached), and the per-selection sub-mesh is rebuilt only when the
 * selection actually changes — clicking a face re-builds a handful of
 * triangles, not the whole tube.
 */

const OVERLAY_COLOR = 0x22c55e; // green — the "selected" colour of the app's physics accent
const RENDER_ORDER = 998; // under the transform gizmo, above the geometry

export interface FaceSelectionHandles {
  /** Add to the viewport's main scene once; stays empty when not editing. */
  readonly group: THREE.Group;
  /** Rebuild/position the overlay for `mesh`'s local geometry under `mesh`'s world matrix. */
  sync(mesh: THREE.Mesh | null, selected: Set<number> | null): void;
  clear(): void;
  /** Number of faces currently drawn. */
  count(): number;
}

interface FlatSource {
  positions: Float32Array;
  faceCount: number;
}

/** Non-indexed (per-face) positions, cached per source geometry — a static tube isn't re-expanded on every click. */
const flatCache = new Map<string, FlatSource>();

function flatSourceOf(srcGeom: THREE.BufferGeometry): FlatSource | null {
  const posAttr = srcGeom.attributes.position;
  if (!posAttr) return null;
  const key = `${srcGeom.uuid}:${posAttr.count}:${srcGeom.index?.count ?? -1}`;
  const cached = flatCache.get(key);
  if (cached) return cached;
  const nonIndexed = srcGeom.index ? srcGeom.toNonIndexed() : srcGeom;
  const flatPos = nonIndexed.attributes.position as THREE.BufferAttribute;
  const entry: FlatSource = { positions: new Float32Array(flatPos.array as ArrayLike<number>), faceCount: flatPos.count / 3 };
  // A tiny bound so a graph that keeps rebuilding geometry doesn't leak here forever.
  if (flatCache.size > 64) flatCache.clear();
  flatCache.set(key, entry);
  return entry;
}

export function createFaceSelectionHandles(): FaceSelectionHandles {
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;

  let overlay: THREE.Mesh | null = null;
  let lastSourceKey = "";
  let lastSelectedKey = "";

  function disposeOverlay() {
    if (overlay) {
      group.remove(overlay);
      overlay.geometry.dispose();
      (overlay.material as THREE.Material).dispose();
      overlay = null;
    }
    lastSelectedKey = "";
  }

  function rebuild(source: FlatSource, selected: Set<number>) {
    disposeOverlay();
    const kept: number[] = [];
    for (let f = 0; f < source.faceCount; f++) if (selected.has(f)) kept.push(f);
    if (kept.length === 0) return;

    const positions = new Float32Array(kept.length * 9);
    let o = 0;
    for (const f of kept) {
      for (let c = 0; c < 3; c++) {
        positions[o++] = source.positions[f * 9 + c * 3];
        positions[o++] = source.positions[f * 9 + c * 3 + 1];
        positions[o++] = source.positions[f * 9 + c * 3 + 2];
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.MeshBasicMaterial({
      color: OVERLAY_COLOR,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      // Sit a hair above the copied surface instead of z-fighting it.
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    overlay = new THREE.Mesh(geometry, material);
    overlay.renderOrder = RENDER_ORDER;
    overlay.frustumCulled = false;
    overlay.matrixAutoUpdate = false;
    overlay.matrix.identity();
    group.add(overlay);
  }

  return {
    group,

    sync(mesh, selected) {
      if (!mesh || !selected || selected.size === 0) {
        disposeOverlay();
        lastSourceKey = "";
        return;
      }
      const srcGeom = mesh.geometry;
      const source = flatSourceOf(srcGeom);
      if (!source) {
        disposeOverlay();
        lastSourceKey = "";
        return;
      }

      const sourceKey = `${srcGeom.uuid}:${srcGeom.attributes.position.count}:${srcGeom.index?.count ?? -1}`;
      const selectedKey = `${selected.size}:${[...selected].sort((a, b) => a - b).join(",")}`;
      if (sourceKey !== lastSourceKey || selectedKey !== lastSelectedKey) {
        rebuild(source, selected);
        lastSourceKey = sourceKey;
        lastSelectedKey = selectedKey;
      }
      if (!overlay) return;
      group.matrix.copy(mesh.matrixWorld);
      group.updateMatrixWorld(true);
    },

    clear() {
      disposeOverlay();
      lastSourceKey = "";
    },

    count() {
      return overlay ? 1 : 0;
    },
  };
}

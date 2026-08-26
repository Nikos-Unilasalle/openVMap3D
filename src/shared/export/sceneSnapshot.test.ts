import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { captureAnimatedScene, captureObject3D, captureScene } from "./sceneSnapshot";

function decodeFloat32(base64: string): Float32Array {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

describe("captureObject3D", () => {
  it("captures a colored mesh's geometry and material", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3, metalness: 0.2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(1, 2, 3);

    const snap = captureObject3D(mesh)!;
    expect(snap.kind).toBe("mesh");
    expect(snap.material?.color).toBe(0xff0000);
    expect(snap.material?.roughness).toBeCloseTo(0.3);
    expect(snap.geometry?.attributes.position?.count).toBe(geometry.getAttribute("position").count);
    // Position (1,2,3) lands in the matrix's translation column (indices 12-14).
    expect(snap.matrix[12]).toBeCloseTo(1);
    expect(snap.matrix[13]).toBeCloseTo(2);
    expect(snap.matrix[14]).toBeCloseTo(3);
  });

  it("does not clobber a matrixAutoUpdate=false object's directly-written matrix (the pattern every primitive node in this app actually uses)", () => {
    // object.ts's Box/Sphere/Cone/... nodes never touch .position/.quaternion
    // (matrixAutoUpdate=false, .matrix written directly via
    // composeNativeMatrix) — those stay at their default identity values.
    // Calling the plain Object3D.updateMatrix() unconditionally recomputes
    // .matrix FROM those stale identity properties, silently resetting the
    // object back to the origin regardless of where it was actually placed.
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(new THREE.Matrix4().makeTranslation(10, 20, 30));

    const snap = captureObject3D(mesh)!;
    expect(snap.matrix[12]).toBeCloseTo(10);
    expect(snap.matrix[13]).toBeCloseTo(20);
    expect(snap.matrix[14]).toBeCloseTo(30);
  });

  it("preserves per-vertex color through the base64 round trip", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0]), 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 0, 0, 0, 1, 0]), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ vertexColors: true, size: 0.5 }));

    const snap = captureObject3D(points)!;
    expect(snap.kind).toBe("points");
    expect(snap.material?.vertexColors).toBe(true);
    expect(snap.material?.size).toBeCloseTo(0.5);

    const colorAttr = snap.geometry!.attributes.color!;
    const bytes = Uint8Array.from(atob(colorAttr.base64), (c) => c.charCodeAt(0));
    const floats = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    expect(Array.from(floats)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("captures lights by type, including a directional light's target", () => {
    const light = new THREE.DirectionalLight(0x00ff00, 2);
    light.target.position.set(5, 0, 0);
    // DirectionalLight's target is a separate Object3D not automatically
    // parented — updateMatrixWorld needs it in a tree to resolve a world
    // position, same as the real app parents it under the scene.
    const scene = new THREE.Scene();
    scene.add(light, light.target);
    scene.updateMatrixWorld(true);

    const snap = captureObject3D(light)!;
    expect(snap.kind).toBe("light");
    expect(snap.light?.kind).toBe("directional");
    expect(snap.light?.color).toBe(0x00ff00);
    expect(snap.light?.intensity).toBe(2);
    expect(snap.light?.targetPosition).toEqual([5, 0, 0]);
  });

  it("drops an empty bare Object3D/Group but keeps one with visible children", () => {
    const emptyGroup = new THREE.Group();
    expect(captureObject3D(emptyGroup)).toBeNull();

    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const snap = captureObject3D(group);
    expect(snap).not.toBeNull();
    expect(snap!.kind).toBe("group");
    expect(snap!.children.length).toBe(1);
  });

  it("captureScene wraps multiple scene roots under one synthetic top-level group", () => {
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const b = new THREE.Points(
      (() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
        return g;
      })(),
      new THREE.PointsMaterial(),
    );
    const snap = captureScene([a, b]);
    expect(snap.kind).toBe("group");
    expect(snap.children.map((c) => c.kind)).toEqual(["mesh", "points"]);
  });

  it("captures a LineSegments2 (Trail, Connectivity Lines, ...) with its actual segment shape, not empty geometry", () => {
    // Regression test: LineSegments2 stores its shape in "instanceStart"/
    // "instanceEnd" attributes (three's fat-line technique), not the plain
    // "position" attribute captureObject3D otherwise reads — captured
    // naively, a Trail exported as a "line" node with zero vertices, i.e.
    // nothing drawn at all.
    const geometry = new LineSegmentsGeometry();
    // Two independent segments: (0,0,0)-(1,0,0) and (2,0,0)-(3,0,0).
    geometry.setPositions([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
    const material = new LineMaterial({ color: 0x00ff00, linewidth: 3 });
    const trail = new LineSegments2(geometry, material);

    const snap = captureObject3D(trail)!;
    expect(snap.kind).toBe("linesegments");
    expect(snap.material?.color).toBe(0x00ff00);

    const position = decodeFloat32(snap.geometry!.attributes.position!.base64);
    expect(snap.geometry!.attributes.position!.count).toBe(4); // 2 segments * 2 endpoints
    expect(Array.from(position)).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]);
  });

  it("captures per-vertex color on a LineSegments2 through the instanceColorStart/End round trip", () => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions([0, 0, 0, 1, 0, 0]);
    geometry.setColors([1, 0, 0, 0, 0, 1]); // red start, blue end
    const material = new LineMaterial({ vertexColors: true });
    const trail = new LineSegments2(geometry, material);

    const snap = captureObject3D(trail)!;
    expect(snap.material?.vertexColors).toBe(true);
    const color = decodeFloat32(snap.geometry!.attributes.color!.base64);
    expect(Array.from(color)).toEqual([1, 0, 0, 0, 0, 1]);
  });

  it("respects instanceCount on an over-allocated LineSegments2 buffer (Capture Trails' own growth pattern)", () => {
    // Regression test: Capture Trails (particleTrails.ts) grows its buffer
    // in big steps ahead of need (ensureBucketCapacity) and caps what's
    // actually drawn via geometry.instanceCount, rather than resizing the
    // buffer to the exact segment count every frame. Reading the buffer's
    // full capacity instead of instanceCount pulled in thousands of unused,
    // zeroed slots — a pile of degenerate zero-length segments at the
    // origin on top of the real trail — which is exactly what made an
    // exported Trail look broken (or invisible, camera framing swamped by
    // that origin pile) even after the base LineSegments2 fix above.
    const capacity = 100;
    const geometry = new LineSegmentsGeometry();
    // Real data only in the first 2 segments; the rest of the pre-allocated
    // buffer is the zeroed Float32Array default.
    const positions = new Float32Array(capacity * 6);
    positions.set([0, 0, 0, 1, 0, 0, 5, 5, 5, 6, 5, 5]);
    geometry.setPositions(positions);
    geometry.instanceCount = 2; // only the first 2 segments are "real"

    const trail = new LineSegments2(geometry, new LineMaterial());
    const snap = captureObject3D(trail)!;

    expect(snap.geometry!.attributes.position!.count).toBe(4); // 2 segments * 2 endpoints, NOT capacity * 2
    const position = decodeFloat32(snap.geometry!.attributes.position!.base64);
    expect(Array.from(position)).toEqual([0, 0, 0, 1, 0, 0, 5, 5, 5, 6, 5, 5]);
  });

  it("captures plain THREE.LineSegments (wireframe helpers, room-corner lines) as disjoint segments, not a continuous polyline", () => {
    // LineSegments IS a Line subclass — a naive `instanceof THREE.Line`
    // check would misclassify it as a continuous polyline, drawing a
    // spurious connecting stroke between what should be separate segments.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 5, 5, 5, 6, 5, 5]), 3));
    const segments = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x123456 }));

    const snap = captureObject3D(segments)!;
    expect(snap.kind).toBe("linesegments");
    expect(snap.geometry!.attributes.position!.count).toBe(4);
  });

  it("still captures a plain THREE.Line as a continuous polyline", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial());

    const snap = captureObject3D(line)!;
    expect(snap.kind).toBe("line");
  });

  it("captures an InstancedMesh's per-instance matrices, not just its own single object matrix", () => {
    // Regression: Array/Spawner/Texture Pixel Spawner with GPU Instancing on
    // produce a THREE.InstancedMesh — a Mesh subclass, so it was silently
    // captured as an ordinary mesh (the single TEMPLATE geometry, no
    // per-instance transforms at all): the export showed one copy instead
    // of the whole instanced set.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ffff });
    const count = 3;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 2, 0, 0));
    }

    const snap = captureObject3D(mesh)!;
    expect(snap.kind).toBe("mesh");
    expect(snap.geometry!.instances).toBeDefined();
    expect(snap.geometry!.instances!.count).toBe(3);

    const matrices = decodeFloat32(snap.geometry!.instances!.matrices.base64);
    expect(matrices.length).toBe(3 * 16);
    // Instance 1's translation (matrix indices 12-14 within its own 16-float block).
    expect(matrices[16 + 12]).toBeCloseTo(2);
    expect(matrices[32 + 12]).toBeCloseTo(4);
  });

  it("captures per-instance color when present", () => {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 2);
    mesh.setColorAt(0, new THREE.Color(1, 0, 0));
    mesh.setColorAt(1, new THREE.Color(0, 1, 0));

    const snap = captureObject3D(mesh)!;
    const colors = decodeFloat32(snap.geometry!.instances!.colors!.base64);
    expect(Array.from(colors)).toEqual([1, 0, 0, 0, 1, 0]);
  });

  it("captures every material of a multi-material mesh, plus the geometry groups that pick between them", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.clearGroups();
    geometry.addGroup(0, 18, 0);
    geometry.addGroup(18, 18, 1);
    const materials = [new THREE.MeshStandardMaterial({ color: 0xff0000 }), new THREE.MeshStandardMaterial({ color: 0x0000ff })];
    const mesh = new THREE.Mesh(geometry, materials);

    const snap = captureObject3D(mesh)!;
    expect(snap.material?.color).toBe(0xff0000); // first material still populated for a simple fallback
    expect(snap.materials?.map((m) => m.color)).toEqual([0xff0000, 0x0000ff]);
    expect(snap.geometry!.groups).toEqual([
      { start: 0, count: 18, materialIndex: 0 },
      { start: 18, count: 18, materialIndex: 1 },
    ]);
  });

  it("does not set `materials` for an ordinary single-material mesh", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const snap = captureObject3D(mesh)!;
    expect(snap.materials).toBeUndefined();
    expect(snap.geometry!.groups).toBeUndefined();
  });
});

describe("captureAnimatedScene (particles)", () => {
  it("bakes per-frame position for a Points node whose geometry actually changes frame to frame", () => {
    // Simulates a particle system: the SAME cached Points instance (same
    // pattern every geometry-owning node in this app uses — see
    // appendAnimatedFrame's doc), with its position attribute rewritten in
    // place before each "frame" is read, exactly like a GPU sim's readback
    // would drive it. Without SnapshotFrame.position, particles would be
    // captured as a rigid-transform-only object and stay frozen at frame 0.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial());

    const positionsPerFrame = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];

    const snapshot = captureAnimatedScene(3, (frame) => {
      points.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positionsPerFrame[frame]), 3));
      return [points];
    });

    const node = snapshot.children[0];
    expect(node.kind).toBe("points");
    expect(node.frames!.length).toBe(3);
    const xs = node.frames!.map((f) => decodeFloat32(f.position!.base64)[0]);
    expect(xs).toEqual([0, 1, 2]);
  });

  it("does not bake per-frame position for a mesh (transform-only, as documented)", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());

    const snapshot = captureAnimatedScene(2, () => [mesh]);
    const node = snapshot.children[0];
    expect(node.kind).toBe("mesh");
    expect(node.frames!.every((f) => f.position === undefined)).toBe(true);
  });
});

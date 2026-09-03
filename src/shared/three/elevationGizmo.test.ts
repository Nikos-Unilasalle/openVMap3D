import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createElevationHUD, snapElevationValue } from "./elevationGizmo";

describe("elevationGizmo", () => {
  it("snaps elevation correctly to discrete step intervals", () => {
    expect(snapElevationValue(0.12, 0.5)).toBe(0);
    expect(snapElevationValue(0.28, 0.5)).toBe(0.5);
    expect(snapElevationValue(1.4, 0.5)).toBe(1.5);
    expect(snapElevationValue(2.8, 1.0)).toBe(3.0);
    expect(snapElevationValue(-0.7, 0.5)).toBe(-0.5);
    expect(snapElevationValue(3.14, 0)).toBe(3.14);
  });

  it("creates and updates the 3D elevation HUD", () => {
    const hud = createElevationHUD();
    expect(hud.group).toBeInstanceOf(THREE.Group);
    expect(hud.group.name).toBe("ElevationHUD");

    // Initially or when disabled
    hud.update(null, false);
    expect(hud.group.visible).toBe(false);

    // When target is provided and view is active
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.position.set(2, 4, -3);
    mesh.updateMatrixWorld();

    hud.update(mesh, true);
    expect(hud.group.visible).toBe(true);

    hud.dispose();
    expect(hud.group.children.length).toBe(0);
  });
});

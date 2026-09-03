import { describe, expect, it } from "vitest";
import { createStarterGraph, createStarterProject } from "./starterGraph";
import { CAMERA_NODE } from "./nodes/camera";
import { ENVIRONMENT_NODE } from "./nodes/environment";
import { RENDER_NODE } from "./nodes/render";

describe("starterGraph", () => {
  it("creates a 3D starter graph with camera, environment and render nodes", () => {
    const g = createStarterGraph("3d");
    expect(g.nodes.length).toBe(3);
    const camera = g.nodes.find((n) => n.type === CAMERA_NODE.type);
    const env = g.nodes.find((n) => n.type === ENVIRONMENT_NODE.type);
    const render = g.nodes.find((n) => n.type === RENDER_NODE.type);

    expect(camera).toBeDefined();
    expect(env).toBeDefined();
    expect(render).toBeDefined();

    expect(camera?.params.projectionType).toBe("perspective");

    const envConn = g.connections.find(
      (c) => c.fromNode === env?.id && c.toNode === render?.id && c.fromSocket === "environment"
    );
    expect(envConn).toBeDefined();
  });

  it("creates a 2D starter graph with orthographic top-down camera", () => {
    const g = createStarterGraph("2d");
    const camera = g.nodes.find((n) => n.type === CAMERA_NODE.type);
    expect(camera?.params.projectionType).toBe("orthographic");
    expect((camera?.params.location as any).y).toBe(15);
    expect((camera?.params.up as any).z).toBe(-1);
  });

  it("creates a starter project with first canvas populated", () => {
    const proj = createStarterProject();
    expect(proj.canvases.length).toBeGreaterThan(0);
    expect(proj.activeCanvas).toBe(0);
    expect(proj.canvases[0].nodes.length).toBe(3);
    expect(proj.canvases[1].nodes.length).toBe(0);
  });
});

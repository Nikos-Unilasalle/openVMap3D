import * as THREE from "three";
import { Graph, NodeInstance, Connection, CANVAS_COUNT, Project, emptyGraph } from "./types";
import { CAMERA_NODE } from "./nodes/camera";
import { ENVIRONMENT_NODE } from "./nodes/environment";
import { RENDER_NODE } from "./nodes/render";

/**
 * Builds the default production-ready starter graph for Tsuji.
 * Generates Camera, Environment, and Render nodes pre-wired and laid out cleanly.
 */
export function createStarterGraph(mode: "2d" | "3d" = "3d"): Graph {
  const is2D = mode === "2d";

  const cameraNode: NodeInstance = {
    id: "camera_1",
    type: CAMERA_NODE.type,
    position: { x: 80, y: 140 },
    params: {
      ...CAMERA_NODE.defaultParams,
      active: true,
      mode: "manual",
      projectionType: is2D ? "orthographic" : "perspective",
      location: is2D ? new THREE.Vector3(0, 15, 0) : new THREE.Vector3(0, 5, 12),
      rotation: is2D ? new THREE.Vector3(-Math.PI / 2, 0, 0) : new THREE.Vector3(-0.3, 0, 0),
      useTarget: true,
      target: new THREE.Vector3(0, 0, 0),
      up: is2D ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0),
      fov: 50,
    },
  };

  const envNode: NodeInstance = {
    id: "env_1",
    type: ENVIRONMENT_NODE.type,
    position: { x: 80, y: 340 },
    params: {
      ...ENVIRONMENT_NODE.defaultParams,
      color: new THREE.Color(0x1e2430),
      intensity: 1.0,
      background: 1,
    },
  };

  const renderNode: NodeInstance = {
    id: "render_1",
    type: RENDER_NODE.type,
    position: { x: 420, y: 220 },
    params: {
      ...RENDER_NODE.defaultParams,
      frameCount: 120,
      fps: 30,
      resolutionPreset: "16:9 (1920x1080)",
      width: 1920,
      height: 1080,
    },
  };

  const connections: Connection[] = [
    {
      id: "conn_env_render",
      fromNode: "env_1",
      fromSocket: "environment",
      toNode: "render_1",
      toSocket: "environment",
    },
  ];

  return {
    nodes: [cameraNode, envNode, renderNode],
    connections,
  };
}

/**
 * Builds a starter Project with Canvas 0 populated with Camera, Environment & Render.
 */
export function createStarterProject(mode: "2d" | "3d" = "3d"): Project {
  return {
    canvases: Array.from({ length: CANVAS_COUNT }, (_, i) =>
      i === 0 ? createStarterGraph(mode) : emptyGraph(),
    ),
    activeCanvas: 0,
  };
}

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ClockState, createClock, tickClock } from "../graph/clock";
import { evaluateGraph } from "../graph/evaluate";
import { CAMERA_NODE } from "../graph/nodes/camera";
import { Graph, NodeRegistry } from "../graph/types";
import "./viewport.css";

interface ViewportProps {
  graph: Graph;
  registry: NodeRegistry;
  /** Which node in the graph is the terminal `render` node whose output gets drawn. */
  renderNodeId: string;
  epochMs?: number;
  /**
   * True for the projector-facing output window: no dev HUD, no orientation
   * gizmo, no debug ground grid/axis arrows baked into the projected image
   * — just the rendered scene. Default false (the editor's own viewport).
   */
  outputMode?: boolean;
}

/** Create text canvas sprite for corner 3D axes labels ("X", "Y", "Z") */
function createTextSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 32, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.32, 0.32, 1);
  return sprite;
}

/** Build 3D Axes Triad Gizmo for Corner HUD */
function createGizmoScene(): { gizmoScene: THREE.Scene; gizmoCamera: THREE.PerspectiveCamera } {
  const gizmoScene = new THREE.Scene();
  const gizmoCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  gizmoCamera.position.set(0, 0, 3);
  gizmoCamera.lookAt(0, 0, 0);

  const axisLength = 1.0;
  const axes = [
    { dir: new THREE.Vector3(1, 0, 0), color: 0xf43f5e, hexColor: "#f43f5e", label: "X" },
    { dir: new THREE.Vector3(0, 1, 0), color: 0x22c55e, hexColor: "#22c55e", label: "Y" },
    { dir: new THREE.Vector3(0, 0, 1), color: 0x38bdf8, hexColor: "#38bdf8", label: "Z" },
  ];

  axes.forEach(({ dir, color, hexColor, label }) => {
    // Axis line
    const points = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(axisLength)];
    const geom = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color, linewidth: 3 });
    gizmoScene.add(new THREE.Line(geom, mat));

    // Label Sprite
    const sprite = createTextSprite(label, hexColor);
    sprite.position.copy(dir.clone().multiplyScalar(axisLength + 0.2));
    gizmoScene.add(sprite);
  });

  // Center origin dot
  const dotGeom = new THREE.SphereGeometry(0.08, 16, 16);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
  gizmoScene.add(new THREE.Mesh(dotGeom, dotMat));

  return { gizmoScene, gizmoCamera };
}

/** Build main 3D Scene Grid & Origin Axes Helper */
function buildMainSceneGridAndAxes(): THREE.Group {
  const group = new THREE.Group();

  // Ground Grid (XZ Plane)
  const gridHelper = new THREE.GridHelper(20, 20, 0x38bdf8, 0x1f2937);
  gridHelper.position.y = -0.001; // Avoid z-fighting with objects at y=0
  group.add(gridHelper);

  // 3D Axis Arrows at Origin
  const axisLength = 1.5;
  const headLength = 0.3;
  const headWidth = 0.12;

  const xAxis = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 0),
    axisLength,
    0xf43f5e,
    headLength,
    headWidth
  );
  const yAxis = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    axisLength,
    0x22c55e,
    headLength,
    headWidth
  );
  const zAxis = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, 0),
    axisLength,
    0x38bdf8,
    headLength,
    headWidth
  );

  group.add(xAxis);
  group.add(yAxis);
  group.add(zAxis);

  return group;
}

export function Viewport({ graph, registry, renderNodeId, epochMs, outputMode = false }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const renderNodeIdRef = useRef(renderNodeId);
  renderNodeIdRef.current = renderNodeId;
  const resetCameraRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!hostRef.current) return;
    const host: HTMLDivElement = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    // Grid & Origin Axes Helper — editor-only, never baked into the projected output
    if (!outputMode) {
      scene.add(buildMainSceneGridAndAxes());
    }

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    resetCameraRef.current = () => {
      camera.position.set(3, 3, 5);
      controls.target.set(0, 0, 0);
      controls.update();
    };

    // Gizmo Corner Scene & Camera — editor-only, never baked into the projected output
    const gizmo = outputMode ? null : createGizmoScene();

    function resize() {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let currentObject: THREE.Object3D | null = null;
    let clock: ClockState = createClock(epochMs ?? Date.now());
    let frameId = 0;

    // A copied-in projection matrix stays copied in until something rebuilds
    // it — switching the Camera node back to manual, or deleting it, would
    // otherwise leave the viewport stuck on the last solved frustum.
    let projectionOverridden = false;
    function restoreProjection() {
      if (!projectionOverridden) return;
      camera.updateProjectionMatrix();
      projectionOverridden = false;
    }

    function tick() {
      clock = tickClock(clock, Date.now());

      let results;
      try {
        results = evaluateGraph(graphRef.current, registryRef.current, {
          time: clock.time,
          step: clock.step,
          nodeId: "",
        });
      } catch (err) {
        console.error("graph evaluation failed", err);
        frameId = requestAnimationFrame(tick);
        return;
      }

      // Manual Alignment (BIBLE.md's Calibration section): a Camera node in
      // the graph drives this camera directly from its scrubbed Location/
      // Rotation/FOV params, instead of the default hardcoded pose — and
      // free orbit navigation is disabled while it does, since the whole
      // point is dialing in exact numbers against the real projector output,
      // not a mouse drag that would fight them every frame. No Camera node
      // in the graph -> behaves exactly as before (orbit, default pose).
      const cameraInstance = graphRef.current.nodes.find((n) => n.type === CAMERA_NODE.type);
      const cameraResult = cameraInstance ? results.get(cameraInstance.id) : undefined;
      const calibrationMatrix = cameraResult?.matrix instanceof THREE.Matrix4 ? cameraResult.matrix : null;

      if (calibrationMatrix) {
        controls.enabled = false;
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        calibrationMatrix.decompose(position, quaternion, scale);
        camera.position.copy(position);
        camera.quaternion.copy(quaternion);

        // A solved projector has an off-centre principal point (lens shift),
        // which `fov` structurally cannot express — it forces a symmetric
        // frustum. So when the Camera node hands back a full projection
        // matrix, it is copied in directly, overriding whatever
        // updateProjectionMatrix built from fov/aspect. The copy happens
        // every frame, which is also what keeps it winning over the resize
        // handler's own updateProjectionMatrix call.
        const projection = cameraResult?.projection;
        if (projection instanceof THREE.Matrix4) {
          camera.projectionMatrix.copy(projection);
          camera.projectionMatrixInverse.copy(projection).invert();
          projectionOverridden = true;
        } else {
          const fov = Number(cameraResult?.fov) || camera.fov;
          if (camera.fov !== fov) camera.fov = fov;
          restoreProjection();
        }
      } else {
        controls.enabled = true;
        controls.update();
        restoreProjection();
      }

      // Sync corner Gizmo camera orientation with main camera — derived from
      // the camera's own quaternion (not position-minus-controls.target,
      // which is only meaningful in orbit mode and would be stale while a
      // Camera node is driving the camera directly).
      if (gizmo) {
        const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        gizmo.gizmoCamera.position.copy(cameraForward).multiplyScalar(-3);
        gizmo.gizmoCamera.lookAt(0, 0, 0);
      }

      const output = results.get(renderNodeIdRef.current)?.geometry;
      const nextObject = output instanceof THREE.Object3D ? output : null;
      if (nextObject !== currentObject) {
        if (currentObject) scene.remove(currentObject);
        if (nextObject) scene.add(nextObject);
        currentObject = nextObject;
      }

      // 1. Render Main Scene
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setViewport(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.render(scene, camera);

      // 2. Render Corner 3D Orientation Gizmo HUD (110x110 px in bottom-left)
      if (gizmo) {
        const gizmoSize = 110;
        renderer.clearDepth();
        renderer.setScissorTest(true);
        renderer.setScissor(12, 12, gizmoSize, gizmoSize);
        renderer.setViewport(12, 12, gizmoSize, gizmoSize);
        renderer.render(gizmo.gizmoScene, gizmo.gizmoCamera);
        renderer.setScissorTest(false);
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [epochMs, outputMode]);

  return (
    <div className="viewport-container" ref={hostRef}>
      {/* Top-Left Viewport HUD & Controls — editor-only, never shown in the output window */}
      {!outputMode && (
        <div className="viewport-hud">
          <div className="viewport-hud-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            Viewport 3D
          </div>
          <div className="viewport-hud-legend">
            <span className="viewport-hud-axis viewport-hud-axis-x">X</span>
            <span className="viewport-hud-axis viewport-hud-axis-y">Y</span>
            <span className="viewport-hud-axis viewport-hud-axis-z">Z</span>
          </div>
          <button
            className="viewport-hud-button"
            onClick={() => resetCameraRef.current()}
            title="Réinitialiser la caméra 3D"
          >
            Reset Cam
          </button>
        </div>
      )}
    </div>
  );
}

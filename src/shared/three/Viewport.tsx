import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ClockState, createClock, tickClock } from "../graph/clock";
import { EvalResult, evaluateGraph } from "../graph/evaluate";
import { CAMERA_NODE } from "../graph/nodes/camera";
import { GizmoTarget, resolveGizmoTarget } from "../graph/transformLookup";
import { Graph, NodeRegistry } from "../graph/types";
import type { PreviewCameraPose } from "../ipc";
import "./viewport.css";

export type TransformGizmoMode = "translate" | "rotate" | "scale";

export interface TransformPatch {
  location: THREE.Vector3;
  rotation: THREE.Vector3;
  scale: THREE.Vector3;
}

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
  /** Drives which object shows a transform gizmo — shared with GraphEditor's own node selection (see App.tsx), so clicking an object here and clicking its node in the graph select the same thing. */
  selectedNodeId?: string | null;
  /** Fired on a click (not a drag) that hits a selectable mesh, or null on an empty-space click — mirrors GraphEditor's onSelectNode. Omit to disable click-to-select and the gizmo entirely. */
  onSelectNode?: (nodeId: string | null) => void;
  /** Fired continuously while dragging the gizmo, once the selected object's `matrix` input traces back to a plain Transform node (see transformLookup.ts) — nothing fires for an object with no such upstream node. */
  onTransformChange?: (transformNodeId: string, patch: TransformPatch) => void;
  /** Editor-only: fired on every orbit-camera change (and once on mount), so the output window can mirror the current view when there's no Camera node to lock onto instead — see the `previewCameraPose` prop below. */
  onCameraChange?: (pose: PreviewCameraPose) => void;
  /** Output-only: the editor's last-broadcast orbit pose. Applied only when there's no Camera node driving the camera (see the calibrationMatrix branch in tick()) — a Camera node's calibrated lock always wins. */
  previewCameraPose?: PreviewCameraPose | null;
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

export function Viewport({
  graph,
  registry,
  renderNodeId,
  epochMs,
  outputMode = false,
  selectedNodeId = null,
  onSelectNode,
  onTransformChange,
  onCameraChange,
  previewCameraPose = null,
}: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const renderNodeIdRef = useRef(renderNodeId);
  renderNodeIdRef.current = renderNodeId;
  const resetCameraRef = useRef<() => void>(() => {});
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onTransformChangeRef = useRef(onTransformChange);
  onTransformChangeRef.current = onTransformChange;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const previewCameraPoseRef = useRef(previewCameraPose);
  previewCameraPoseRef.current = previewCameraPose;
  const [transformMode, setTransformMode] = useState<TransformGizmoMode>("translate");
  const transformModeRef = useRef(transformMode);
  transformModeRef.current = transformMode;

  useEffect(() => {
    if (!hostRef.current) return;
    const host: HTMLDivElement = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // Motion-design preview sync (editor side): every orbit move, tell
    // whoever's listening (App.tsx) where the editor camera now is, so the
    // output window can mirror it when there's no Camera node to lock onto
    // instead. 'change' fires once per damping-settling frame while
    // orbiting, then stops — not a fixed-rate per-frame broadcast, just
    // "whenever the view actually moved." Fired once immediately too, so a
    // freshly-opened output window's handshake response already has a real
    // pose instead of nothing.
    function emitCameraPose() {
      onCameraChangeRef.current?.({
        position: [camera.position.x, camera.position.y, camera.position.z],
        quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
      });
    }
    if (!outputMode) {
      controls.addEventListener("change", emitCameraPose);
      emitCameraPose();
    }

    // Gizmo Corner Scene & Camera — editor-only, never baked into the projected output
    const gizmo = outputMode ? null : createGizmoScene();

    // Click-to-select + move/rotate/scale gizmo — editor-only, same reason
    // as everything else gated on outputMode: the output window shows the
    // projected content, not editing chrome. `attachedObjectNodeId` and
    // `attachedGizmoTarget` are plain closure variables, not refs —
    // nothing outside this effect needs to read them, they only pass
    // information from the per-frame attach/detach check below to the
    // 'objectChange' listener and to tick()'s liveEditNodeId computation.
    const raycaster = outputMode ? null : new THREE.Raycaster();
    const transformControls = outputMode ? null : new TransformControls(camera, renderer.domElement);
    let attachedObjectNodeId: string | null = null;
    let attachedGizmoTarget: GizmoTarget | null = null;
    // Refreshed every tick() — the 'objectChange' listener needs the
    // *current* base matrix for an "offset" target (see below), and this is
    // the cheapest way to get it without re-running evaluateGraph itself.
    let latestResults: EvalResult | null = null;

    if (transformControls) {
      scene.add(transformControls.getHelper());

      // The textbook three.js idiom: disable orbit for the whole gesture the
      // instant a gizmo handle is grabbed, synchronously within the same
      // pointerdown dispatch OrbitControls itself is listening to — by the
      // time OrbitControls would act on a subsequent pointermove, `enabled`
      // is already false. tick()'s own loop (below) is what keeps it false
      // for the rest of the drag, since this only fires on state *changes*.
      transformControls.addEventListener("dragging-changed", (event) => {
        controls.enabled = !event.value;
        if (!event.value) suppressNextClick = true;
      });

      transformControls.addEventListener("objectChange", () => {
        const object = transformControls.object;
        if (!object) return;

        // object.ts sets matrixAutoUpdate = false on every graph-driven mesh
        // (so it can hold an exact matrix.copy() from the graph), which also
        // means nothing recomputes .matrix from position/quaternion/scale
        // automatically. TransformControls mutates those three directly but
        // never calls this itself — without it the drag was inert on
        // screen: the mesh only ever snapped to its new pose once dragging
        // ended and evaluateGraph's own matrix.copy() ran again next frame.
        object.updateMatrix();

        if (!attachedGizmoTarget || !onTransformChangeRef.current) return;

        if (attachedGizmoTarget.kind === "absolute") {
          // A plain Transform node's location/rotation/scale directly
          // compose the object's final matrix — the gizmo's own dragged
          // world pose IS what belongs in its params.
          const euler = new THREE.Euler().setFromQuaternion(object.quaternion);
          onTransformChangeRef.current(attachedGizmoTarget.transformNodeId, {
            location: object.position.clone(),
            rotation: new THREE.Vector3(euler.x, euler.y, euler.z),
            scale: object.scale.clone(),
          });
          return;
        }

        // "offset" — a Matrix Transform node's location/rotation/scale are
        // a *local delta* on top of whatever its own `matrix` input
        // currently resolves to (final = base * delta, see
        // transform.ts's MATRIX_TRANSFORM_NODE). Writing the gizmo's
        // absolute world pose straight in would double-count that base —
        // solving `delta = inverse(base) * final` is what the offset
        // written back has to be instead. No base wired in -> identity,
        // matching MATRIX_TRANSFORM_NODE's own evaluate fallback.
        const baseResult = attachedGizmoTarget.baseSourceNodeId
          ? latestResults?.get(attachedGizmoTarget.baseSourceNodeId)?.matrix
          : undefined;
        const baseMatrix = baseResult instanceof THREE.Matrix4 ? baseResult : new THREE.Matrix4();
        const deltaMatrix = baseMatrix.clone().invert().multiply(object.matrix);

        const location = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        deltaMatrix.decompose(location, quaternion, scale);
        const euler = new THREE.Euler().setFromQuaternion(quaternion);
        onTransformChangeRef.current(attachedGizmoTarget.transformNodeId, {
          location,
          rotation: new THREE.Vector3(euler.x, euler.y, euler.z),
          scale,
        });
      });
    }

    // Click vs orbit-drag: a pointerup that moved less than this, and wasn't
    // the tail end of a gizmo drag (see suppressNextClick above), counts as
    // a selection click.
    const CLICK_MOVE_THRESHOLD_PX = 6;
    let pointerDownAt: { x: number; y: number } | null = null;
    let suppressNextClick = false;

    function onCanvasPointerDown(e: PointerEvent) {
      pointerDownAt = { x: e.clientX, y: e.clientY };
    }

    function onCanvasPointerUp(e: PointerEvent) {
      const down = pointerDownAt;
      pointerDownAt = null;
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (!down || !onSelectNodeRef.current || !raycaster) return;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_MOVE_THRESHOLD_PX) return;

      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster
        ? raycaster.intersectObjects(scene.children, true).find((i) => i.object.userData.nodeId)
        : undefined;
      onSelectNodeRef.current((hit?.object.userData.nodeId as string) ?? null);
    }

    if (!outputMode) {
      renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);
      renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);
    }

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
    const activeLights = new Map<string, THREE.Light>();
    const activeLightHelpers = new Map<string, THREE.Object3D>();
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

      // Suppress the graph-driven matrix overwrite for exactly the mesh the
      // gizmo is dragging this frame (see EvalContext.liveEditNodeId and
      // object.ts) — `transformControls.dragging` is set synchronously by
      // its own pointer handlers, so this is already current by the time
      // any given frame runs, no extra bookkeeping needed.
      const liveEditNodeId = transformControls?.dragging ? attachedObjectNodeId : null;

      let results;
      try {
        results = evaluateGraph(graphRef.current, registryRef.current, {
          time: clock.time,
          step: clock.step,
          nodeId: "",
          liveEditNodeId,
        });
      } catch (err) {
        console.error("graph evaluation failed", err);
        frameId = requestAnimationFrame(tick);
        return;
      }
      latestResults = results;

      // Evaluate and sync ALL 3D Lights & Light Helpers in the scene (standalone or array instances)
      const detectedLights = new Map<string, { light: THREE.Light; nodeId: string }>();
      for (const [nodeId, res] of results.entries()) {
        const obj = (res.light || res.geometry) as THREE.Object3D;
        if (obj instanceof THREE.Object3D) {
          obj.traverse((child) => {
            if (child instanceof THREE.Light) {
              const ownerId = child.userData.nodeId || nodeId;
              detectedLights.set(child.uuid, { light: child, nodeId: ownerId });
            }
          });
        }
      }

      const activeLightUUIDs = new Set<string>();
      for (const [uuid, { light, nodeId }] of detectedLights.entries()) {
        activeLightUUIDs.add(uuid);

        if (!activeLights.has(uuid)) {
          if (!light.parent) {
            scene.add(light);
          }
          activeLights.set(uuid, light);

          if (!outputMode) {
            let helper: THREE.Object3D | null = null;
            if (light instanceof THREE.DirectionalLight) {
              helper = new THREE.DirectionalLightHelper(light, 1, light.color);
            } else if (light instanceof THREE.PointLight) {
              helper = new THREE.PointLightHelper(light, 0.5, light.color);
            } else if (light instanceof THREE.SpotLight) {
              helper = new THREE.SpotLightHelper(light, light.color);
            }

            if (helper) {
              helper.userData.nodeId = nodeId;
              helper.traverse((c) => {
                c.userData.nodeId = nodeId;
              });
              scene.add(helper);
              activeLightHelpers.set(uuid, helper);
            }
          }
        }

        const helper = activeLightHelpers.get(uuid);
        if (helper) {
          if (typeof (helper as any).update === "function") {
            (helper as any).update();
          }
          if ((helper as any).color) {
            (helper as any).color.copy(light.color);
          }
        }
      }

      // Cleanup stale lights removed from graph
      for (const [uuid, light] of activeLights.entries()) {
        if (!activeLightUUIDs.has(uuid)) {
          if (light.parent === scene) {
            scene.remove(light);
          }
          activeLights.delete(uuid);
          const helper = activeLightHelpers.get(uuid);
          if (helper) {
            scene.remove(helper);
            activeLightHelpers.delete(uuid);
          }
        }
      }

      // A Camera node drives the camera directly from its Location/Rotation/
      // FOV (or its DLT solve) — but only in the *output* window. That is
      // the one view that has to show exactly what the real projector will
      // show, which orbit navigation would otherwise fight every frame. The
      // editor's own viewport stays freely orbitable regardless of a Camera
      // node's presence or mode, since it's for building/inspecting the
      // scene, not for judging alignment — that judgment only means
      // anything against the actual projected output (see OutputWindow).
      const cameraInstance = graphRef.current.nodes.find((n) => n.type === CAMERA_NODE.type);
      const cameraResult = cameraInstance ? results.get(cameraInstance.id) : undefined;
      const calibrationMatrix =
        outputMode && cameraResult?.matrix instanceof THREE.Matrix4 ? cameraResult.matrix : null;

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
      } else if (outputMode && previewCameraPoseRef.current) {
        // Motion design: no Camera node exists to lock onto, so mirror
        // whatever the editor's own orbit camera is currently looking at
        // instead of sitting on a fixed default angle nobody chose. Applied
        // directly rather than through OrbitControls (the output window
        // has no pointer interaction of its own to reconcile with).
        controls.enabled = false;
        const [px, py, pz] = previewCameraPoseRef.current.position;
        const [qx, qy, qz, qw] = previewCameraPoseRef.current.quaternion;
        camera.position.set(px, py, pz);
        camera.quaternion.set(qx, qy, qz, qw);
        restoreProjection();
      } else {
        // Don't stomp the gizmo's own disable — tick() runs every animation
        // frame regardless of pointer state, and would otherwise flip
        // `enabled` back to true mid-drag within one frame of the
        // 'dragging-changed' listener turning it off.
        if (!transformControls?.dragging) {
          controls.enabled = true;
          controls.update();
        }
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

      // Move/rotate/scale gizmo: attach to selected mesh or Light
      if (transformControls && !transformControls.dragging) {
        let targetObject: THREE.Object3D | null = null;
        if (selectedNodeIdRef.current) {
          if (currentObject) {
            currentObject.traverse((obj) => {
              if (!targetObject && obj.userData.nodeId === selectedNodeIdRef.current) targetObject = obj;
            });
          }
          if (!targetObject) {
            const light = activeLights.get(selectedNodeIdRef.current);
            if (light) targetObject = light;
          }
        }
        const gizmoTarget = targetObject ? resolveGizmoTarget(graphRef.current, selectedNodeIdRef.current!) : null;

        if (targetObject && gizmoTarget) {
          if (attachedObjectNodeId !== selectedNodeIdRef.current) {
            transformControls.attach(targetObject);
            attachedObjectNodeId = selectedNodeIdRef.current;
          }
          attachedGizmoTarget = gizmoTarget;
          transformControls.setMode(transformModeRef.current);
        } else if (attachedObjectNodeId !== null) {
          transformControls.detach();
          attachedObjectNodeId = null;
          attachedGizmoTarget = null;
        }
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
      if (!outputMode) {
        renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown);
        renderer.domElement.removeEventListener("pointerup", onCanvasPointerUp);
        controls.removeEventListener("change", emitCameraPose);
      }
      transformControls?.dispose();
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
          {onSelectNode && (
            <div className="viewport-hud-gizmo-modes">
              {(["translate", "rotate", "scale"] as const).map((mode) => (
                <button
                  key={mode}
                  className={
                    "viewport-hud-button" + (transformMode === mode ? " viewport-hud-button-active" : "")
                  }
                  onClick={() => setTransformMode(mode)}
                  title={`Gizmo: ${mode}`}
                >
                  {mode === "translate" ? "Move" : mode === "rotate" ? "Rotate" : "Scale"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

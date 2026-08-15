import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ClockState, createClock, tickClock } from "../graph/clock";
import { EvalResult, evaluateGraph } from "../graph/evaluate";
import { CAMERA_NODE } from "../graph/nodes/camera";
import { OBJECT_EMPTY_NODE } from "../graph/nodes/object";
import { asVector3 } from "../graph/nodes/transform";
import { resetAllParticleSimulations } from "../graph/particleRuntime";
import { resolveCurveEditTarget } from "../graph/curveLookup";
import { insertCurvePointAfter, removeCurvePoint } from "../graph/curvePoints";
import { GizmoTarget, resolveGizmoTarget } from "../graph/transformLookup";
import { createCurvePointHandles } from "./curveHandles";
import { createSceneMembership, isSelfOrDescendantOf } from "./sceneMembership";
import { createPostProcessChain } from "./postProcessChain";
import { computeGizmoWriteback, TransformGizmoMode, TransformPatch } from "./gizmoWriteback";

// Re-exported so call sites (App.tsx, SplitViewport) keep importing these
// from the component they belong to, not from its internals.
export type { TransformGizmoMode, TransformPatch };
import { createBackgroundBlur } from "./backgroundBlur";
import { applyEnvironment, resolveActiveEnvironment } from "./environmentSync";
import {
  buildMainSceneGridAndAxes,
  createGizmoScene,
  createViewportBackground,
  GIZMO_ACTIVE_COLOR,
  GIZMO_X_COLOR,
  GIZMO_Y_COLOR,
  GIZMO_Z_COLOR,
} from "./viewportScenery";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { createMotionBlur } from "./motionBlur";
import { PostProcessConfig } from "../graph/nodes/postprocessing";
import { Graph, NodeRegistry } from "../graph/types";
import type { PreviewCameraPose } from "../ipc";
import "./viewport.css";


/**
 * Partial on purpose: a gizmo drag writes only the channel it is actually
 * dragging, and only when that channel isn't driven by a wire — see the
 * `objectChange` handler for why writing all three corrupted hand-set values.
 */
/**
 * Membership key for the Render node's output (see sceneMembership.ts).
 * Every other key in that map is a node id; this one is deliberately not a
 * legal one, since the render output isn't owned by any single node — it's
 * whatever object the graph currently resolves to, and in the output window
 * it's a per-frame clone rather than the node's own object.
 */
const RENDER_OUTPUT_KEY = "__render_output__";


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
  /** Fired once when a gizmo drag begins — the parent records one undo step for the whole drag (see App.tsx). */
  onTransformStart?: () => void;
  /** Editor-only: fired on every orbit-camera change (and once on mount), so the output window can mirror the current view when there's no Camera node to lock onto instead — see the `previewCameraPose` prop below. */
  onCameraChange?: (pose: PreviewCameraPose) => void;
  /** Output-only: the editor's last-broadcast orbit pose. Applied only when there's no Camera node driving the camera (see the calibrationMatrix branch in tick()) — a Camera node's calibrated lock always wins. */
  previewCameraPose?: PreviewCameraPose | null;
  isSplitView?: boolean;
  onToggleSplitView?: () => void;
  currentFrame?: number;
  onEvaluatedResults?: (results: Map<string, Record<string, unknown>>) => void;
  isPlaying?: boolean;
}



export function Viewport({
  graph,
  registry,
  renderNodeId,
  epochMs = 0,
  outputMode = false,
  onSelectNode,
  selectedNodeId = null,
  onTransformChange,
  onTransformStart,
  onCameraChange,
  previewCameraPose = null,
  isSplitView = false,
  onToggleSplitView,
  currentFrame = -1,
  onEvaluatedResults,
  isPlaying = true,
}: ViewportProps) {
  const [showUiOverlay, setShowUiOverlay] = useState(true);
  const showUiOverlayRef = useRef(showUiOverlay);
  showUiOverlayRef.current = showUiOverlay;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;
  const onEvaluatedResultsRef = useRef(onEvaluatedResults);
  onEvaluatedResultsRef.current = onEvaluatedResults;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [showEnvInEditor, setShowEnvInEditor] = useState(false);
  const showEnvInEditorRef = useRef(showEnvInEditor);
  showEnvInEditorRef.current = showEnvInEditor;

  const onToggleSplitViewRef = useRef(onToggleSplitView);
  onToggleSplitViewRef.current = onToggleSplitView;
  const snapSelectedCameraToEditorRef = useRef<() => void>(() => {});
  const cameraGuideRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);
      if (isInput) return;

      if (e.key === "Tab" || e.code === "Tab") {
        e.preventDefault();
        if (e.shiftKey) {
          onToggleSplitViewRef.current?.();
        } else {
          setShowUiOverlay((prev) => !prev);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const renderNodeIdRef = useRef(renderNodeId);
  renderNodeIdRef.current = renderNodeId;
  const resetCameraRef = useRef<() => void>(() => {});
  const setAxisViewRef = useRef<(axis: "x" | "y" | "z", sign: 1 | -1) => void>(() => {});
  /** Which side each axis button last snapped to, so clicking it again flips to the opposite view (Left <-> Right, and so on). */
  const axisSideRef = useRef<Record<"x" | "y" | "z", 1 | -1>>({ x: -1, y: 1, z: 1 });
  const resetSimulationRef = useRef<() => void>(() => {});
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;
  const onTransformChangeRef = useRef(onTransformChange);
  onTransformChangeRef.current = onTransformChange;
  const onTransformStartRef = useRef(onTransformStart);
  onTransformStartRef.current = onTransformStart;
  const onCameraChangeRef = useRef(onCameraChange);
  onCameraChangeRef.current = onCameraChange;
  const previewCameraPoseRef = useRef(previewCameraPose);
  previewCameraPoseRef.current = previewCameraPose;
  const [transformMode, setTransformMode] = useState<TransformGizmoMode>("translate");
  const transformModeRef = useRef(transformMode);
  transformModeRef.current = transformMode;

  const [isOrthographic, setIsOrthographic] = useState(false);
  const isOrthographicRef = useRef(isOrthographic);
  isOrthographicRef.current = isOrthographic;
  const toggleCameraModeRef = useRef<(isOrtho: boolean) => void>(() => {});

  useEffect(() => {
    toggleCameraModeRef.current(isOrthographic);
  }, [isOrthographic]);

  useEffect(() => {
    if (!hostRef.current) return;
    const host: HTMLDivElement = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    const viewportBackground = createViewportBackground();
    const scene = new THREE.Scene();
    const bgScene = new THREE.Scene();
    bgScene.background = viewportBackground;
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    // Editor UI Overlay Scene — holds grid, transform controls, light helpers outside of main postprocess pipeline
    const editorUiScene = new THREE.Scene();

    // Grid & Origin Axes Helper — editor-only, never baked into the projected output
    if (!outputMode) {
      editorUiScene.add(buildMainSceneGridAndAxes());
    }

    const perspectiveCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    perspectiveCamera.position.set(3, 3, 5);
    perspectiveCamera.lookAt(0, 0, 0);

    const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    orthographicCamera.position.set(3, 3, 5);
    orthographicCamera.lookAt(0, 0, 0);

    let activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera = isOrthographic
      ? orthographicCamera
      : perspectiveCamera;
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = activeCamera;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, activeCamera);
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(outputPass);

    const controls = new OrbitControls(activeCamera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    toggleCameraModeRef.current = (isOrtho: boolean) => {
      const nextCam = isOrtho ? orthographicCamera : perspectiveCamera;
      const prevCam = isOrtho ? perspectiveCamera : orthographicCamera;

      nextCam.position.copy(prevCam.position);
      nextCam.quaternion.copy(prevCam.quaternion);
      nextCam.up.copy(prevCam.up);

      const { clientWidth, clientHeight } = host;
      const aspect = clientWidth && clientHeight ? clientWidth / clientHeight : 1;

      if (isOrtho) {
        const d = nextCam.position.distanceTo(controls.target) || 5;
        const fovRad = THREE.MathUtils.degToRad(perspectiveCamera.fov);
        const halfHeight = Math.tan(fovRad / 2) * d;
        const halfWidth = halfHeight * aspect;
        orthographicCamera.left = -halfWidth;
        orthographicCamera.right = halfWidth;
        orthographicCamera.top = halfHeight;
        orthographicCamera.bottom = -halfHeight;
        orthographicCamera.updateProjectionMatrix();
      } else {
        perspectiveCamera.aspect = aspect;
        perspectiveCamera.updateProjectionMatrix();
      }

      activeCamera = nextCam;
      camera = activeCamera;
      controls.object = camera;
      renderPass.camera = camera;
      if (transformControls) transformControls.camera = camera;
      controls.update();
    };

    resetCameraRef.current = () => {
      perspectiveCamera.position.set(3, 3, 5);
      perspectiveCamera.up.set(0, 1, 0);
      perspectiveCamera.lookAt(0, 0, 0);

      orthographicCamera.position.set(3, 3, 5);
      orthographicCamera.up.set(0, 1, 0);
      orthographicCamera.lookAt(0, 0, 0);

      controls.target.set(0, 0, 0);
      controls.update();
    };

    let isAxisSnapped = false;

    /**
     * Snaps to an axis-aligned view, the way Blender's numpad views work.
     * Keeps the current orbit target and distance, so it reframes what you
     * were already looking at instead of jumping back to the origin.
     */
    setAxisViewRef.current = (axis, sign) => {
      isAxisSnapped = true;
      const target = controls.target.clone();
      const distance = activeCamera.position.distanceTo(target) || 5;
      const direction = new THREE.Vector3(
        axis === "x" ? sign : 0,
        axis === "y" ? sign : 0,
        axis === "z" ? sign : 0,
      );
      const upVector = new THREE.Vector3(0, axis === "y" ? 0 : 1, axis === "y" ? -sign : 0);

      perspectiveCamera.up.copy(upVector);
      perspectiveCamera.position.copy(target).addScaledVector(direction, distance);
      perspectiveCamera.lookAt(target);

      orthographicCamera.up.copy(upVector);
      orthographicCamera.position.copy(target).addScaledVector(direction, distance);
      orthographicCamera.lookAt(target);

      setIsOrthographic(true);
      controls.update();
    };

    function emitCameraPose() {
      onCameraChangeRef.current?.({
        position: [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z],
        quaternion: [activeCamera.quaternion.x, activeCamera.quaternion.y, activeCamera.quaternion.z, activeCamera.quaternion.w],
      });
    }

    const handleOrbitStart = () => {
      if (isAxisSnapped) {
        isAxisSnapped = false;
        setIsOrthographic(false);
      }
    };

    if (!outputMode) {
      controls.addEventListener("start", handleOrbitStart);
      controls.addEventListener("change", emitCameraPose);
      emitCameraPose();
    }

    const gizmo = outputMode ? null : createGizmoScene();

    const raycaster = outputMode ? null : new THREE.Raycaster();
    const transformControls = outputMode ? null : new TransformControls(activeCamera, renderer.domElement);
    transformControls?.setColors(GIZMO_X_COLOR, GIZMO_Y_COLOR, GIZMO_Z_COLOR, GIZMO_ACTIVE_COLOR);
    let attachedObjectNodeId: string | null = null;
    let attachedGizmoTarget: GizmoTarget | null = null;

    // Curve control-point editing. `activeCurvePointIdx` is null until a
    // handle is actually clicked — the gizmo belongs to the selected object
    // until then, and goes back to it as soon as the click lands anywhere
    // else. `curvePointsNodeId` is the node the handles write into, which is
    // not necessarily the selected one (see curveLookup.ts).
    const curveHandles = createCurvePointHandles();
    let curvePointsNodeId: string | null = null;
    let activeCurvePointIdx: number | null = null;
    if (!outputMode) {
      editorUiScene.add(curveHandles.group);
    }
    // Refreshed every tick() — the 'objectChange' listener needs the
    // *current* base matrix for an "offset" target (see below), and this is
    // the cheapest way to get it without re-running evaluateGraph itself.
    let latestResults: EvalResult | null = null;

    // Hold Shift to snap the gizmo to fixed increments — 1 unit for
    // move/scale, 15° for rotate. Three's TransformControls has no built-in
    // modifier-key toggle; it just reads translationSnap/rotationSnap/
    // scaleSnap fresh on every pointermove (see its own source), so setting
    // them live on keydown/keyup is enough to make snapping track the key
    // in real time, including toggling mid-drag.
    const TRANSLATION_SNAP = 1;
    const ROTATION_SNAP = THREE.MathUtils.degToRad(15);
    const SCALE_SNAP = 1;

    // translationSnap is deliberately NEVER set on transformControls itself —
    // its world-space snap path calls object.getWorldPosition(), which goes
    // through updateWorldMatrix(). Every graph-driven mesh has
    // matrixAutoUpdate = false (see object.ts), which makes updateWorldMatrix
    // skip recomputing .matrix from the position TransformControls just set —
    // so it read back the *previous* frame's stale world position every time,
    // snapped that unchanging value, and wrote it straight back: the object
    // never appeared to move at all while translating with snap on. rotate's
    // snap (an internal angle accumulator) and scale's snap (mode='scale'
    // forces local space, a plain .scale round with no matrixWorld involved)
    // don't touch matrixWorld and so don't hit this — hence only translate
    // needed a workaround. Snapping translation ourselves, in objectChange
    // below, right before we call object.updateMatrix(), sidesteps the whole
    // stale-matrixWorld path: we round the position TransformControls *did*
    // just set correctly, not a stale re-derived one.
    let snapEnabled = false;

    function setSnapEnabled(enabled: boolean) {
      snapEnabled = enabled;
      if (!transformControls) return;
      transformControls.rotationSnap = enabled ? ROTATION_SNAP : null;
      transformControls.scaleSnap = enabled ? SCALE_SNAP : null;
    }

    function isInputElement(el: Element | null): boolean {
      if (!el) return false;
      const tagName = el.tagName.toLowerCase();
      return tagName === "input" || tagName === "textarea" || (el as HTMLElement).isContentEditable;
    }

    /**
     * Add or remove a control point on the curve whose handles are showing —
     * the only way to change how many points a curve has, since `pointsList`
     * has no param-panel field of its own. A no-op unless a handle is
     * actually picked, so A and D stay free for everything else.
     */
    function editPickedCurvePoint(operation: "insert" | "remove"): boolean {
      if (activeCurvePointIdx === null || !curvePointsNodeId) return false;
      const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
      if (!node || !onTransformChangeRef.current) return false;

      const index = activeCurvePointIdx;
      const nextPoints =
        operation === "insert"
          ? insertCurvePointAfter(node.params.pointsList, index)
          : removeCurvePoint(node.params.pointsList, index);
      // Null means the edit isn't legal — removing the last two points, say.
      if (!nextPoints) return false;

      // One discrete edit, one undo step (a drag records its own on start).
      onTransformStartRef.current?.();
      onTransformChangeRef.current(node.id, { pointsList: nextPoints });
      // Keep a point selected either way: the one just inserted, or the
      // neighbour that took the removed one's place.
      activeCurvePointIdx = operation === "insert" ? index + 1 : Math.min(index, nextPoints.length - 1);
      return true;
    }

    function onViewportKeyDown(e: KeyboardEvent) {
      if (isInputElement(document.activeElement)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toLowerCase();

      // Curve control point editing — checked before the gizmo/camera keys so
      // they only take over while a point is picked.
      if (key === "a" && editPickedCurvePoint("insert")) {
        e.preventDefault();
        return;
      }
      if (key === "d" && editPickedCurvePoint("remove")) {
        e.preventDefault();
        return;
      }

      // Gizmo mode shortcuts: T (translate), R (rotate), S (scale)
      if (key === "t") {
        e.preventDefault();
        setTransformMode("translate");
        if (transformControls) transformControls.setMode("translate");
      } else if (key === "r") {
        e.preventDefault();
        setTransformMode("rotate");
        if (transformControls) transformControls.setMode("rotate");
      } else if (key === "s") {
        e.preventDefault();
        setTransformMode("scale");
        if (transformControls) transformControls.setMode("scale");
      }
      // Camera axis snapping shortcuts: X (Right), Y (Top), Z (Front)
      else if (key === "x") {
        e.preventDefault();
        setAxisViewRef.current?.("x", 1);
      } else if (key === "y") {
        e.preventDefault();
        setAxisViewRef.current?.("y", 1);
      } else if (key === "z") {
        e.preventDefault();
        setAxisViewRef.current?.("z", 1);
      }
    }

    function onSnapKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") setSnapEnabled(true);
    }
    function onSnapKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") setSnapEnabled(false);
    }
    // Alt-tabbing away mid-drag fires no keyup for whatever was held — without
    // this, snapping could get stuck on until the next Shift press-and-release.
    function onSnapWindowBlur() {
      setSnapEnabled(false);
    }
    if (!outputMode) {
      window.addEventListener("keydown", onSnapKeyDown);
      window.addEventListener("keydown", onViewportKeyDown);
      window.addEventListener("keyup", onSnapKeyUp);
      window.addEventListener("blur", onSnapWindowBlur);
    }

    if (transformControls) {
      editorUiScene.add(transformControls.getHelper());

      // The textbook three.js idiom: disable orbit for the whole gesture the
      // instant a gizmo handle is grabbed, synchronously within the same
      // pointerdown dispatch OrbitControls itself is listening to — by the
      // time OrbitControls would act on a subsequent pointermove, `enabled`
      // is already false. tick()'s own loop (below) is what keeps it false
      // for the rest of the drag, since this only fires on state *changes*.
      transformControls.addEventListener("dragging-changed", (event) => {
        controls.enabled = !event.value;
        if (event.value) onTransformStartRef.current?.();
        if (!event.value) suppressNextClick = true;
      });

      transformControls.addEventListener("objectChange", () => {
        const object = transformControls.object;
        if (!object) return;

        // Manual translation snap — see the comment by TRANSLATION_SNAP's
        // declaration for why this can't just be transformControls'
        // own translationSnap. .position here is what TransformControls'
        // translate math just set correctly this frame (a plain local
        // assignment, no matrixWorld involved) — rounding it directly, before
        // updateMatrix() below, is what makes the *displayed* mesh snap, not
        // just whatever eventually gets written back to the graph.
        if (snapEnabled && transformModeRef.current === "translate") {
          object.position.set(
            Math.round(object.position.x / TRANSLATION_SNAP) * TRANSLATION_SNAP,
            Math.round(object.position.y / TRANSLATION_SNAP) * TRANSLATION_SNAP,
            Math.round(object.position.z / TRANSLATION_SNAP) * TRANSLATION_SNAP,
          );
        }

        // object.ts sets matrixAutoUpdate = false on every graph-driven mesh
        // (so it can hold an exact matrix.copy() from the graph), which also
        // means nothing recomputes .matrix from position/quaternion/scale
        // automatically. TransformControls mutates those three directly but
        // never calls this itself — without it the drag was inert on
        // screen: the mesh only ever snapped to its new pose once dragging
        // ended and evaluateGraph's own matrix.copy() ran again next frame.
        object.updateMatrix();

        // A curve control point, not an object: `object.position` is already
        // in the curve's own space (the handles' group carries the drawing
        // object's world matrix — see curveHandles.ts), which is exactly what
        // `pointsList` stores, so it goes back verbatim.
        if (object.userData?.isCurvePointHandle) {
          const pointIdx = object.userData.pointIndex as number;
          const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
          if (!node || !onTransformChangeRef.current) return;
          const rawList = Array.isArray(node.params.pointsList) ? [...node.params.pointsList] : [];
          if (pointIdx < 0 || pointIdx >= rawList.length) return;
          rawList[pointIdx] = object.position.clone();
          onTransformChangeRef.current(node.id, { pointsList: rawList });
          return;
        }

        if (!attachedGizmoTarget || !onTransformChangeRef.current) return;

        // Which node id actually owns the params a drag writes into — the
        // upstream Transform/MatrixTransform for "absolute"/"offset", or the
        // object itself for "native" (see transformLookup.ts).
        const targetNodeId =
          attachedGizmoTarget.kind === "native" ? attachedGizmoTarget.objectNodeId : attachedGizmoTarget.transformNodeId;

        // What sits upstream of the pose being solved for: the base an
        // "offset" delta is applied on top of, or the delta a "native" base
        // is composed with. Null when nothing is wired, which each node's own
        // evaluate treats as identity.
        const upstreamNodeId =
          attachedGizmoTarget.kind === "offset"
            ? attachedGizmoTarget.baseSourceNodeId
            : attachedGizmoTarget.kind === "native"
              ? attachedGizmoTarget.deltaSourceNodeId
              : null;
        const upstreamResult = upstreamNodeId ? latestResults?.get(upstreamNodeId)?.matrix : undefined;

        const patch = computeGizmoWriteback({
          target: attachedGizmoTarget,
          mode: transformModeRef.current,
          object,
          upstreamMatrix: upstreamResult instanceof THREE.Matrix4 ? upstreamResult : null,
          wiredSockets: new Set(
            graphRef.current.connections.filter((c) => c.toNode === targetNodeId).map((c) => c.toSocket),
          ),
        });

        if (Object.keys(patch).length > 0) {
          onTransformChangeRef.current(targetNodeId, patch);
        }
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
      raycaster.params.Line = { threshold: 0.3 };
      raycaster.params.Points = { threshold: 0.3 };

      // Curve control points win over whatever is behind them — a handle sits
      // on (or inside) the very mesh it shapes, so a raycast against the scene
      // would swallow every click meant for one. tick() does the actual gizmo
      // attach off this index, so it survives the next frame's re-evaluation.
      if (curveHandles.count() > 0) {
        const pickedIdx = curveHandles.pick(ndc, camera, rect.width, rect.height);
        if (pickedIdx !== null) {
          activeCurvePointIdx = pickedIdx;
          return;
        }
      }
      // Clicking anywhere else drops the point and hands the gizmo back to
      // the object.
      activeCurvePointIdx = null;

      const hit = raycaster
        ? raycaster.intersectObjects(scene.children, true).find((i) => {
            let curr: THREE.Object3D | null = i.object;
            while (curr) {
              if (curr.userData?.nodeId) return true;
              curr = curr.parent;
            }
            return false;
          })
        : undefined;

      let hitNodeId: string | null = null;
      if (hit) {
        let curr: THREE.Object3D | null = hit.object;
        while (curr) {
          if (curr.userData?.nodeId) {
            hitNodeId = curr.userData.nodeId;
            break;
          }
          curr = curr.parent;
        }
      }
      onSelectNodeRef.current(hitNodeId);
    }

    if (!outputMode) {
      renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown);
      renderer.domElement.addEventListener("pointerup", onCanvasPointerUp);
    }

    const motionBlurEffect = createMotionBlur(host.clientWidth || 1, host.clientHeight || 1);

    function resize() {
      const { clientWidth, clientHeight } = host;
      if (clientWidth === 0 || clientHeight === 0) return;
      const aspect = clientWidth / clientHeight;
      renderer.setSize(clientWidth, clientHeight);
      composer.setSize(clientWidth, clientHeight);
      motionBlurEffect.setSize(clientWidth, clientHeight);

      perspectiveCamera.aspect = aspect;
      perspectiveCamera.updateProjectionMatrix();

      const d = activeCamera.position.distanceTo(controls.target) || 5;
      const fovRad = THREE.MathUtils.degToRad(perspectiveCamera.fov);
      const halfHeight = Math.tan(fovRad / 2) * d;
      const halfWidth = halfHeight * aspect;
      orthographicCamera.left = -halfWidth;
      orthographicCamera.right = halfWidth;
      orthographicCamera.top = halfHeight;
      orthographicCamera.bottom = -halfHeight;
      orthographicCamera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let currentObject: THREE.Object3D | null = null;
    const activeLights = new Map<string, THREE.Light>();
    const activeLightHelpers = new Map<string, THREE.Object3D>();
    // Everything this viewport puts into a scene goes through one of these,
    // so nothing can be added without also being removable — see
    // sceneMembership.ts. `sceneContents` holds the render output plus any
    // standalone Empty anchors; `editorHelpers` holds the editor-only camera
    // helpers (never shown in the output window).
    const sceneContents = createSceneMembership(scene);
    const editorHelpers = createSceneMembership(editorUiScene);

    // A parking scene for gizmo targets that belong to no scene at all.
    //
    // TransformControls requires its attached object to be in a scene graph:
    // its pointerdown path calls `object.parent.updateMatrixWorld()` with no
    // null check, and its own updateMatrixWorld() logs "The attached 3D
    // object must be a part of the scene graph." A node whose geometry is
    // consumed by a *cloning* node (Array, Look At — see array.ts, which
    // clones its source rather than reparenting it) is exactly that case:
    // the clones are what get drawn, and the node's own object sits
    // parentless. Attaching to it gave a gizmo that drew but threw on the
    // first click, so it read as visible but dead.
    //
    // This scene is never rendered — it exists only to give such an object a
    // valid parent and a matrixWorld that tracks its matrix, without drawing
    // it a second time (which is the duplicate-render bug in the other
    // direction) and without touching `visible`, which the cloning nodes
    // copy onto their clones.
    const gizmoAnchorScene = new THREE.Scene();
    const postChain = createPostProcessChain({ renderer, composer, renderPass, outputPass, motionBlurEffect });

    const backgroundBlur = createBackgroundBlur(renderer);

    let clock: ClockState = createClock(epochMs ?? Date.now());
    let frameId = 0;

    // Restarts the deterministic clock at "now" and drops every cached GPU
    // particle simulation (see particleRuntime.ts) — the next tick()
    // rebuilds everything fresh from each node's *current* params, same as
    // a first load. Only rewinds time and runtime state, not graph edits —
    // matches "reset the animation," not "revert my changes."
    resetSimulationRef.current = () => {
      clock = createClock(Date.now());
      resetAllParticleSimulations();
    };

    snapSelectedCameraToEditorRef.current = () => {
      if (!selectedNodeIdRef.current || !onTransformChangeRef.current) return;
      const targetNode = graphRef.current.nodes.find((n) => n.id === selectedNodeIdRef.current);
      if (!targetNode || targetNode.type !== CAMERA_NODE.type) return;

      activeCamera.updateMatrixWorld(true);
      const mat = activeCamera.matrixWorld;
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mat.decompose(pos, quat, scale);

      const euler = new THREE.Euler().setFromQuaternion(quat, "YXZ");

      const location = new THREE.Vector3(
        Math.round(pos.x * 100) / 100,
        Math.round(pos.y * 100) / 100,
        Math.round(pos.z * 100) / 100,
      );
      const rotation = new THREE.Vector3(
        euler.x,
        euler.y,
        euler.z,
      );

      const fov = activeCamera instanceof THREE.PerspectiveCamera ? Math.round(activeCamera.fov) : undefined;

      const patch: Record<string, unknown> = { location, rotation };
      if (fov !== undefined) patch.fov = fov;

      onTransformChangeRef.current(selectedNodeIdRef.current, patch);
    };

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
      if (isPlayingRef.current) {
        clock = tickClock(clock, Date.now());
      } else {
        clock = { ...clock, step: 0 };
      }

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
          renderer,
          currentFrame: currentFrameRef.current,
          keyframes: graphRef.current.keyframes,
        });
      } catch (err) {
        console.error("graph evaluation failed", err);
        frameId = requestAnimationFrame(tick);
        return;
      }
      latestResults = results;
      onEvaluatedResultsRef.current?.(results);

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
          if ((light as THREE.DirectionalLight | THREE.SpotLight).target && !(light as THREE.DirectionalLight | THREE.SpotLight).target.parent) {
            scene.add((light as THREE.DirectionalLight | THREE.SpotLight).target);
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
              editorUiScene.add(helper);
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
          const targetObj = (light as THREE.DirectionalLight | THREE.SpotLight).target;
          if (targetObj && targetObj.parent === scene) {
            scene.remove(targetObj);
          }
          activeLights.delete(uuid);
          const helper = activeLightHelpers.get(uuid);
          if (helper) {
            editorUiScene.remove(helper);
            activeLightHelpers.delete(uuid);
          }
        }
      }

      // Sync Camera 3D Helpers in editorUiScene (editor view only). Routed
      // through editorHelpers so a camera node that's been deleted — or a
      // whole graph replaced by "New" — takes its helper with it; these used
      // to be added and never removed, leaving the last camera floating in
      // an otherwise empty scene.
      const activeCameraHelpers = new Map<string, THREE.Object3D>();
      for (const [nodeId, res] of results.entries()) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node?.type === CAMERA_NODE.type && res.geometry instanceof THREE.Object3D) {
          activeCameraHelpers.set(nodeId, res.geometry as THREE.Object3D);
        }
      }
      editorHelpers.sync(outputMode ? new Map() : activeCameraHelpers);

      // A Camera node drives the camera directly from its Location/Rotation/
      // FOV (or its DLT solve) — but only in the *output* window. That is
      // the one view that has to show exactly what the real projector will
      // show, which orbit navigation would otherwise fight every frame. The
      // editor's own viewport stays freely orbitable regardless of a Camera
      // node's presence or mode, since it's for building/inspecting the
      // scene, not for judging alignment — that judgment only means
      // anything against the actual projected output (see OutputWindow).
      const cameraNodes = graphRef.current.nodes.filter((n: { type: string; id: string }) => n.type === CAMERA_NODE.type);
      let activeCameraResult: Record<string, unknown> | undefined;
      for (const node of cameraNodes) {
        const res = results.get(node.id);
        if (res && res.active !== 0 && res.active !== false) {
          activeCameraResult = res;
          break;
        }
      }
      if (!activeCameraResult && cameraNodes.length > 0) {
        activeCameraResult = results.get(cameraNodes[0].id);
      }
      const cameraResult = activeCameraResult;
      if (cameraResult && typeof cameraResult.projectionType === "string") {
        const wantsOrtho = cameraResult.projectionType === "orthographic";
        if (wantsOrtho !== isOrthographicRef.current) {
          setIsOrthographic(wantsOrtho);
        }
      }
      const calibrationMatrix =
        outputMode && cameraResult?.matrix instanceof THREE.Matrix4 ? cameraResult.matrix as THREE.Matrix4 : null;

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
        } else if (camera instanceof THREE.PerspectiveCamera) {
          const fov = Number(cameraResult?.fov) || camera.fov;
          if (camera.fov !== fov) camera.fov = fov;
          restoreProjection();
        } else {
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

      // Strictly what the Render node resolves to — no "else grab whichever
      // node happened to produce geometry first" fallback. That fallback
      // made unwiring a node from Render look like it did nothing: the node
      // simply got re-picked as the scene output on the very next frame, so
      // its object stayed on screen (and, being an arbitrary pick over a
      // Map, which node won was down to evaluation order). No Render node,
      // or nothing wired into it, now means an empty view — the same thing
      // every other node-graph editor does, and the only reading that lets
      // the wire actually mean something.
      const output = results.get(renderNodeIdRef.current)?.geometry;
      const rawOutput = output instanceof THREE.Object3D ? output : null;

      if (outputMode) {
        // Split View's right pane (and the separate Output Window) run
        // their own tick() loop against the *same* graph, but every
        // object/instance/merge node hands back one THREE.Object3D cached
        // per node id at module scope (see nodeCaches.ts) — there is only
        // ever one such object for the whole process, not one per Viewport.
        // three.js gives an Object3D exactly one parent, so the instant a
        // second Viewport's scene.add() runs on it, it's silently ripped out
        // of whichever scene had it first. Before Split View existed only
        // one Viewport ever called scene.add() on these objects, so this
        // never fired; with two Viewports racing their own rAF loops, the
        // editor pane's own scene.add() this frame gets undone by the
        // output pane's scene.add() the next, leaving the editor empty
        // until `rawOutput`'s identity happens to change again.
        //
        // This pane has no TransformControls (outputMode skips that whole
        // block below) needing a *stable* object identity to attach to
        // across frames, so it's free to hold its own disposable clone
        // instead of fighting over the shared original. Object3D.clone(true)
        // deep-copies the hierarchy but shares geometry/material by
        // reference — cheap, and nothing GPU-owned needs disposing when the
        // old clone is dropped.
        currentObject = rawOutput?.clone(true) ?? null;
      } else {
        currentObject = rawOutput;
      }

      // One reconciliation for everything this viewport shows: the render
      // output, plus every Empty anchor.
      //
      // Empties exist unconditionally — they are the scene's reference
      // frames, not its content. Their whole job is to be positioned and
      // then drive other nodes through their Matrix output, so requiring a
      // path to Render before one is visible got the dependency backwards:
      // the anchor would vanish exactly when it was being used as an anchor.
      // The only case one is left out is when it is already inside the
      // rendered tree, where adding it again would tear it out of the group
      // that legitimately holds it (three.js allows a single parent).
      //
      // Every *other* unconnected node (a Box just dropped on the canvas, an
      // Array with nothing plugged in) still stays invisible until it's
      // actually wired up; sweeping in any orphaned THREE.Object3D was an
      // earlier bug here, and it's what let a stray downstream clone (Array
      // and Look At clone their input rather than reparenting it) render as
      // a duplicate.
      const desiredContents = new Map<string, THREE.Object3D>();
      if (currentObject) desiredContents.set(RENDER_OUTPUT_KEY, currentObject);
      for (const [nodeId, res] of results.entries()) {
        const node = graphRef.current.nodes.find((n) => n.id === nodeId);
        if (node?.type !== OBJECT_EMPTY_NODE.type) continue;
        if (!(res?.geometry instanceof THREE.Object3D)) continue;
        const geomObj = res.geometry as THREE.Object3D;
        if (currentObject && isSelfOrDescendantOf(geomObj, currentObject)) continue;
        desiredContents.set(nodeId, geomObj);
      }
      sceneContents.sync(desiredContents);

      // Curve control-point handles for the selected curve, drawn through the
      // world matrix of whatever object draws that curve so they track the
      // tube when it is moved, rotated or scaled.
      const curveTarget = outputMode ? null : resolveCurveEditTarget(graphRef.current, selectedNodeIdRef.current);
      const curveNode = curveTarget ? graphRef.current.nodes.find((n) => n.id === curveTarget.pointsNodeId) : undefined;
      const rawCurvePoints = Array.isArray(curveNode?.params.pointsList) ? curveNode.params.pointsList : [];
      const curvePoints = rawCurvePoints.map((p) => asVector3(p, new THREE.Vector3()));

      if (curveTarget && curveNode && curvePoints.length >= 2) {
        if (curvePointsNodeId !== curveNode.id) {
          curvePointsNodeId = curveNode.id;
          activeCurvePointIdx = null;
        }
        // An index past the end of the list is left alone rather than
        // cleared: adding a point selects it one frame before the graph state
        // carrying it arrives here. handleAt() returns null for an index with
        // no handle, so the gizmo simply sits out that frame.

        // The pose the curve is drawn at. `matrix.copy()` on a graph-driven
        // mesh never flags matrixWorld as stale (see the gizmo block below),
        // so it has to be recomputed rather than read.
        const spaceObject = results.get(curveTarget.spaceNodeId)?.geometry;
        const spaceMatrix = new THREE.Matrix4();
        if (spaceObject instanceof THREE.Object3D) {
          spaceObject.updateWorldMatrix(true, false);
          spaceMatrix.copy(spaceObject.matrixWorld);
        }

        const draggedIdx =
          transformControls?.dragging && transformControls.object?.userData?.isCurvePointHandle
            ? (transformControls.object.userData.pointIndex as number)
            : null;
        curveHandles.sync(curvePoints, spaceMatrix, activeCurvePointIdx, draggedIdx);
      } else if (curveHandles.count() > 0) {
        curveHandles.clear();
        curvePointsNodeId = null;
        activeCurvePointIdx = null;
      }

      // Move/rotate/scale gizmo: attach to selected mesh, Empty, or Light —
      // unless a curve control point is picked, which takes the gizmo for
      // itself (its own writeback path, no GizmoTarget involved).
      const pickedCurveHandle = transformControls ? curveHandles.handleAt(activeCurvePointIdx) : null;
      if (transformControls && !transformControls.dragging && pickedCurveHandle) {
        if (transformControls.object !== pickedCurveHandle) transformControls.attach(pickedCurveHandle);
        transformControls.setMode(transformModeRef.current);
        attachedObjectNodeId = null;
        attachedGizmoTarget = null;
        for (const parked of [...gizmoAnchorScene.children]) gizmoAnchorScene.remove(parked);
      } else if (transformControls && !transformControls.dragging) {
        let targetObject: THREE.Object3D | null = null;
        if (selectedNodeIdRef.current) {
          // The selected node's own result first — it is the authoritative
          // answer to "which object does this node drive", and the only one
          // that can't be a copy. The scene traversals below match on
          // `userData.nodeId`, which Object3D.clone() duplicates along with
          // everything else in userData: an Array's 16 copies of a Box, or a
          // Look At wrapper's clone of its input, each carry the *source*
          // node's id. Searching the scene first therefore latched the gizmo
          // onto whichever clone happened to be reached first, so dragging
          // moved a copy that the graph overwrote on the next frame while
          // the params were written back to a node whose real object never
          // moved. They stay as fallbacks for nodes with no geometry output
          // of their own (lights, camera helpers).
          const ownResult = results.get(selectedNodeIdRef.current);
          if (ownResult?.geometry instanceof THREE.Object3D) {
            targetObject = ownResult.geometry;
          }
          if (!targetObject) {
            const light = activeLights.get(selectedNodeIdRef.current);
            if (light) targetObject = light;
          }
          if (!targetObject) {
            const camHelper = activeCameraHelpers.get(selectedNodeIdRef.current);
            if (camHelper) targetObject = camHelper;
          }
          if (!targetObject) {
            scene.traverse((obj) => {
              if (!targetObject && obj.userData.nodeId === selectedNodeIdRef.current) targetObject = obj;
            });
          }
        }
        const gizmoTarget = targetObject ? resolveGizmoTarget(graphRef.current, selectedNodeIdRef.current!) : null;

        if (targetObject && gizmoTarget) {
          // Give a parentless target a home before attaching — see
          // gizmoAnchorScene's own comment for why TransformControls cannot
          // work with one that has no parent.
          if (!targetObject.parent) {
            gizmoAnchorScene.add(targetObject);
          }

          // Re-attach when the *object* changes too, not just the selection:
          // a node that rebuilds its mesh (Text on an edit, Line Graph on a
          // new point count) hands back a different instance under the same
          // node id, and the gizmo would otherwise stay bound to the
          // discarded one and appear to drag nothing.
          if (attachedObjectNodeId !== selectedNodeIdRef.current || transformControls.object !== targetObject) {
            transformControls.attach(targetObject);
            attachedObjectNodeId = selectedNodeIdRef.current;
          }
          attachedGizmoTarget = gizmoTarget;
          transformControls.setMode(transformModeRef.current);

          // object.ts drives these meshes by `matrix.copy(...)` with
          // matrixAutoUpdate off, which never touches position/quaternion/
          // scale — they sit at their defaults (origin, identity, 1) no
          // matter where the graph actually puts the object. TransformControls
          // reads exactly those on pointerdown (`_positionStart.copy(
          // object.position)`) and then sets `position = offset +
          // _positionStart`, so a drag started from the origin instead of the
          // object's real pose: the mesh snapped to its untransformed self
          // for the duration of the drag, then jumped back when the graph
          // reclaimed the matrix on release.
          //
          // Refreshed every frame rather than once at attach, so an object
          // being animated by the graph is still handed the pose it actually
          // has the moment a drag begins. This block only runs while the
          // gizmo is *not* dragging, so it can never fight the drag itself.
          if (!targetObject.matrixAutoUpdate) {
            targetObject.matrix.decompose(targetObject.position, targetObject.quaternion, targetObject.scale);
          }

          // Nothing traverses the parking scene during rendering, so its
          // contents' matrixWorld would otherwise stay at whatever it was
          // when the object was last drawn — or identity if it never was.
          // TransformControls does all of its drag math in world space, so a
          // stale one is what makes a drag come out wrong rather than
          // simply not start. (`matrix.copy()` never sets
          // matrixWorldNeedsUpdate, so this has to be forced.)
          if (targetObject.parent === gizmoAnchorScene) {
            gizmoAnchorScene.updateMatrixWorld(true);
          }
        } else if (transformControls.object) {
          // `transformControls.object` rather than attachedObjectNodeId: the
          // gizmo may currently be holding a curve point handle, which owns no
          // node id of its own.
          transformControls.detach();
          attachedObjectNodeId = null;
          attachedGizmoTarget = null;
        }

        // Release anything left parked once it is no longer the gizmo's
        // target — the parking scene should only ever hold the object being
        // edited right now. (An object that goes back to being drawn gets
        // reparented by scene.add() anyway; this just keeps the scene from
        // accumulating every object ever selected.)
        for (const parked of [...gizmoAnchorScene.children]) {
          if (parked !== targetObject) gizmoAnchorScene.remove(parked);
        }
      }

      // Sync Environment & HDRI / Background Color
      const renderResult = results.get(renderNodeIdRef.current);
      const activeEnv = resolveActiveEnvironment(results, renderNodeIdRef.current);
      const applyEnv = outputMode || showEnvInEditorRef.current;
      applyEnvironment(
        applyEnv ? activeEnv : null,
        { scene, bgScene, fallbackBackground: viewportBackground },
        backgroundBlur,
        host.clientWidth,
        host.clientHeight,
      );

      // Toggle helper visibility (AxesHelper / Empty crosshairs / Light target helpers)
      scene.traverse((obj) => {
        if (obj.userData?.isHelper || obj instanceof THREE.AxesHelper || obj instanceof THREE.CameraHelper) {
          obj.visible = !outputMode;
        }
      });

      // 1. Render Main Scene (with Post-Processing pipeline if active)
      const width = host.clientWidth;
      const height = host.clientHeight;

      let viewX = 0;
      let viewY = 0;
      let viewWidth = width;
      let viewHeight = height;

      const targetAspect = typeof renderResult?.aspect === "number" && renderResult.aspect > 0 ? (renderResult.aspect as number) : null;

      if (outputMode && targetAspect && targetAspect > 0) {
        const containerAspect = width / height;
        if (containerAspect > targetAspect) {
          viewHeight = height;
          viewWidth = height * targetAspect;
          viewX = (width - viewWidth) / 2;
        } else {
          viewWidth = width;
          viewHeight = width / targetAspect;
          viewY = (height - viewHeight) / 2;
        }
        if (camera instanceof THREE.PerspectiveCamera) {
          if (camera.aspect !== targetAspect) {
            camera.aspect = targetAspect;
            camera.updateProjectionMatrix();
          }
        }
      } else if (camera instanceof THREE.PerspectiveCamera && !projectionOverridden) {
        const aspect = width / height;
        if (camera.aspect !== aspect) {
          camera.aspect = aspect;
          camera.updateProjectionMatrix();
        }
      }

      // Passe-partout guide: the editor's own camera keeps this pane's live
      // aspect ratio (free orbit, unconstrained by any Camera node — see the
      // comment above the calibrationMatrix branch), but "Aligner Caméra"
      // captures only the vertical FOV, which reproduces the wrong framing
      // whenever the output's aspect (targetAspect) differs from this pane's.
      // Drawing the target-aspect crop as a guide, rather than actually
      // letterboxing the editor's render, lets you compose within the
      // correct bounds before hitting Align without losing free navigation.
      const guideEl = cameraGuideRef.current;
      if (guideEl) {
        const selectedIsCamera =
          !!selectedNodeIdRef.current &&
          graphRef.current.nodes.find((n) => n.id === selectedNodeIdRef.current)?.type === CAMERA_NODE.type;
        if (!outputMode && selectedIsCamera && targetAspect && targetAspect > 0) {
          const containerAspect = width / height;
          let guideWidth = width;
          let guideHeight = height;
          if (containerAspect > targetAspect) {
            guideHeight = height;
            guideWidth = height * targetAspect;
          } else {
            guideWidth = width;
            guideHeight = width / targetAspect;
          }
          guideEl.style.display = "block";
          guideEl.style.width = `${guideWidth}px`;
          guideEl.style.height = `${guideHeight}px`;
          guideEl.style.left = `${(width - guideWidth) / 2}px`;
          guideEl.style.top = `${(height - guideHeight) / 2}px`;
        } else {
          guideEl.style.display = "none";
        }
      }

      renderer.setViewport(viewX, viewY, viewWidth, viewHeight);
      renderer.setScissor(viewX, viewY, viewWidth, viewHeight);
      renderer.setScissorTest(outputMode && targetAspect !== null);

      const postConfigs = Array.isArray(renderResult?.postprocess)
        ? (renderResult.postprocess as PostProcessConfig[])
        : [];

      // Motion blur lives on the Render node itself rather than in the
      // postprocess chain (it's a property of the output, not an effect a
      // graph wires up), so it can switch the composer path on by itself
      // even with no postprocess node connected at all.
      const motionBlur = typeof renderResult?.motionBlur === "number" ? renderResult.motionBlur : 0;

      if (postChain.isActive(postConfigs, motionBlur)) {
        scene.background = bgScene.background;
        postChain.render({
          scene,
          camera,
          configs: postConfigs,
          motionBlur,
          width,
          height,
          outlineTarget: currentObject,
        });
      } else {
        // Nothing in the chain this frame — release the passes rather than
        // holding their render targets for a graph that no longer wants them.
        postChain.dispose();

        scene.fog = null;
        scene.background = bgScene.background;
        (scene as any).backgroundBlurriness = (bgScene as any).backgroundBlurriness ?? 0;
        renderer.clear();
        renderer.render(scene, camera);
      }

      // 1b. Render Editor UI Overlay (Grid, Transform Controls, Light Helpers) - isolated from Postprocess
      if (!outputMode && showUiOverlayRef.current) {
        renderer.clearDepth();
        renderer.render(editorUiScene, camera);
      }

      // 2. Render Corner 3D Orientation Gizmo HUD (110x110 px in bottom-left)
      if (gizmo && !outputMode && showUiOverlayRef.current) {
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
        controls.removeEventListener("start", handleOrbitStart);
        controls.removeEventListener("change", emitCameraPose);
        window.removeEventListener("keydown", onSnapKeyDown);
        window.removeEventListener("keydown", onViewportKeyDown);
        window.removeEventListener("keyup", onSnapKeyUp);
        window.removeEventListener("blur", onSnapWindowBlur);
      }
      transformControls?.dispose();
      curveHandles.clear();
      controls.dispose();
      // These objects are cached per node id at module scope and outlive
      // this viewport (see nodeCaches.ts) — hand them back rather than
      // leaving them parented to a scene that's about to be thrown away.
      sceneContents.clear();
      editorHelpers.clear();
      postChain.dispose();
      viewportBackground.dispose();
      motionBlurEffect.dispose();
      backgroundBlur.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [epochMs, outputMode]);

  return (
    <div className="viewport-container" ref={hostRef}>
      {/* Passe-partout guide: target-output-aspect crop, shown while a Camera
          node is selected so "Aligner Caméra" reproduces what's actually
          framed — see the comment in tick() next to cameraGuideRef. */}
      {!outputMode && <div className="viewport-camera-guide" ref={cameraGuideRef} />}
      {/* Top-Left Viewport HUD & Controls — editor-only, never shown in the output window */}
      {!outputMode && (
        <div className="viewport-hud">
          {selectedNodeId &&
            graph.nodes.find((n) => n.id === selectedNodeId)?.type === CAMERA_NODE.type && (
              <button
                type="button"
                className="viewport-hud-button viewport-hud-button-active"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#38bdf8",
                  backgroundColor: "rgba(56, 189, 248, 0.15)",
                  borderColor: "#38bdf8",
                }}
                onClick={() => snapSelectedCameraToEditorRef.current?.()}
                title="Align selected camera to 3D editor view"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
            )}
          <button
            type="button"
            className={`viewport-hud-button ${isOrthographic ? "viewport-hud-button-active" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: isOrthographic ? "#38bdf8" : "#cbd5e1",
            }}
            onClick={() => setIsOrthographic((prev) => !prev)}
            title={
              isOrthographic
                ? "Orthographic View (click to switch to Perspective)"
                : "Perspective View (click to switch to Orthographic)"
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isOrthographic ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M3 15h18M9 3v18M15 3v18" opacity="0.4" />
                </>
              ) : (
                <>
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </>
              )}
            </svg>
          </button>
          <button
            type="button"
            className={`viewport-hud-button ${showEnvInEditor ? "viewport-hud-button-active" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: showEnvInEditor ? "#38bdf8" : "#cbd5e1",
            }}
            onClick={() => setShowEnvInEditor((prev) => !prev)}
            title="Toggle Environment (HDRI / Background)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </button>
          <div className="viewport-hud-legend">
            {(
              [
                { axis: "x", label: "X", views: ["Right", "Left"] },
                { axis: "y", label: "Y", views: ["Top", "Bottom"] },
                { axis: "z", label: "Z", views: ["Front", "Back"] },
              ] as const
            ).map(({ axis, label, views }) => (
              <button
                key={axis}
                type="button"
                className={`viewport-hud-axis viewport-hud-axis-${axis}`}
                title={`View ${views[0]} / ${views[1]} (click to toggle)`}
                onClick={() => {
                  const sign = axisSideRef.current[axis];
                  setAxisViewRef.current(axis, sign);
                  axisSideRef.current[axis] = (sign === 1 ? -1 : 1) as 1 | -1;
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="viewport-hud-button"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => resetCameraRef.current()}
            title="Reset 3D Camera view"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          {onToggleSplitView && (
            <button
              type="button"
              className={`viewport-hud-button ${isSplitView ? "viewport-hud-button-active" : ""}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: isSplitView ? "#38bdf8" : "#cbd5e1",
              }}
              onClick={onToggleSplitView}
              title={isSplitView ? "Close Split View (Shift+Tab)" : "Open Split View (Shift+Tab)"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </button>
          )}
          {onSelectNode && (
            <div className="viewport-hud-gizmo-modes">
              {(["translate", "rotate", "scale"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={
                    "viewport-hud-button" + (transformMode === mode ? " viewport-hud-button-active" : "")
                  }
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  onClick={() => setTransformMode(mode)}
                  title={
                    mode === "translate"
                      ? "Gizmo: Translate (W)"
                      : mode === "rotate"
                      ? "Gizmo: Rotate (E)"
                      : "Gizmo: Scale (R)"
                  }
                >
                  {mode === "translate" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="5 9 2 12 5 15" />
                      <polyline points="9 5 12 2 15 5" />
                      <polyline points="15 19 12 22 9 19" />
                      <polyline points="19 9 22 12 19 15" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <line x1="12" y1="2" x2="12" y2="22" />
                    </svg>
                  ) : mode === "rotate" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.5 2v6h-6" />
                      <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

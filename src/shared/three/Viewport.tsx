import { MutableRefObject, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ClockState, createClock, STEP_SECONDS, tickClock } from "../graph/clock";
import { EvalResult, evaluateGraph } from "../graph/evaluate";
import { CAMERA_FLY_TO_NODE, CAMERA_NODE } from "../graph/nodes/camera";
import { asVector3 } from "../graph/nodes/transform";
import { resetAllParticleSimulations } from "../graph/particleRuntime";
import { resolveCurveEditTarget } from "../graph/curveLookup";
import { resolveSceneRoots } from "../graph/sceneRoots";
import { insertCurvePointAfter, removeCurvePoint } from "../graph/curvePoints";
import { GizmoTarget, resolveGizmoTarget } from "../graph/transformLookup";
import { createCurvePointHandles } from "./curveHandles";
import { createSceneMembership, isSelfOrDescendantOf } from "./sceneMembership";
import {
  LATTICE_DEFORM_NODE,
  latticeBasePointForTarget,
  latticeEvaluatedPoints,
} from "../graph/nodes/lattice";
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


interface ViewportProps {
  graph: Graph;
  registry: NodeRegistry;
  /**
   * Which node in the graph is the `render` node. Not a gate on what gets
   * drawn any more (see sceneRoots.ts) — it supplies the output settings,
   * the environment and the post-process chain, and its own subtree is what
   * the outline pass and the passe-partout guide treat as "the output".
   */
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
  /**
   * Populated (by this component, into the ref the caller passed in) once
   * the render loop is up — see videoExport.ts. `captureFrame` forces the
   * *next* tick() to use `frameIndex/fps` for both the deterministic clock
   * (so Time-node/oscillator/particle output matches that instant rather
   * than real elapsed time) and keyframe evaluation, in place of whatever
   * live playback would have used that frame, then resolves once that
   * frame has been drawn.
   */
  exportHandleRef?: MutableRefObject<ViewportExportHandle | null>;
}

export interface ViewportExportHandle {
  getCanvas: () => HTMLCanvasElement | null;
  captureFrame: (frameIndex: number, fps: number) => Promise<void>;
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
  exportHandleRef,
}: ViewportProps) {
  const [showUiOverlay, setShowUiOverlay] = useState(true);
  const showUiOverlayRef = useRef(showUiOverlay);
  showUiOverlayRef.current = showUiOverlay;

  const currentFrameRef = useRef(currentFrame);
  currentFrameRef.current = currentFrame;

  // Set by captureFrame(), read (and cleared) by the very next tick() —
  // see ViewportExportHandle's own doc comment above.
  const pendingCaptureRef = useRef<{ frameIndex: number; fps: number; resolve: () => void } | null>(null);
  const onEvaluatedResultsRef = useRef(onEvaluatedResults);
  onEvaluatedResultsRef.current = onEvaluatedResults;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const [showEnvInEditor, setShowEnvInEditor] = useState(false);
  const showEnvInEditorRef = useRef(showEnvInEditor);
  showEnvInEditorRef.current = showEnvInEditor;

  const [isCameraView, setIsCameraView] = useState(false);
  const isCameraViewRef = useRef(isCameraView);
  isCameraViewRef.current = isCameraView;

  const [marqueeBox, setMarqueeBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

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

    // Curve control-point editing. `selectedPointIndices` holds the active
    // selection of control points (single or multiple via marquee/shift).
    // The gizmo belongs to the selected object when empty, and attaches to
    // the picked handle or multi-point centroid when non-empty.
    const curveHandles = createCurvePointHandles();
    let curvePointsNodeId: string | null = null;
    let selectedPointIndices = new Set<number>();
    let isMarqueeDragging = false;
    let marqueeStartPos: { x: number; y: number } | null = null;

    let dragStartCentroidPos = new THREE.Vector3();
    let dragStartCentroidQuat = new THREE.Quaternion();
    let dragStartCentroidScale = new THREE.Vector3(1, 1, 1);
    let dragStartPointPositions = new Map<number, THREE.Vector3>();

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
      if (selectedPointIndices.size === 0 || !curvePointsNodeId) return false;
      const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
      if (!node || !onTransformChangeRef.current) return false;

      const index = Array.from(selectedPointIndices)[0];
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
      const newIdx = operation === "insert" ? index + 1 : Math.min(index, nextPoints.length - 1);
      selectedPointIndices = new Set([newIdx]);
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
        if (event.value) {
          onTransformStartRef.current?.();
          if (transformControls.object?.userData?.isCurveCentroidHandle) {
            const centroid = transformControls.object;
            dragStartCentroidPos.copy(centroid.position);
            dragStartCentroidQuat.copy(centroid.quaternion);
            dragStartCentroidScale.copy(centroid.scale);
            dragStartPointPositions.clear();
            const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
            const rawList = Array.isArray(node?.params.pointsList) ? node!.params.pointsList : [];
            selectedPointIndices.forEach((idx) => {
              const handle = curveHandles.handleAt(idx);
              const pos = handle ? handle.position.clone() : asVector3(rawList[idx], new THREE.Vector3());
              dragStartPointPositions.set(idx, pos);
            });
          }
        }
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

        // A single curve control point drag: `object.position` is already
        // in the curve's own space (the handles' group carries the drawing
        // object's world matrix — see curveHandles.ts), which is exactly what
        // `pointsList` stores, so it goes back verbatim.
        if (object.userData?.isCurvePointHandle) {
          const pointIdx = object.userData.pointIndex as number;
          const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
          if (!node || !onTransformChangeRef.current) return;
          const rawList = Array.isArray(node.params.pointsList) ? [...node.params.pointsList] : [];
          if (pointIdx < 0 || pointIdx >= rawList.length) return;
          // A lattice handle is drawn on the deformed cage, so where it was
          // dropped is not what `pointsList` stores — the base point that
          // lands there once the modulators run is. Storing the handle
          // position verbatim would bake the modulator in and then apply it
          // a second time on the next evaluation.
          rawList[pointIdx] =
            node.type === LATTICE_DEFORM_NODE.type
              ? latticeBasePointForTarget(node.params, pointIdx, object.position)
              : object.position.clone();
          onTransformChangeRef.current(node.id, { pointsList: rawList });
          return;
        }

        // Multi-point centroid drag: applies relative translation, rotation, and scaling
        // around the selection center to all selected control points simultaneously.
        if (object.userData?.isCurveCentroidHandle) {
          const node = graphRef.current.nodes.find((n) => n.id === curvePointsNodeId);
          if (!node || !onTransformChangeRef.current) return;
          const rawList = Array.isArray(node.params.pointsList) ? [...node.params.pointsList] : [];

          const deltaQuat = new THREE.Quaternion().copy(object.quaternion).multiply(dragStartCentroidQuat.clone().invert());
          const deltaScaleX = dragStartCentroidScale.x !== 0 ? object.scale.x / dragStartCentroidScale.x : 1;
          const deltaScaleY = dragStartCentroidScale.y !== 0 ? object.scale.y / dragStartCentroidScale.y : 1;
          const deltaScaleZ = dragStartCentroidScale.z !== 0 ? object.scale.z / dragStartCentroidScale.z : 1;

          for (const [idx, initialPos] of dragStartPointPositions.entries()) {
            if (idx < 0 || idx >= rawList.length) continue;
            const offset = new THREE.Vector3().subVectors(initialPos, dragStartCentroidPos);
            offset.x *= deltaScaleX;
            offset.y *= deltaScaleY;
            offset.z *= deltaScaleZ;
            offset.applyQuaternion(deltaQuat);
            const newPos = new THREE.Vector3().addVectors(object.position, offset);
            // Same deformed-cage conversion as the single-handle path above.
            rawList[idx] =
              node.type === LATTICE_DEFORM_NODE.type
                ? latticeBasePointForTarget(node.params, idx, newPos)
                : newPos;
            const handle = curveHandles.handleAt(idx);
            if (handle) handle.position.copy(newPos);
          }

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

      const isMarqueeModifier = e.metaKey || e.ctrlKey;
      if (isMarqueeModifier && curveHandles.count() > 0 && !outputMode) {
        isMarqueeDragging = true;
        marqueeStartPos = { x: e.clientX, y: e.clientY };
        controls.enabled = false;
        e.stopImmediatePropagation();
      }
    }

    function onCanvasPointerMove(e: PointerEvent) {
      if (isMarqueeDragging && marqueeStartPos && host) {
        const rect = host.getBoundingClientRect();
        const x1 = Math.min(marqueeStartPos.x, e.clientX) - rect.left;
        const x2 = Math.max(marqueeStartPos.x, e.clientX) - rect.left;
        const y1 = Math.min(marqueeStartPos.y, e.clientY) - rect.top;
        const y2 = Math.max(marqueeStartPos.y, e.clientY) - rect.top;
        setMarqueeBox({
          left: x1,
          top: y1,
          width: Math.max(1, x2 - x1),
          height: Math.max(1, y2 - y1),
        });
      }
    }

    function onCanvasPointerUp(e: PointerEvent) {
      if (isMarqueeDragging) {
        isMarqueeDragging = false;
        setMarqueeBox(null);
        controls.enabled = true;

        if (marqueeStartPos) {
          const rect = renderer.domElement.getBoundingClientRect();
          const minX = Math.min(marqueeStartPos.x, e.clientX) - rect.left;
          const maxX = Math.max(marqueeStartPos.x, e.clientX) - rect.left;
          const minY = Math.min(marqueeStartPos.y, e.clientY) - rect.top;
          const maxY = Math.max(marqueeStartPos.y, e.clientY) - rect.top;

          if (Math.hypot(e.clientX - marqueeStartPos.x, e.clientY - marqueeStartPos.y) > CLICK_MOVE_THRESHOLD_PX) {
            const picked = curveHandles.pickRect({ minX, minY, maxX, maxY }, camera, rect.width, rect.height);
            if (e.shiftKey) {
              picked.forEach((idx) => selectedPointIndices.add(idx));
            } else {
              selectedPointIndices = new Set(picked);
            }
            pointerDownAt = null;
            return;
          }
        }
      }

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
          if (e.shiftKey) {
            if (selectedPointIndices.has(pickedIdx)) {
              selectedPointIndices.delete(pickedIdx);
            } else {
              selectedPointIndices.add(pickedIdx);
            }
          } else {
            selectedPointIndices = new Set([pickedIdx]);
          }
          return;
        }
      }
      // Clicking anywhere else drops the point and hands the gizmo back to
      // the object.
      selectedPointIndices.clear();

      // three's Raycaster hits invisible objects too — it only skips them if
      // you filter yourself — so a hidden object would otherwise still be
      // clickable, and would steal clicks from whatever is visible behind it.
      const hit = raycaster
        ? raycaster.intersectObjects(scene.children, true).find((i) => {
            let curr: THREE.Object3D | null = i.object;
            let taggedNode = false;
            while (curr) {
              if (curr.visible === false) return false;
              if (curr.userData?.nodeId) taggedNode = true;
              curr = curr.parent;
            }
            return taggedNode;
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
      renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown, { capture: true });
      window.addEventListener("pointermove", onCanvasPointerMove);
      window.addEventListener("pointerup", onCanvasPointerUp);
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
    let cachedRootsGraph: Graph | null = null;
    let cachedRoots: string[] = [];
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

    if (exportHandleRef) {
      exportHandleRef.current = {
        getCanvas: () => renderer.domElement,
        captureFrame: (frameIndex, fps) =>
          new Promise<void>((resolve) => {
            pendingCaptureRef.current = { frameIndex, fps, resolve };
          }),
      };
    }

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
      // A pending captureFrame() call wins over live playback entirely: the
      // clock is forced to exactly frameIndex/fps (not real elapsed time —
      // Time-node/oscillator/particle output must match that instant, not
      // whenever this tick happened to run), and keyframe evaluation uses
      // frameIndex directly rather than racing the currentFrame prop's own
      // React commit.
      const capture = pendingCaptureRef.current;
      const exportFrameIndex = capture?.frameIndex ?? currentFrameRef.current;
      if (capture) {
        const stepSeconds = 1 / capture.fps;
        const time = capture.frameIndex * stepSeconds;
        clock = { epochMs: clock.epochMs, step: Math.round(time / STEP_SECONDS), time };
      } else if (isPlayingRef.current) {
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
          currentFrame: exportFrameIndex,
          keyframes: graphRef.current.keyframes,
        });
      } catch (err) {
        console.error("graph evaluation failed", err);
        if (capture) {
          pendingCaptureRef.current = null;
          capture.resolve();
        }
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
        if ((node?.type === CAMERA_NODE.type || node?.type === CAMERA_FLY_TO_NODE.type) && res.geometry instanceof THREE.Object3D) {
          activeCameraHelpers.set(nodeId, res.geometry as THREE.Object3D);
        }
      }
      editorHelpers.sync(outputMode ? new Map() : activeCameraHelpers);

      // A Camera or Fly To node drives the camera directly from its Matrix/
      // FOV (or its DLT solve) — but only in the *output* window. That is
      // the one view that has to show exactly what the real projector will
      // show, which orbit navigation would otherwise fight every frame. The
      // editor's own viewport stays freely orbitable regardless of a Camera
      // node's presence or mode, since it's for building/inspecting the
      // scene, not for judging alignment — that judgment only means
      // anything against the actual projected output (see OutputWindow).
      // Prioritize Fly To if active or in flight, then fallback to Camera nodes
      const flyToNodes = graphRef.current.nodes.filter((n: { type: string; id: string }) => n.type === CAMERA_FLY_TO_NODE.type);
      let activeFlyToResult: Record<string, unknown> | undefined;
      for (const node of flyToNodes) {
        const res = results.get(node.id);
        if (res && res.active !== 0 && res.active !== false) {
          activeFlyToResult = res;
          break;
        }
      }

      let activeCameraResult = activeFlyToResult;
      if (!activeCameraResult) {
        const cameraNodes = graphRef.current.nodes.filter((n: { type: string; id: string }) => n.type === CAMERA_NODE.type);
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
      }

      const cameraResult = activeCameraResult;
      if (cameraResult && typeof cameraResult.projectionType === "string") {
        const wantsOrtho = cameraResult.projectionType === "orthographic";
        if (wantsOrtho !== isOrthographicRef.current) {
          setIsOrthographic(wantsOrtho);
        }
      }
      const shouldDriveCamera = outputMode || isCameraViewRef.current;
      const calibrationMatrix =
        shouldDriveCamera && cameraResult?.matrix instanceof THREE.Matrix4 ? cameraResult.matrix as THREE.Matrix4 : null;

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
        if (!transformControls?.dragging && !isMarqueeDragging) {
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

      // Everything this viewport shows, in one reconciliation: the object of
      // every node that is a scene root — one whose geometry nothing
      // downstream has taken ownership of (see sceneRoots.ts). A Render node
      // is one root among others rather than the only door into the scene,
      // which is what the Empty and light exemptions here were already
      // working around.
      //
      // The containment check is the safety net for *reparenting* owners: a
      // Merge pulls its inputs into its own group, and adding one to the
      // scene again would tear it back out (three.js gives an Object3D
      // exactly one parent). Cloning owners — Array, Look At, Spawner — are
      // covered by the ownership declaration instead, since their source is
      // never inside their output and no runtime check could tell the
      // resulting duplicate from a legitimate second object.
      // Only the graph's shape decides this, and it changes on an edit, not
      // on a frame — recomputing it 60 times a second would walk every
      // connection of every node for nothing.
      if (cachedRootsGraph !== graphRef.current) {
        cachedRootsGraph = graphRef.current;
        cachedRoots = resolveSceneRoots(graphRef.current, registryRef.current);
      }

      const rootObjects: { nodeId: string; object: THREE.Object3D }[] = [];
      for (const nodeId of cachedRoots) {
        const geometry = results.get(nodeId)?.geometry;
        if (!(geometry instanceof THREE.Object3D)) continue;
        rootObjects.push({ nodeId, object: geometry });
      }

      const desiredContents = new Map<string, THREE.Object3D>();
      for (const { nodeId, object } of rootObjects) {
        const insideAnotherRoot = rootObjects.some(
          (other) => other.object !== object && isSelfOrDescendantOf(object, other.object),
        );
        if (insideAnotherRoot) continue;

        // Split View's right pane (and the separate Output Window) run their
        // own tick() loop against the *same* graph, but every object/
        // instance/merge node hands back one THREE.Object3D cached per node
        // id at module scope (see nodeCaches.ts) — there is only ever one
        // such object for the whole process, not one per Viewport. three.js
        // gives an Object3D exactly one parent, so the instant a second
        // Viewport's scene.add() runs on it, it's silently ripped out of
        // whichever scene had it first: the editor pane's own scene.add()
        // this frame gets undone by the output pane's the next, leaving the
        // editor empty until the object's identity happens to change again.
        //
        // This pane has no TransformControls (outputMode skips that whole
        // block below) needing a *stable* object identity to attach to
        // across frames, so it's free to hold its own disposable clone
        // instead of fighting over the shared original. Object3D.clone(true)
        // deep-copies the hierarchy but shares geometry/material by
        // reference — cheap, and nothing GPU-owned needs disposing when the
        // old clone is dropped.
        desiredContents.set(nodeId, outputMode ? object.clone(true) : object);
      }
      sceneContents.sync(desiredContents);

      // What post-processing outlines and what the passe-partout guide frames
      // is still the Render node's own subtree — "the output" is a narrower
      // idea than "everything in the scene", and that is exactly what a
      // Render node is for.
      const renderOutput = results.get(renderNodeIdRef.current)?.geometry;
      currentObject = renderOutput instanceof THREE.Object3D ? (desiredContents.get(renderNodeIdRef.current) ?? renderOutput) : null;

      // Curve control-point handles for the selected curve, drawn through the
      // world matrix of whatever object draws that curve so they track the
      // tube when it is moved, rotated or scaled.
      const curveTarget = outputMode ? null : resolveCurveEditTarget(graphRef.current, selectedNodeIdRef.current);
      const curveNode = curveTarget ? graphRef.current.nodes.find((n) => n.id === curveTarget.pointsNodeId) : undefined;
      // A lattice's handles go on its *deformed* cage, not on the raw stored
      // grid: the stored points are the grid before taper/twist/bend are
      // applied, so with any of those dialled in, handles drawn there float
      // off the cage they are meant to be editing. A drag is converted back
      // through latticeBasePointForTarget below.
      const isLatticeNode = curveNode?.type === LATTICE_DEFORM_NODE.type;
      const curvePoints = isLatticeNode
        ? latticeEvaluatedPoints(curveNode!.params)
        : (Array.isArray(curveNode?.params.pointsList) ? curveNode.params.pointsList : []).map((p) =>
            asVector3(p, new THREE.Vector3()),
          );

      if (curveTarget && curveNode && curvePoints.length >= 2) {
        if (curvePointsNodeId !== curveNode.id) {
          curvePointsNodeId = curveNode.id;
          selectedPointIndices.clear();
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
          spaceObject.updateWorldMatrix(true, false, true);
          spaceMatrix.copy(spaceObject.matrixWorld);
        }

        const isDraggingHandle =
          transformControls?.dragging &&
          (transformControls.object?.userData?.isCurvePointHandle ||
            transformControls.object?.userData?.isCurveCentroidHandle);
        const frozenIndices = isDraggingHandle ? selectedPointIndices : null;
        curveHandles.sync(curvePoints, spaceMatrix, selectedPointIndices, frozenIndices, !isLatticeNode);
      } else if (curveHandles.count() > 0) {
        curveHandles.clear();
        curvePointsNodeId = null;
        selectedPointIndices.clear();
      }

      // Move/rotate/scale gizmo: attach to selected mesh, Empty, Light,
      // or to the picked control point / multi-point centroid proxy
      let pickedCurveHandle: THREE.Object3D | null = null;
      if (transformControls) {
        if (selectedPointIndices.size === 1) {
          const singleIdx = Array.from(selectedPointIndices)[0];
          pickedCurveHandle = curveHandles.handleAt(singleIdx);
        } else if (selectedPointIndices.size > 1) {
          pickedCurveHandle = curveHandles.getCentroidHandle();
        }
      }

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

      if (capture) {
        pendingCaptureRef.current = null;
        capture.resolve();
      }

      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (!outputMode) {
        renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown, { capture: true });
        window.removeEventListener("pointermove", onCanvasPointerMove);
        window.removeEventListener("pointerup", onCanvasPointerUp);
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
      {/* Rectangular Marquee Selection Overlay (Cmd+Drag) */}
      {!outputMode && marqueeBox && (
        <div
          style={{
            position: "absolute",
            left: `${marqueeBox.left}px`,
            top: `${marqueeBox.top}px`,
            width: `${marqueeBox.width}px`,
            height: `${marqueeBox.height}px`,
            border: "1.5px dashed #38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.18)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      )}
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
            className={`viewport-hud-button ${isCameraView ? "viewport-hud-button-active" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: isCameraView ? "#38bdf8" : "#cbd5e1",
              backgroundColor: isCameraView ? "rgba(56, 189, 248, 0.15)" : undefined,
              borderColor: isCameraView ? "#38bdf8" : undefined,
            }}
            onClick={() => setIsCameraView((prev) => !prev)}
            title={
              isCameraView
                ? "Camera View Active (click to switch to Free Orbit View)"
                : "Look through Active Camera / Fly To (Camera View)"
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </button>
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

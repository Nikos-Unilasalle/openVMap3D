import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { ClockState, createClock, tickClock } from "../graph/clock";
import { EvalResult, evaluateGraph } from "../graph/evaluate";
import { CAMERA_NODE } from "../graph/nodes/camera";
import { resetAllParticleSimulations } from "../graph/particleRuntime";
import { GizmoTarget, resolveGizmoTarget } from "../graph/transformLookup";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";
import { RGBShiftShader } from "three/examples/jsm/shaders/RGBShiftShader.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { GlitchPass } from "three/examples/jsm/postprocessing/GlitchPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { FXAAPass } from "three/examples/jsm/postprocessing/FXAAPass.js";
import { createMotionBlur } from "./motionBlur";
import { ColorCorrectionShader } from "three/examples/jsm/shaders/ColorCorrectionShader.js";
import { KaleidoShader } from "three/examples/jsm/shaders/KaleidoShader.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { HorizontalBlurShader } from "three/examples/jsm/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/examples/jsm/shaders/VerticalBlurShader.js";
import { EnvironmentData } from "../graph/nodes/environment";
import { PostProcessConfig } from "../graph/nodes/postprocessing";
import { Graph, NodeRegistry } from "../graph/types";
import type { PreviewCameraPose } from "../ipc";
import "./viewport.css";

export type TransformGizmoMode = "translate" | "rotate" | "scale";

/**
 * Partial on purpose: a gizmo drag writes only the channel it is actually
 * dragging, and only when that channel isn't driven by a wire — see the
 * `objectChange` handler for why writing all three corrupted hand-set values.
 */
export interface TransformPatch {
  location?: THREE.Vector3;
  rotation?: THREE.Vector3;
  scale?: THREE.Vector3;
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
  /** Fired once when a gizmo drag begins — the parent records one undo step for the whole drag (see App.tsx). */
  onTransformStart?: () => void;
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

/**
 * Viewport palette, modelled on Blender's own 3D view rather than the near
 * black the rest of the app started from: a soft blue-grey gradient reads as
 * *space* around the scene, and it gives dark geometry something to sit
 * against instead of vanishing into the background.
 */
const VIEWPORT_BG_TOP = "#39424f";
const VIEWPORT_BG_BOTTOM = "#59636f";
const GRID_LINE = 0x6a7482;
const GRID_LINE_MAJOR = 0x7c8794;
/** Muted enough to read as reference lines, not as scene content — same reason Blender desaturates its own. */
const AXIS_X_COLOR = 0xa8555f;
const AXIS_Z_COLOR = 0x4d7fa6;

/**
 * TransformControls' own gizmo defaults to pure #f00/#0f0/#00f — harsh
 * against everything else in this file already being softened toward
 * Blender's own muted palette. Same treatment, same reasoning as the axis
 * lines above, via TransformControls.setColors() (its own public API for
 * this — no need to reach into gizmo internals).
 */
const GIZMO_X_COLOR = 0xe0757f;
const GIZMO_Y_COLOR = 0x8fcf8a;
const GIZMO_Z_COLOR = 0x6fa8dc;
/** The axis actively being dragged, or hovered. */
const GIZMO_ACTIVE_COLOR = 0xf0c674;

/**
 * Blender's vertical viewport gradient, as a 2px-wide canvas texture. Assigned
 * to `scene.background`, three.js stretches it flat across the frame (the
 * equirect wrapping only applies to textures explicitly mapped that way).
 */
function createViewportBackground(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, VIEWPORT_BG_TOP);
  gradient.addColorStop(1, VIEWPORT_BG_BOTTOM);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Build main 3D Scene Grid & Origin Axes Helper */
function buildMainSceneGridAndAxes(): THREE.Group {
  const group = new THREE.Group();

  // Ground Grid (XZ Plane)
  const gridHelper = new THREE.GridHelper(20, 20, GRID_LINE_MAJOR, GRID_LINE);
  gridHelper.position.y = -0.001; // Avoid z-fighting with objects at y=0
  group.add(gridHelper);

  // The two in-plane axes drawn the length of the grid, Blender-style: a
  // coloured line running the whole floor tells you which way X and Z go far
  // more legibly than a short arrow at the origin does, and it stays readable
  // when the camera is right down on the ground plane.
  const half = 10;
  for (const [axis, color] of [
    [new THREE.Vector3(1, 0, 0), AXIS_X_COLOR],
    [new THREE.Vector3(0, 0, 1), AXIS_Z_COLOR],
  ] as const) {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        axis.clone().multiplyScalar(-half),
        axis.clone().multiplyScalar(half),
      ]),
      new THREE.LineBasicMaterial({ color }),
    );
    line.position.y = 0.001;
    group.add(line);
  }

  // Only "up" gets an arrow now. X and Z are the two floor lines above, and
  // stacking a second, brighter set of markers on the same axes at the origin
  // just cluttered it — the corner orientation gizmo already names all three.
  const upArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 0),
    1.2,
    0x6f9e57,
    0.24,
    0.1,
  );
  group.add(upArrow);

  return group;
}

/**
 * Fits `texture` (a flat background image) into a `viewportW`×`viewportH`
 * canvas per `fit`, then applies the user's extra scale/offset/rotation on
 * top — same "texture.offset/repeat/rotation drive the sample" mechanism
 * texture.ts already uses for uvScale/uvOffset, just computed here because
 * only Viewport.tsx knows the actual canvas size (environment.ts's evaluate
 * has no canvas to measure against).
 *
 * "contain" has no true letterbox (a flat background texture always fills
 * the screen quad) — the padding reads as stretched edge pixels via
 * ClampToEdgeWrapping instead of a solid color bar. Acceptable trade for a
 * VJ tool; a real letterbox would need a dedicated background shader pass.
 */
function applyBackgroundImageTransform(texture: THREE.Texture, env: EnvironmentData, viewportW: number, viewportH: number): void {
  const img = texture.image as { width?: number; height?: number } | undefined;
  let repeatX = 1;
  let repeatY = 1;

  if (img?.width && img?.height && viewportW > 0 && viewportH > 0) {
    const canvasAspect = viewportW / viewportH;
    const imageAspect = img.width / img.height;
    if (env.backgroundFit === "cover") {
      if (canvasAspect > imageAspect) repeatY = imageAspect / canvasAspect;
      else repeatX = canvasAspect / imageAspect;
    } else if (env.backgroundFit === "contain") {
      if (canvasAspect > imageAspect) repeatX = canvasAspect / imageAspect;
      else repeatY = imageAspect / canvasAspect;
    }
    // "stretch": repeatX/repeatY stay 1 — the image fills the quad as-is, distortion and all.
  }

  const scale = env.backgroundScale;
  repeatX *= scale.x || 1;
  repeatY *= scale.y || 1;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = env.backgroundRotation;
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set((1 - repeatX) / 2 + env.backgroundOffset.x, (1 - repeatY) / 2 + env.backgroundOffset.y);
  texture.needsUpdate = true;
}

const CustomPixelShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    pixelSize: { value: 6.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float pixelSize;
    varying vec2 vUv;
    void main() {
      vec2 dxy = pixelSize / resolution;
      vec2 coord = dxy * floor(vUv / dxy);
      gl_FragColor = texture2D(tDiffuse, coord);
    }
  `,
};

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
}: ViewportProps) {
  const [showUiOverlay, setShowUiOverlay] = useState(true);
  const showUiOverlayRef = useRef(showUiOverlay);
  showUiOverlayRef.current = showUiOverlay;

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
        setShowUiOverlay((prev) => !prev);
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
    composer.addPass(renderPass);

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

    /**
     * Snaps to an axis-aligned view, the way Blender's numpad views work.
     * Keeps the current orbit target and distance, so it reframes what you
     * were already looking at instead of jumping back to the origin.
     */
    setAxisViewRef.current = (axis, sign) => {
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

      controls.update();
    };

    function emitCameraPose() {
      onCameraChangeRef.current?.({
        position: [activeCamera.position.x, activeCamera.position.y, activeCamera.position.z],
        quaternion: [activeCamera.quaternion.x, activeCamera.quaternion.y, activeCamera.quaternion.z, activeCamera.quaternion.w],
      });
    }
    if (!outputMode) {
      controls.addEventListener("change", emitCameraPose);
      emitCameraPose();
    }

    const gizmo = outputMode ? null : createGizmoScene();

    const raycaster = outputMode ? null : new THREE.Raycaster();
    const transformControls = outputMode ? null : new TransformControls(activeCamera, renderer.domElement);
    transformControls?.setColors(GIZMO_X_COLOR, GIZMO_Y_COLOR, GIZMO_Z_COLOR, GIZMO_ACTIVE_COLOR);
    let attachedObjectNodeId: string | null = null;
    let attachedGizmoTarget: GizmoTarget | null = null;
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

        if (!attachedGizmoTarget || !onTransformChangeRef.current) return;

        // Only the channel the gizmo is actually dragging gets written, and
        // only if nothing is wired into that input. Writing all three every
        // time was the cause of values changing on their own the moment a
        // handle was touched:
        //
        //  - a rotation round-trips through a quaternion, and Euler triples
        //    are not unique, so a hand-typed (0, 0, 180°) could come back as
        //    an equivalent but different-looking triple after a *translate*
        //    drag that never meant to touch rotation at all;
        //  - `decompose` cannot recover a negative scale (it normalises the
        //    sign away), so a mirrored object quietly lost its flip;
        //  - a channel fed by a wire ignores its param — the param is only
        //    the unconnected fallback — so writing it looked like the drag
        //    did nothing while silently overwriting the stored fallback with
        //    whatever the animation happened to be showing that frame.
        const patch: TransformPatch = {};
        const mode = transformModeRef.current;
        // Which node id actually owns the params a drag writes into — the
        // upstream Transform/MatrixTransform for "absolute"/"offset", or the
        // object itself for "native" (see transformLookup.ts).
        const targetNodeId =
          attachedGizmoTarget.kind === "native" ? attachedGizmoTarget.objectNodeId : attachedGizmoTarget.transformNodeId;
        const wired = new Set(
          graphRef.current.connections.filter((c) => c.toNode === targetNodeId).map((c) => c.toSocket),
        );

        if (attachedGizmoTarget.kind === "absolute") {
          // A plain Transform node's location/rotation/scale directly
          // compose the object's final matrix — the gizmo's own dragged
          // world pose IS what belongs in its params.
          if (mode === "translate" && !wired.has("location")) patch.location = object.position.clone();
          if (mode === "rotate" && !wired.has("rotation")) {
            const euler = new THREE.Euler().setFromQuaternion(object.quaternion);
            patch.rotation = new THREE.Vector3(euler.x, euler.y, euler.z);
          }
          if (mode === "scale" && !wired.has("scale")) patch.scale = object.scale.clone();

          if (Object.keys(patch).length > 0) {
            onTransformChangeRef.current(targetNodeId, patch);
          }
          return;
        }

        if (attachedGizmoTarget.kind === "offset") {
          // A Matrix Transform node's location/rotation/scale are a *local
          // delta* on top of whatever its own `matrix` input currently
          // resolves to (final = base * delta, see transform.ts's
          // MATRIX_TRANSFORM_NODE). Writing the gizmo's absolute world pose
          // straight in would double-count that base — solving
          // `delta = inverse(base) * final` is what the offset written back
          // has to be instead. No base wired in -> identity, matching
          // MATRIX_TRANSFORM_NODE's own evaluate fallback.
          const baseResult = attachedGizmoTarget.baseSourceNodeId
            ? latestResults?.get(attachedGizmoTarget.baseSourceNodeId)?.matrix
            : undefined;
          const baseMatrix = baseResult instanceof THREE.Matrix4 ? baseResult : new THREE.Matrix4();
          const deltaMatrix = baseMatrix.clone().invert().multiply(object.matrix);

          const location = new THREE.Vector3();
          const quaternion = new THREE.Quaternion();
          const scale = new THREE.Vector3();
          deltaMatrix.decompose(location, quaternion, scale);

          if (mode === "translate" && !wired.has("location")) patch.location = location;
          if (mode === "rotate" && !wired.has("rotation")) {
            const euler = new THREE.Euler().setFromQuaternion(quaternion);
            patch.rotation = new THREE.Vector3(euler.x, euler.y, euler.z);
          }
          if (mode === "scale" && !wired.has("scale")) patch.scale = scale;

          if (Object.keys(patch).length > 0) {
            onTransformChangeRef.current(targetNodeId, patch);
          }
          return;
        }

        // "native" — the object's own location/rotation/scale ARE the base;
        // whatever's wired into its `matrix` input is the delta (see
        // composeNativeMatrix in transform.ts: final = base * delta). The
        // inverse of "offset"'s problem: there the base is fixed and delta
        // gets solved for; here the delta is fixed (from
        // deltaSourceNodeId's current result) and the base does —
        // `base = final * delta⁻¹`. No delta wired in -> identity, matching
        // composeNativeMatrix's own fallback.
        const deltaResult = attachedGizmoTarget.deltaSourceNodeId
          ? latestResults?.get(attachedGizmoTarget.deltaSourceNodeId)?.matrix
          : undefined;
        const deltaMatrix = deltaResult instanceof THREE.Matrix4 ? deltaResult : new THREE.Matrix4();
        const baseMatrix = object.matrix.clone().multiply(deltaMatrix.clone().invert());

        const location = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        baseMatrix.decompose(location, quaternion, scale);

        if (mode === "translate" && !wired.has("location")) patch.location = location;
        if (mode === "rotate" && !wired.has("rotation")) {
          const euler = new THREE.Euler().setFromQuaternion(quaternion);
          patch.rotation = new THREE.Vector3(euler.x, euler.y, euler.z);
        }
        if (mode === "scale" && !wired.has("scale")) patch.scale = scale;

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
      const hit = raycaster
        ? raycaster.intersectObjects(scene.children, true).find((i) => i.object.userData.nodeId)
        : undefined;
      onSelectNodeRef.current((hit?.object.userData.nodeId as string) ?? null);
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
    const passCache = new Map<string, { type: string; pass: any }>();

    function disposePass(entry: { type: string; pass: any }) {
      try {
        if (typeof entry.pass.dispose === "function") {
          entry.pass.dispose();
        } else if (entry.pass.material && typeof entry.pass.material.dispose === "function") {
          entry.pass.material.dispose();
        }
      } catch {
        // Safe disposal fallback
      }
    }

    // Bakes a blurred stand-in for a flat background image. three.js's own
    // scene.backgroundBlurriness only kicks in for a CubeTexture or an
    // EquirectangularReflectionMapping texture (gated inside
    // WebGLBackground.js) — a plain flat Texture never gets that PMREM
    // treatment, so "Bg Blur" silently did nothing for a fixed background
    // image. This reproduces the same downsample-then-blur trick
    // UnrealBloomPass already uses elsewhere in this file: render into a
    // target far smaller than the viewport (the smaller the target, the
    // stronger a fixed 9-tap kernel reads once it's stretched back up to
    // fill the screen), ping-pong a couple of horizontal/vertical passes,
    // and hand back that small blurred target's texture as the background.
    // Cached and only re-baked when the source image or blur amount
    // actually changes — this is a handful of tiny offscreen draws, not a
    // per-frame cost. The param's useful range turned out to be [0, 0.01],
    // not [0, 1] — see the ×100 rescale inside blurredBackgroundImage.
    const blurQuad = new FullScreenQuad(new THREE.ShaderMaterial(HorizontalBlurShader));
    const hBlurMaterial = blurQuad.material as THREE.ShaderMaterial;
    const vBlurMaterial = new THREE.ShaderMaterial(VerticalBlurShader);
    let blurTargetA: THREE.WebGLRenderTarget | null = null;
    let blurTargetB: THREE.WebGLRenderTarget | null = null;
    let bakedBlur: { source: THREE.Texture; strength: number; texture: THREE.Texture } | null = null;

    function blurredBackgroundImage(source: THREE.Texture, blurriness: number): THREE.Texture {
      if (blurriness <= 0) return source;
      // The full-strength blur (what used to sit at blurriness=1) was already
      // maxed out well before the slider got anywhere near there — ×100 so the
      // whole useful range lives in [0, 0.01], matching what actually reads as
      // "just barely too strong" through "as blurry as anyone wants" in practice.
      const strength = Math.min(1, blurriness * 100);
      if (bakedBlur && bakedBlur.source === source && bakedBlur.strength === strength) return bakedBlur.texture;

      // Smaller target = cheaper AND blurrier — same lever bloom already pulls.
      const size = Math.max(8, Math.round(256 * (1 - strength) + 8));
      if (!blurTargetA || blurTargetA.width !== size) {
        blurTargetA?.dispose();
        blurTargetB?.dispose();
        blurTargetA = new THREE.WebGLRenderTarget(size, size, { generateMipmaps: false });
        blurTargetB = new THREE.WebGLRenderTarget(size, size, { generateMipmaps: false });
      }

      const iterations = 1 + Math.round(strength * 3);
      let readTexture = source;
      for (let i = 0; i < iterations; i++) {
        hBlurMaterial.uniforms.tDiffuse.value = readTexture;
        hBlurMaterial.uniforms.h.value = 1 / size;
        renderer.setRenderTarget(blurTargetA);
        blurQuad.material = hBlurMaterial;
        blurQuad.render(renderer);

        vBlurMaterial.uniforms.tDiffuse.value = blurTargetA!.texture;
        vBlurMaterial.uniforms.v.value = 1 / size;
        renderer.setRenderTarget(blurTargetB);
        blurQuad.material = vBlurMaterial;
        blurQuad.render(renderer);

        readTexture = blurTargetB!.texture;
      }
      renderer.setRenderTarget(null);

      bakedBlur = { source, strength, texture: readTexture };
      return readTexture;
    }

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
          renderer,
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
          activeLights.delete(uuid);
          const helper = activeLightHelpers.get(uuid);
          if (helper) {
            editorUiScene.remove(helper);
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
      const cameraInstance = graphRef.current.nodes.find((n: { type: string; id: string }) => n.type === CAMERA_NODE.type);
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
        } else if (attachedObjectNodeId !== null) {
          transformControls.detach();
          attachedObjectNodeId = null;
          attachedGizmoTarget = null;
        }
      }

      // Sync Environment & HDRI / Background Color
      const renderResult = results.get(renderNodeIdRef.current);
      let activeEnv: EnvironmentData | null = null;
      if (renderResult?.environment && typeof renderResult.environment === "object") {
        activeEnv = renderResult.environment as EnvironmentData;
      } else {
        for (const res of results.values()) {
          if (res.environment && typeof res.environment === "object") {
            activeEnv = res.environment as EnvironmentData;
            break;
          }
        }
      }

      if (activeEnv) {
        // scene.environment (reflections/lighting) is driven by the HDRI
        // texture regardless of what's actually drawn behind the scene —
        // a flat background image only replaces what's *visible*, same as
        // the flat color it's standing in for.
        scene.environment = activeEnv.texture ?? null;

        if (activeEnv.showBackground && activeEnv.backgroundImage) {
          // Blur the raw source first (its own blur bake ignores any
          // offset/repeat/rotation, see blurredBackgroundImage's own
          // comment), THEN apply the fit/pan/rotate transform to whichever
          // texture — sharp or blurred — comes out of that.
          const bgTexture = blurredBackgroundImage(activeEnv.backgroundImage, activeEnv.blurriness);
          applyBackgroundImageTransform(bgTexture, activeEnv, host.clientWidth, host.clientHeight);
          bgScene.background = bgTexture;
          (bgScene as any).backgroundBlurriness = 0;
          (scene as any).backgroundBlurriness = 0;
        } else if (activeEnv.showBackground && activeEnv.texture) {
          bgScene.background = activeEnv.texture;
          (bgScene as any).backgroundBlurriness = activeEnv.blurriness;
          (scene as any).backgroundBlurriness = activeEnv.blurriness;
        } else {
          bgScene.background = activeEnv.color;
          (bgScene as any).backgroundBlurriness = 0;
          (scene as any).backgroundBlurriness = 0;
        }
        if ("environmentIntensity" in scene) {
          (scene as any).environmentIntensity = activeEnv.intensity;
        }
      } else {
        scene.environment = null;
        bgScene.background = viewportBackground;
        (bgScene as any).backgroundBlurriness = 0;
        (scene as any).backgroundBlurriness = 0;
      }

      // 1. Render Main Scene (with Post-Processing pipeline if active)
      const width = host.clientWidth;
      const height = host.clientHeight;
      renderer.setViewport(0, 0, width, height);
      renderer.setScissorTest(false);

      const postConfigs = Array.isArray(renderResult?.postprocess)
        ? (renderResult.postprocess as PostProcessConfig[])
        : [];

      // Motion blur lives on the Render node itself rather than in the
      // postprocess chain (it's a property of the output, not an effect a
      // graph wires up), so it can switch the composer path on by itself
      // even with no postprocess node connected at all.
      const motionBlur = typeof renderResult?.motionBlur === "number" ? renderResult.motionBlur : 0;

      if (postConfigs.length > 0 || motionBlur > 0) {
        // 1a. Render pristine Background Layer (unaffected by Post-Processing!)
        renderer.clearColor();
        renderer.render(bgScene, camera);

        // 1b. Main 3D scene has transparent background so postprocess ONLY applies to 3D objects!
        scene.background = null;

        // Velocity has to be measured off the same scene state the colour
        // pass is about to draw, and into its own target, so it runs before
        // the composer touches anything.
        if (motionBlur > 0) {
          motionBlurEffect.renderVelocity(renderer, scene, camera);
        }

        const activeNodeIds = new Set<string>();

        // Rebuild composer pass order
        composer.passes.length = 0;
        composer.addPass(renderPass);
        // EffectComposer never clears its own ping-pong buffers, so leaving
        // this pass on `clear = false` drew each frame on top of whatever
        // was still in that buffer two frames ago — uncontrolled ghosting.
        // Clearing to *transparent* black (rather than just `clear = true`,
        // which would use the renderer's own opaque clear alpha and bury the
        // pristine background layer below) gives this pass a clean frame
        // while keeping the alpha the final composite blends over that
        // background with. It also leaves the motion-blur pass below as the
        // only thing that accumulates, which is what makes its `damp`
        // actually mean something.
        renderPass.clearColor = new THREE.Color(0x000000);
        renderPass.clearAlpha = 0;
        renderPass.clear = true;
        renderPass.clearDepth = true;

        postConfigs.forEach((cfg) => {
          if (!cfg || !cfg.type || !cfg.nodeId) return;
          activeNodeIds.add(cfg.nodeId);

          let cached = passCache.get(cfg.nodeId);

          // If pass type changed or doesn't exist yet, instantiate it once
          if (!cached || cached.type !== cfg.type) {
            if (cached) disposePass(cached);

            let pass: any = null;
            switch (cfg.type) {
              case "bloom":
                pass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.1);
                break;
              case "vignette":
                pass = new ShaderPass(VignetteShader);
                break;
              case "rgb-shift":
                pass = new ShaderPass(RGBShiftShader);
                break;
              case "dof":
                pass = new BokehPass(scene, camera, { focus: 10.0, aperture: 0.025, maxblur: 0.01 });
                break;
              case "outline":
                pass = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
                break;
              case "film-grain":
                pass = new FilmPass(0.35, false);
                break;
              case "glitch":
                pass = new GlitchPass();
                break;
              case "pixelate":
                pass = new ShaderPass(CustomPixelShader);
                break;
              case "kaleidoscope":
                pass = new ShaderPass(KaleidoShader);
                break;
              case "color-correction":
                pass = new ShaderPass(ColorCorrectionShader);
                break;
              case "antialias":
                pass = new FXAAPass();
                break;
            }

            if (pass) {
              cached = { type: cfg.type, pass };
              passCache.set(cfg.nodeId, cached);
            }
          }

          if (!cached) return;
          const pass = cached.pass;

          // Update pass parameters dynamically on the persistent pass instance
          switch (cfg.type) {
            case "bloom": {
              pass.strength = Number(cfg.params.strength) ?? 1.5;
              pass.radius = Number(cfg.params.radius) ?? 0.4;
              pass.threshold = Number(cfg.params.threshold) ?? 0.85;
              if (pass.resolution) pass.resolution.set(width, height);
              break;
            }
            case "vignette": {
              if (pass.uniforms["offset"]) pass.uniforms["offset"].value = Number(cfg.params.offset) ?? 1.0;
              if (pass.uniforms["darkness"]) pass.uniforms["darkness"].value = Number(cfg.params.darkness) ?? 1.5;
              break;
            }
            case "rgb-shift": {
              if (pass.uniforms["amount"]) pass.uniforms["amount"].value = Number(cfg.params.amount) ?? 0.005;
              if (pass.uniforms["angle"]) pass.uniforms["angle"].value = Number(cfg.params.angle) ?? 0;
              break;
            }
            case "dof": {
              if (pass.uniforms["focus"]) pass.uniforms["focus"].value = Math.max(0.1, Number(cfg.params.focus) ?? 10.0);
              if (pass.uniforms["aperture"]) pass.uniforms["aperture"].value = Math.max(0, Number(cfg.params.aperture) ?? 0.025);
              if (pass.uniforms["maxblur"]) pass.uniforms["maxblur"].value = Math.max(0, Number(cfg.params.maxblur) ?? 0.01);
              break;
            }
            case "outline": {
              const edgeColor = cfg.params.edgeColor instanceof THREE.Color ? cfg.params.edgeColor : new THREE.Color(0xffffff);
              pass.edgeStrength = Number(cfg.params.edgeStrength) ?? 3.0;
              pass.edgeGlow = 0.5;
              pass.edgeThickness = Number(cfg.params.edgeThickness) ?? 1.0;
              pass.visibleEdgeColor.copy(edgeColor);
              if (currentObject) {
                const meshes: THREE.Mesh[] = [];
                currentObject.traverse((c) => {
                  if (c instanceof THREE.Mesh) meshes.push(c);
                });
                pass.selectedObjects = meshes;
              }
              break;
            }
            case "film-grain": {
              if (pass.uniforms["nIntensity"]) pass.uniforms["nIntensity"].value = Number(cfg.params.noiseIntensity) ?? 0.35;
              if (pass.uniforms["grayscale"]) pass.uniforms["grayscale"].value = Boolean(cfg.params.grayscale) ? 1 : 0;
              break;
            }
            case "glitch": {
              const active = Boolean(cfg.params.active ?? true);
              pass.enabled = active;
              pass.goWild = Boolean(cfg.params.wild);
              break;
            }
            case "pixelate": {
              if (pass.uniforms["resolution"]) pass.uniforms["resolution"].value.set(width, height);
              if (pass.uniforms["pixelSize"]) pass.uniforms["pixelSize"].value = Math.max(1, Number(cfg.params.pixelSize) || 6);
              break;
            }
            case "kaleidoscope": {
              if (pass.uniforms["sides"]) pass.uniforms["sides"].value = Math.max(1, Number(cfg.params.sides) || 6);
              if (pass.uniforms["angle"]) pass.uniforms["angle"].value = Number(cfg.params.angle) || 0;
              break;
            }
            case "color-correction": {
              const brightness = Number(cfg.params.brightness) || 0;
              const contrast = Number(cfg.params.contrast) || 1;
              const saturation = Number(cfg.params.saturation) || 1;
              if (pass.uniforms["powRGB"]) pass.uniforms["powRGB"].value.set(contrast, contrast, contrast);
              if (pass.uniforms["mulRGB"]) pass.uniforms["mulRGB"].value.set(saturation, saturation, saturation);
              if (pass.uniforms["addRGB"]) pass.uniforms["addRGB"].value.set(brightness, brightness, brightness);
              break;
            }
            case "antialias": {
              pass.enabled = Boolean(cfg.params.enabled ?? true);
              if (pass.material?.uniforms["resolution"]) {
                pass.material.uniforms["resolution"].value.set(
                  1 / (width * renderer.getPixelRatio()),
                  1 / (height * renderer.getPixelRatio())
                );
              }
              break;
            }
          }

          composer.addPass(pass);
        });

        // Appended last, after every postprocess effect: the smear should be
        // of the finished frame (bloom, grading and all), not of a raw one
        // that later passes would then re-process.
        if (motionBlur > 0) {
          motionBlurEffect.setIntensity(motionBlur);
          composer.addPass(motionBlurEffect.pass);
        }

        // Dispose pass instances for removed nodes
        for (const [nodeId, entry] of passCache.entries()) {
          if (!activeNodeIds.has(nodeId)) {
            disposePass(entry);
            passCache.delete(nodeId);
          }
        }

        composer.render();
      } else {
        // Clear stale pass instances if postprocessing is disconnected
        if (passCache.size > 0) {
          passCache.forEach((entry) => disposePass(entry));
          passCache.clear();
        }

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
        controls.removeEventListener("change", emitCameraPose);
        window.removeEventListener("keydown", onSnapKeyDown);
        window.removeEventListener("keyup", onSnapKeyUp);
        window.removeEventListener("blur", onSnapWindowBlur);
      }
      transformControls?.dispose();
      controls.dispose();
      passCache.forEach((entry) => disposePass(entry));
      passCache.clear();
      viewportBackground.dispose();
      motionBlurEffect.dispose();
      blurQuad.dispose();
      hBlurMaterial.dispose();
      vBlurMaterial.dispose();
      blurTargetA?.dispose();
      blurTargetB?.dispose();
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
          <button
            type="button"
            className={`viewport-hud-button ${isOrthographic ? "viewport-hud-button-active" : ""}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              color: isOrthographic ? "#38bdf8" : "#cbd5e1",
              fontWeight: 600,
            }}
            onClick={() => setIsOrthographic((prev) => !prev)}
            title={
              isOrthographic
                ? "Vue Orthographique (clic pour passer en Perspective)"
                : "Vue Perspective (clic pour passer en Orthographique)"
            }
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            {isOrthographic ? "Ortho" : "Persp"}
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
                title={`Vue ${views[0]} / ${views[1]} (clic pour basculer)`}
                onClick={() => {
                  const sign = axisSideRef.current[axis];
                  setAxisViewRef.current(axis, sign);
                  // Flip for next time, so the same button walks both sides.
                  axisSideRef.current[axis] = (sign === 1 ? -1 : 1) as 1 | -1;
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="viewport-hud-button"
            onClick={() => resetCameraRef.current()}
            title="Réinitialiser la caméra 3D"
          >
            Reset Cam
          </button>
          <button
            className="viewport-hud-button"
            onClick={() => resetSimulationRef.current()}
            title="Relancer la simulation de particules depuis l'état initial"
          >
            Reset Sim
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

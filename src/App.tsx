import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CAMERA_FLY_TO_NODE, CAMERA_NODE } from "./shared/graph/nodes/camera";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { findRenderNodeId } from "./shared/graph/nodes/render";
import { rehydrateFileNodesFromDisk } from "./shared/graph/rehydrateFiles";
import { cloneGraph } from "./shared/graph/cloneGraph";
import { consumeCameraHandoffRequest } from "./shared/graph/cameraHandoffStore";
import { consumeCanvasSwitchRequest } from "./shared/graph/canvasSwitchStore";
import { disposeNodeCaches } from "./shared/graph/nodeCaches";
import { rehydrateGraphParams } from "./shared/graph/rehydrateParams";
import { connectedSocketIds, paramPanelValues } from "./shared/graph/paramPanelValues";
import {
  LATTICE_DEFORM_NODE,
  LATTICE_GRID_PARAM_IDS,
  latticeParamsWithRebuiltGrid,
} from "./shared/graph/nodes/lattice";
import {
  CANVAS_COUNT,
  Connection,
  emptyGraph,
  Graph,
  isCanvasEmpty,
  Keyframe,
  KeyframeStore,
  NodeInstance,
  normalizeCanvases,
  Project,
} from "./shared/graph/types";
import { broadcastGraph, maximizeMainWindow, PreviewCameraPose, startBroadcasting } from "./shared/ipc";
import { TransformPatch } from "./shared/three/Viewport";
import { SplitViewport } from "./shared/three/SplitViewport";
import "./shared/three/viewport.css";
import { GIZMO_SELECTABLE_TYPES, resolveGizmoTarget } from "./shared/graph/transformLookup";
import { CalibrationOverlay } from "./windows/CalibrationOverlay";
import { GraphEditor } from "./windows/GraphEditor";
import { OutputWindow } from "./windows/OutputWindow";
import { parseVector3, ParamPanel } from "./windows/ParamPanel";
import { TimelineBar } from "./windows/TimelineBar";
import { TopBar } from "./windows/TopBar";

function node(id: string, type: string, position: { x: number; y: number }, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position };
}

function edge(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}.${fromSocket}->${toNode}.${toSocket}`, fromNode, fromSocket, toNode, toSocket };
}

/**
 * Keyframe values are stored in the graph and round-trip through the .ovm as
 * plain JSON, so a THREE.Vector3/Color is kept as its own plain fields —
 * rehydrateParams.ts turns those back into class instances on load, and
 * interpolateValue (evaluate.ts) blends either form.
 */
function serializeKeyframeValue(value: unknown): unknown {
  if (value === undefined) return 0;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Shared by onParamChange and onTransformChange (the gizmo drag / "Aligner
 * Caméra" path — see Viewport.tsx): if `paramId` (or, for a Vector3, any of
 * its `.x`/`.y`/`.z` components) already has a keyframe track on this node,
 * writes `value` into that track at `currentFrame` instead of leaving it to
 * fall back to the base param. Deliberately does NOT create a *new* track —
 * only a "K" press does that (see ParamPanel) — so editing an unkeyframed
 * field elsewhere still just edits its static value, same as before any
 * keyframe exists. Returns `keyframes` unchanged (same reference) if nothing
 * on this node was actually keyframed, so callers can no-op cheaply.
 */
function applyKeyframedParamUpdate(
  keyframes: KeyframeStore | undefined,
  nodeId: string,
  paramId: string,
  value: unknown,
  currentFrame: number,
): KeyframeStore | undefined {
  const nodeKeys = keyframes?.[nodeId];
  if (!nodeKeys) return keyframes;

  const updatedNodeKeys = { ...nodeKeys };
  let modified = false;

  const updateOrInsertKeyframe = (key: string, val: unknown) => {
    const list = updatedNodeKeys[key] || [];
    const idx = list.findIndex((k) => k.frame === currentFrame);
    let newList: Keyframe[];
    if (idx >= 0) {
      newList = [...list];
      newList[idx] = { frame: currentFrame, value: val };
    } else {
      newList = [...list, { frame: currentFrame, value: val }].sort((a, b) => a.frame - b.frame);
    }
    updatedNodeKeys[key] = newList;
    modified = true;
  };

  if (updatedNodeKeys[paramId] && updatedNodeKeys[paramId].length > 0) {
    // Whole-value track. It only holds a number when the param *is* a
    // number: a Vector3 or Color track holds the composite, which
    // interpolateValue (see evaluate.ts) knows how to blend. Coercing
    // everything through Number() here turned every non-scalar update into
    // NaN and then stored a literal 0, quietly flattening the track.
    const valNum = Number(value);
    const isScalar = typeof value === "number" || (typeof value === "string" && Number.isFinite(valNum));
    updateOrInsertKeyframe(paramId, isScalar ? valNum : serializeKeyframeValue(value));
  }

  if (value instanceof THREE.Vector3 || (typeof value === "object" && value !== null && ("x" in value || "y" in value || "z" in value))) {
    const vec = parseVector3(value);
    for (const comp of ["x", "y", "z"] as const) {
      const fullKey = `${paramId}.${comp}`;
      if (updatedNodeKeys[fullKey] && updatedNodeKeys[fullKey].length > 0) {
        updateOrInsertKeyframe(fullKey, vec[comp]);
      }
    }
  }

  return modified ? { ...keyframes, [nodeId]: updatedNodeKeys } : keyframes;
}

function buildSmokeTestGraph(): Graph {
  return {
    nodes: [
      node("time", "time", { x: 40, y: 120 }),
      node("rotationVector", "vector/compose", { x: 280, y: 120 }, { x: 0, z: 0 }),
      node("boxTransform", "transform", { x: 540, y: 120 }),
      node("box", "object/box", { x: 800, y: 120 }),
      node("output", "render", { x: 1040, y: 120 }),
    ],
    connections: [
      edge("time", "seconds", "rotationVector", "y"),
      edge("rotationVector", "out", "boxTransform", "rotation"),
      edge("boxTransform", "matrix", "box", "matrix"),
      edge("box", "geometry", "output", "geometry"),
    ],
  };
}

/** Undo depth. */
const HISTORY_LIMIT = 50;
/** Consecutive edits to the same control within this window collapse into one undo step. */
const HISTORY_COALESCE_MS = 600;

const MIN_PANE_PERCENT = 15;
const MAX_PANE_PERCENT = 85;

/**
 * Two windows, one bundle: the Rust side (`output_window.rs`) opens the
 * projector-facing window at `index.html#/output` — this hash is the sole
 * discriminator between "I'm the main editor" and "I'm the output," same
 * pattern OpenVMap 2D uses. No router library needed for two routes.
 */
function App() {
  if (window.location.hash === "#/output") {
    return <OutputWindow />;
  }
  return <MainEditor />;
}

function MainEditor() {
  // The whole document. `graph` below is a view onto the active one — every
  // existing edit path (params, gizmo, undo, the editor itself) still speaks
  // in terms of one Graph and needs to know nothing about canvases.
  const [canvases, setCanvases] = useState<Graph[]>(() =>
    normalizeCanvases([buildSmokeTestGraph()]),
  );
  const [activeCanvas, setActiveCanvas] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [currentFilename, setCurrentFilename] = useState("project_v1.ovm");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  const graph = canvases[activeCanvas] ?? emptyGraph();
  const project: Project = { canvases, activeCanvas };

  // Read through a ref rather than the captured value: setGraph is handed to
  // callbacks that outlive the render they were made in (the gizmo's
  // per-frame writes, most of all), and a stale index would write the edit
  // into whichever canvas was open when the callback was created.
  const activeCanvasRef = useRef(activeCanvas);
  activeCanvasRef.current = activeCanvas;

  const setGraph = useCallback((nextOrUpdater: Graph | ((prev: Graph) => Graph)) => {
    setCanvases((prev) =>
      prev.map((canvas, i) =>
        i === activeCanvasRef.current
          ? typeof nextOrUpdater === "function"
            ? (nextOrUpdater as (prev: Graph) => Graph)(canvas)
            : nextOrUpdater
          : canvas,
      ),
    );
  }, []);

  const switchCanvas = useCallback((index: number) => {
    if (index < 0 || index >= CANVAS_COUNT) return;
    setActiveCanvas((prev) => {
      if (prev === index) return prev;
      // The ref leads the state: setGraph and the history helpers read it,
      // and anything that fires between this call and the re-render (a gizmo
      // frame, a pending param write) must already be aimed at the canvas
      // being switched to.
      activeCanvasRef.current = index;
      return index;
    });
    setSelectedNodeId(null);
  }, []);

  const renderNodeInstance = graph.nodes.find((n) => n.type === "render");
  const rawFrameCount = Number(renderNodeInstance?.params?.frameCount);
  const totalFrames = renderNodeInstance
    ? Number.isFinite(rawFrameCount) && rawFrameCount > 0
      ? Math.round(rawFrameCount)
      : 120
    : 0;
  const keyframesEnabled = !!renderNodeInstance;

  const [isPlaying, setIsPlaying] = useState(true);
  // Per canvas: each has its own Render node and so its own frame count, and
  // coming back to a canvas should find it where you left it rather than
  // wherever another canvas's playhead happens to be.
  const [currentFrames, setCurrentFrames] = useState<number[]>(() => new Array(CANVAS_COUNT).fill(0));
  const currentFrame = currentFrames[activeCanvas] ?? 0;
  const setCurrentFrame = useCallback((nextOrUpdater: number | ((prev: number) => number)) => {
    setCurrentFrames((prev) =>
      prev.map((frame, i) =>
        i === activeCanvasRef.current
          ? typeof nextOrUpdater === "function"
            ? nextOrUpdater(frame)
            : nextOrUpdater
          : frame,
      ),
    );
  }, []);
  const [evaluatedResults, setEvaluatedResults] = useState<Map<string, Record<string, unknown>> | null>(null);

  /**
   * Runs after every evaluation the viewport does. A Go To Canvas node can't
   * reach React state from inside `evaluate`, so it leaves its request in a
   * module slot (canvasSwitchStore) and it gets collected here — the same
   * indirection the Inspector node already uses to publish live values.
   */
  /**
   * Makes `nodeId` the active camera, every other Camera/Fly To node
   * inactive — the same exclusivity the Active checkbox enforces, reached
   * from the graph rather than the panel.
   *
   * Plain setGraph, not setGraphWithHistory: this fires when a Fly To
   * flight lands, so putting it in the undo stack would mean every flight
   * left an undo step nobody asked for, and Cmd+Z would rewind the camera
   * hand-off rather than the operator's last real edit.
   */
  const activateCameraNode = useCallback((nodeId: string) => {
    setGraph((prevGraph) => {
      const target = prevGraph.nodes.find((n) => n.id === nodeId);
      if (!target) return prevGraph;
      const isCameraLike = (type: string) => type === CAMERA_NODE.type || type === CAMERA_FLY_TO_NODE.type;
      if (!isCameraLike(target.type)) return prevGraph;
      if (target.params.active === true && prevGraph.nodes.every((n) => n.id === nodeId || !isCameraLike(n.type) || n.params.active !== true)) {
        // Already the sole active camera — returning the same graph keeps
        // this off the render path entirely.
        return prevGraph;
      }

      return {
        ...prevGraph,
        nodes: prevGraph.nodes.map((n) => {
          if (n.id === nodeId) return { ...n, params: { ...n.params, active: true } };
          if (isCameraLike(n.type)) return { ...n, params: { ...n.params, active: false } };
          return n;
        }),
      };
    });
  }, [setGraph]);

  const onEvaluatedResults = useCallback(
    (results: Map<string, Record<string, unknown>>) => {
      setEvaluatedResults(results);
      const requestedCanvas = consumeCanvasSwitchRequest();
      if (requestedCanvas !== null) switchCanvas(requestedCanvas);
      const handoff = consumeCameraHandoffRequest();
      if (handoff !== null) activateCameraNode(handoff);
    },
    [switchCanvas, activateCameraNode],
  );

  useEffect(() => {
    void maximizeMainWindow();
  }, []);

  useEffect(() => {
    if (keyframesEnabled && totalFrames > 0) {
      setCurrentFrame((prev) => Math.max(0, Math.min(totalFrames - 1, prev)));
    }
  }, [totalFrames, keyframesEnabled, setCurrentFrame]);

  useEffect(() => {
    if (!keyframesEnabled || !isPlaying || totalFrames <= 0) return;
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % totalFrames);
    }, 1000 / 60);
    return () => clearInterval(interval);
  }, [keyframesEnabled, isPlaying, totalFrames, setCurrentFrame]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          (activeEl as HTMLElement).isContentEditable);

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const code = e.code;

      if (!isInput && (code === "Space" || e.key === " ") && !isCmdOrCtrl) {
        e.preventDefault();
        if (keyframesEnabled) {
          setIsPlaying((prev) => !prev);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [keyframesEnabled]);

  const onToggleKeyframe = useCallback(
    (nodeId: string, paramKey: string, frame: number, currentValue: any) => {
      setGraph((prevGraph) => {
        const currentKeyframes = prevGraph.keyframes || {};
        const nodeKeyframes = currentKeyframes[nodeId] || {};
        const paramList = nodeKeyframes[paramKey] || [];

        const existingIndex = paramList.findIndex((k) => k.frame === frame);
        let nextList: Keyframe[];

        if (existingIndex >= 0) {
          nextList = paramList.filter((_, idx) => idx !== existingIndex);
        } else {
          const newKeyframe: Keyframe = { frame, value: serializeKeyframeValue(currentValue) };
          nextList = [...paramList, newKeyframe].sort((a, b) => a.frame - b.frame);
        }

        const nextNodeKeyframes = { ...nodeKeyframes };
        if (nextList.length > 0) {
          nextNodeKeyframes[paramKey] = nextList;
        } else {
          delete nextNodeKeyframes[paramKey];
        }

        const nextKeyframeStore = { ...currentKeyframes, [nodeId]: nextNodeKeyframes };
        if (Object.keys(nextNodeKeyframes).length === 0) {
          delete nextKeyframeStore[nodeId];
        }

        return {
          ...prevGraph,
          keyframes: nextKeyframeStore,
        };
      });
    },
    [],
  );

  // One epoch per session, not per edit — clock.ts's Time node just needs
  // both windows agreeing on a shared "when did frame 0 happen," there's no
  // discontinuous world state here to restart (unlike OpenVMap 2D's physics
  // epoch, which *does* get re-stamped on structural physics changes).
  const [epochMs] = useState(() => Date.now());
  const graphRef = useRef(graph);
  graphRef.current = graph;

  /**
   * Free the cached mesh/texture/toggle state of any node that has left the
   * graph, whatever made it leave.
   *
   * Node ids are stable — saved into the .ovm, restored identically by undo
   * — so a cache entry that outlives its node is not just a leak: the next
   * node to carry that id silently inherits it (see nodeCaches.ts). This
   * used to be handled in exactly one place, the editor's own onNodesDelete
   * callback, which meant every *other* way a node can vanish leaked: undo
   * of an add, redo of a delete, New, Open, or any programmatic graph
   * replacement. Reconciling against the graph itself covers all of them,
   * and needs no cooperation from whatever did the removing.
   */
  const knownNodeIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Across *every* canvas, not just the open one: a node in a canvas that
    // isn't on screen has not left the document, and reconciling against the
    // active canvas alone would free the meshes of all five others the
    // moment you switched — the exact opposite of what makes switching
    // instant.
    const currentIds = new Set(canvases.flatMap((canvas) => canvas.nodes.map((n) => n.id)));
    const departed = [...knownNodeIdsRef.current].filter((id) => !currentIds.has(id));
    if (departed.length > 0) disposeNodeCaches(departed);
    knownNodeIdsRef.current = currentIds;
  }, [canvases]);
  // Not React state on purpose — this changes at orbit-drag frequency, and
  // nothing in this component's own render output depends on it (only the
  // outgoing broadcast does). A state variable here would re-render
  // MainEditor's whole tree on every orbit tick for no visual benefit.
  const previewCameraRef = useRef<PreviewCameraPose | null>(null);

  const selectedInstance = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedDef = selectedInstance ? DEFAULT_REGISTRY.get(selectedInstance.type) : undefined;
  // Which node's calibration handles the output window should draw, if any —
  // broadcast alongside the graph so the operator can align against the
  // real room through the actual projection, not just the editor preview.
  const calibratingNodeId = selectedInstance && selectedInstance.type === CAMERA_NODE.type ? selectedInstance.id : null;
  // A selectable object with nothing to drag — worth telling the operator
  // why the gizmo didn't show up, rather than leaving it a silent no-op.
  const needsTransformHint =
    !!selectedInstance &&
    GIZMO_SELECTABLE_TYPES.includes(selectedInstance.type) &&
    resolveGizmoTarget(graph, selectedInstance.id) === null;

  // Handshake responder: an output window that opens after this one already
  // has state emits "output:ready" on mount; this answers with current
  // state, previewCameraRef included so a late-opened output window gets
  // the editor's current view immediately rather than a stale default.
  useEffect(
    () =>
      startBroadcasting(() => ({
        graph: graphRef.current,
        epochMs,
        calibratingNodeId,
        previewCamera: previewCameraRef.current,
      })),
    [epochMs, calibratingNodeId],
  );
  // Push broadcast on every structural graph change or calibration-target
  // change — not per frame; each window's own render loop derives per-frame
  // animation locally from the shared epoch (see clock.ts), so this is the
  // only IPC that happens on its own. The camera pose broadcasts
  // separately, imperatively, from onPreviewCameraChange below — it
  // changes at orbit-drag frequency, entirely decoupled from graph edits.
  useEffect(() => {
    broadcastGraph({ graph, epochMs, calibratingNodeId, previewCamera: previewCameraRef.current });
  }, [graph, epochMs, calibratingNodeId]);

  // Video mapping wires up a Camera node and the output locks to its
  // calibrated pose — orbiting here must never disturb that (see
  // Viewport.tsx's calibrationMatrix branch). Motion design has no
  // projector to align against; there the output is a preview monitor, and
  // mirroring whatever the editor is currently looking at (Blender's
  // viewport/render relationship) beats a fixed angle nobody chose. The
  // output window itself decides which of the two applies — it already
  // knows whether a Camera node exists — this just keeps it fed either way.
  const onPreviewCameraChange = (pose: PreviewCameraPose) => {
    previewCameraRef.current = pose;
    broadcastGraph({ graph: graphRef.current, epochMs, calibratingNodeId, previewCamera: pose });
  };

  /**
   * Undo history per canvas, keyed by canvas index. Cmd+Z after switching
   * canvases undoes the last edit made *in the canvas you're looking at* —
   * a single shared stack would have reached back into a tree that isn't on
   * screen, undoing something invisible.
   */
  const historyRef = useRef<Record<number, { past: Graph[]; future: Graph[] }>>({});
  const canvasHistory = useCallback(() => {
    const index = activeCanvasRef.current;
    return (historyRef.current[index] ??= { past: [], future: [] });
  }, []);
  /**
   * Which (node, param) a run of edits is currently touching, so one slider
   * drag or one typed number collapses into a single undo step. Without it
   * every wheel notch pushed its own snapshot and a couple of drags evicted
   * the whole 50-entry history.
   */
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);

  /**
   * Records the graph as it is *right now* as one undo step.
   *
   * Deliberately outside any `setGraph` updater: React invokes updaters twice
   * under StrictMode, so pushing from inside recorded every edit twice and
   * undo needed two presses per change in dev. Updaters have to stay pure.
   */
  const pushHistory = useCallback((coalesceKey?: string) => {
    const now = Date.now();
    const previous = coalesceRef.current;
    coalesceRef.current = coalesceKey ? { key: coalesceKey, at: now } : null;

    // Still dialling the same control — fold into the step already recorded.
    if (coalesceKey && previous && previous.key === coalesceKey && now - previous.at < HISTORY_COALESCE_MS) return;

    const history = canvasHistory();
    const snapshot = cloneGraph(graphRef.current);
    const top = history.past[history.past.length - 1];
    // Several edits can land in one event batch, before graphRef has caught
    // up — without this they'd each store the same pre-batch graph.
    if (top && JSON.stringify(top) === JSON.stringify(snapshot)) return;

    history.past.push(snapshot);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];
  }, [canvasHistory]);

  const setGraphWithHistory = useCallback(
    (nextGraphOrUpdater: Graph | ((prev: Graph) => Graph), coalesceKey?: string) => {
      pushHistory(coalesceKey);
      setGraph((prev) => (typeof nextGraphOrUpdater === "function" ? nextGraphOrUpdater(prev) : nextGraphOrUpdater));
    },
    [pushHistory, setGraph],
  );

  const undo = useCallback(() => {
    const history = canvasHistory();
    if (history.past.length === 0) return;
    const previous = history.past.pop()!;
    history.future.unshift(cloneGraph(graphRef.current));
    coalesceRef.current = null;
    setGraph(previous);
    setEditorKey((k) => k + 1);
  }, [canvasHistory, setGraph]);

  const redo = useCallback(() => {
    const history = canvasHistory();
    if (history.future.length === 0) return;
    const next = history.future.shift()!;
    history.past.push(cloneGraph(graphRef.current));
    coalesceRef.current = null;
    setGraph(next);
    setEditorKey((k) => k + 1);
  }, [canvasHistory, setGraph]);

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

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      if (isCmdOrCtrl && key === "z") {
        if (isShift) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if (isCmdOrCtrl && key === "y") {
        e.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  const handleLoadProject = (newProject: Project, filename?: string) => {
    historyRef.current = {};
    const rehydrated = normalizeCanvases(newProject.canvases).map((canvas) =>
      rehydrateGraphParams(canvas, DEFAULT_REGISTRY),
    );
    setCanvases(rehydrated);
    setActiveCanvas(newProject.activeCanvas);
    activeCanvasRef.current = newProject.activeCanvas;
    setCurrentFrames(new Array(CANVAS_COUNT).fill(0));
    setSelectedNodeId(null);
    setEditorKey((k) => k + 1);
    if (filename) {
      setCurrentFilename(filename);
    }
    // File-backed nodes (CSV Reader, OBJ Model, Image Texture, Audio
    // Player, ...) only store the picked path in the graph, never the
    // loaded data itself — see rehydrateFileNodesFromDisk. Re-read every
    // such file from disk, then nudge state so the param panel (column
    // dropdowns, filenames) refreshes once the data lands; evaluate()
    // itself already re-reads each node's cache live every tick, so the
    // 3D view/audio alone would've caught up on their own. Every canvas is
    // re-read, not just the open one: switching to another canvas later must
    // not be the moment its files start loading.
    for (const canvas of rehydrated) {
      rehydrateFileNodesFromDisk(canvas).then((changed) => {
        if (changed) setCanvases((prev) => [...prev]);
      });
    }
  };

  const handleFilenameChange = (name: string, path: string | null) => {
    setCurrentFilename(name);
    setCurrentFilePath(path);
  };

  const onParamChange = (paramId: string, value: unknown, targetNodeId?: string) => {
    const nodeIdToUpdate = targetNodeId ?? selectedNodeId;
    setGraphWithHistory((prevGraph) => {
      const instance = prevGraph.nodes.find((n) => n.id === nodeIdToUpdate);
      if (!instance) return prevGraph;

      const isActivatingCamera =
        (instance.type === CAMERA_NODE.type || instance.type === CAMERA_FLY_TO_NODE.type) &&
        paramId === "active" &&
        (value === true || value === 1);

      const nextKeyframes =
        keyframesEnabled && currentFrame >= 0 && nodeIdToUpdate
          ? applyKeyframedParamUpdate(prevGraph.keyframes, nodeIdToUpdate, paramId, value, currentFrame)
          : prevGraph.keyframes;

      let nextParams = { ...instance.params };
      if (value instanceof THREE.Vector3) {
        nextParams[paramId] = value.clone();
      } else if (typeof value === "object" && value !== null) {
        nextParams[paramId] = JSON.parse(JSON.stringify(value));
      } else {
        nextParams[paramId] = value;
      }

      // A lattice's control points are stored as absolute positions, so the
      // grid they describe has to be rebuilt when its dimensions change —
      // the node's own evaluate is pure and cannot write them back. See
      // latticeParamsWithRebuiltGrid.
      if (
        instance.type === LATTICE_DEFORM_NODE.type &&
        (LATTICE_GRID_PARAM_IDS as readonly string[]).includes(paramId)
      ) {
        nextParams = latticeParamsWithRebuiltGrid(nextParams);
      }

      return {
        ...prevGraph,
        keyframes: nextKeyframes,
        nodes: prevGraph.nodes.map((n) => {
          if (n.id === instance.id) {
            return { ...n, params: nextParams };
          }
          if (isActivatingCamera && (n.type === CAMERA_NODE.type || n.type === CAMERA_FLY_TO_NODE.type)) {
            return { ...n, params: { ...n.params, active: false } };
          }
          return n;
        }),
      };
    }, `${nodeIdToUpdate}:${paramId}`);
  };

  // Same functional-updater reasoning as onParamChange, but writing all
  // three fields in one setGraph call rather than three separate
  // onParamChange calls — the gizmo fires this every frame of a drag, and
  // three sequential setGraph calls would hit the exact stale-closure
  // overwrite bug that onParamChange's own comment documents, just via a
  // different call site.
  /**
   * Everything about the graph except where the nodes sit on the canvas.
   *
   * GraphEditor commits on every frame of a node drag, so without this a
   * single drag across the canvas pushed dozens of undo steps and evicted the
   * real history. Two commits sharing this signature differ only by position
   * — one continuous move — so they collapse into one step, while a delete,
   * a rewire or an added node changes it and starts a fresh one.
   */
  const structuralKey = useCallback(
    (g: Graph) =>
      JSON.stringify([g.nodes.map((n) => [n.id, n.type]), g.connections.map((c) => c.id)]),
    [],
  );

  const onGraphChange = useCallback(
    (next: Graph) =>
      setGraphWithHistory(
        (prev) => ({
          ...next,
          keyframes: next.keyframes ?? prev.keyframes ?? {},
          markers: next.markers ?? prev.markers ?? [],
        }),
        `structure:${structuralKey(next)}`,
      ),
    [setGraphWithHistory, structuralKey],
  );

  // A gizmo drag writes every frame, so it records its undo step once when
  // the drag *starts* instead. Before this it went through plain setGraph and
  // was simply not undoable at all — Cmd+Z after moving an object skipped
  // straight past it to some older edit.
  const onTransformStart = useCallback(() => pushHistory(), [pushHistory]);

  const onTransformChange = (transformNodeId: string, patch: TransformPatch) => {
    setGraph((prevGraph) => {
      // Same keyframe-track-if-one-already-exists rule as onParamChange —
      // otherwise a gizmo drag (or "Aligner Caméra", which reuses this same
      // path) always wrote straight to the base param, which keyframe
      // playback then overrode right back on the next frame: no way to pose
      // a camera (or any keyframed object) differently at different times
      // by dragging it, only by typing numbers into the param panel field
      // by field. Each patch entry (location/rotation/scale, or fov from
      // the align button) is checked independently.
      let nextKeyframes = prevGraph.keyframes;
      if (keyframesEnabled && currentFrame >= 0) {
        for (const [key, value] of Object.entries(patch)) {
          nextKeyframes = applyKeyframedParamUpdate(nextKeyframes, transformNodeId, key, value, currentFrame);
        }
      }

      return {
        ...prevGraph,
        keyframes: nextKeyframes,
        nodes: prevGraph.nodes.map((n) =>
          n.id === transformNodeId ? { ...n, params: { ...n.params, ...patch } } : n,
        ),
      };
    });
  };

  const onSplitHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingSplit.current = true;
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingSplit.current || !containerRef.current) return;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, percent)));
    }
    function onMouseUp() {
      if (draggingSplit.current) {
        draggingSplit.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const selectedParamValues =
    selectedInstance && selectedDef
      ? paramPanelValues(graph, selectedInstance, selectedDef, evaluatedResults)
      : {};

  const selectedKeyframeFrames = selectedNodeId && graph.keyframes?.[selectedNodeId]
    ? Array.from(
        new Set(
          Object.values(graph.keyframes[selectedNodeId])
            .flat()
            .map((k) => k.frame)
        )
      ).sort((a, b) => a - b)
    : [];

  const onToggleMarker = useCallback((frame: number) => {
    setGraphWithHistory((prevGraph) => {
      const currentMarkers = prevGraph.markers || [];
      const idx = currentMarkers.indexOf(frame);
      let nextMarkers: number[];
      if (idx >= 0) {
        nextMarkers = currentMarkers.filter((m) => m !== frame);
      } else {
        nextMarkers = [...currentMarkers, frame].sort((a, b) => a - b);
      }
      return { ...prevGraph, markers: nextMarkers };
    }, `marker:toggle:${frame}`);
  }, [setGraphWithHistory]);

  const onMoveMarker = useCallback((oldFrame: number, newFrame: number) => {
    setGraphWithHistory((prevGraph) => {
      const currentMarkers = prevGraph.markers || [];
      const filtered = currentMarkers.filter((m) => m !== oldFrame && m !== newFrame);
      const nextMarkers = [...filtered, newFrame].sort((a, b) => a - b);
      return { ...prevGraph, markers: nextMarkers };
    }, `marker:move:${oldFrame}->${newFrame}`);
  }, [setGraphWithHistory]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <TopBar
        project={project}
        onLoadProject={handleLoadProject}
        currentFilename={currentFilename}
        currentFilePath={currentFilePath}
        onFilenameChange={handleFilenameChange}
        onUndo={undo}
        onRedo={redo}
      />
      <div style={{ height: `${splitPercent}%`, minHeight: 0, position: "relative" }}>
        <SplitViewport
          graph={graph}
          registry={DEFAULT_REGISTRY}
          renderNodeId={findRenderNodeId(graph) ?? ""}
          epochMs={epochMs}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onTransformChange={onTransformChange}
          onTransformStart={onTransformStart}
          onCameraChange={onPreviewCameraChange}
          currentFrame={keyframesEnabled ? currentFrame : -1}
          onEvaluatedResults={onEvaluatedResults}
          isPlaying={isPlaying}
        />
        {needsTransformHint && (
          <div className="viewport-hint">Wire a Transform node into this object's Matrix to move it</div>
        )}
        {selectedInstance &&
          selectedInstance.type === CAMERA_NODE.type &&
          selectedInstance.params.mode === "calibrated" && (
            <CalibrationOverlay
              graph={graph}
              cameraNodeId={selectedInstance.id}
              storedPicks={selectedInstance.params.calibrationPicks}
              mode={selectedInstance.params.mode ?? DEFAULT_REGISTRY.get(selectedInstance.type)?.defaultParams.mode}
              onChange={onParamChange}
            />
          )}
        {selectedInstance && selectedDef && (
          <ParamPanel
            nodeId={selectedInstance.id}
            label={selectedDef.label}
            category={selectedDef.category}
            fields={
              selectedDef.dynamicParamFields
                ? selectedDef.dynamicParamFields(selectedInstance)
                : (selectedDef.paramFields ?? [])
            }
            params={selectedParamValues}
            keyframes={graph.keyframes}
            currentFrame={keyframesEnabled ? currentFrame : -1}
            keyframesEnabled={keyframesEnabled}
            onChange={onParamChange}
            onToggleKeyframe={onToggleKeyframe}
            connectedSockets={connectedSocketIds(graph, selectedInstance.id)}
          />
        )}
      </div>
      <TimelineBar
        currentFrame={currentFrame}
        totalFrames={totalFrames}
        isPlaying={isPlaying}
        keyframesEnabled={keyframesEnabled}
        selectedKeyframeFrames={selectedKeyframeFrames}
        markers={graph.markers ?? []}
        onToggleMarker={onToggleMarker}
        onMoveMarker={onMoveMarker}
        onFrameChange={setCurrentFrame}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onSplitHandleMouseDown={onSplitHandleMouseDown}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphEditor
          key={`${activeCanvas}:${editorKey}`}
          graph={graph}
          registry={DEFAULT_REGISTRY}
          onGraphChange={onGraphChange}
          onSelectNode={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
          canvasCount={CANVAS_COUNT}
          activeCanvas={activeCanvas}
          emptyCanvases={canvases.map(isCanvasEmpty)}
          onSelectCanvas={switchCanvas}
        />
      </div>
    </div>
  );
}

export default App;

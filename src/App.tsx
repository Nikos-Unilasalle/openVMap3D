import { useCallback, useEffect, useRef, useState } from "react";
import { CAMERA_NODE } from "./shared/graph/nodes/camera";
import { DEFAULT_REGISTRY } from "./shared/graph/nodes";
import { findRenderNodeId } from "./shared/graph/nodes/render";
import { cloneGraph } from "./shared/graph/cloneGraph";
import { rehydrateGraphParams } from "./shared/graph/rehydrateParams";
import { Connection, Graph, NodeInstance } from "./shared/graph/types";
import { broadcastGraph, PreviewCameraPose, startBroadcasting } from "./shared/ipc";
import { TransformPatch, Viewport } from "./shared/three/Viewport";
import "./shared/three/viewport.css";
import { GIZMO_SELECTABLE_TYPES, resolveGizmoTarget } from "./shared/graph/transformLookup";
import { CalibrationOverlay } from "./windows/CalibrationOverlay";
import { GraphEditor } from "./windows/GraphEditor";
import { OutputWindow } from "./windows/OutputWindow";
import { ParamPanel } from "./windows/ParamPanel";
import { TopBar } from "./windows/TopBar";

function node(id: string, type: string, position: { x: number; y: number }, params: Record<string, unknown> = {}): NodeInstance {
  return { id, type, params, position };
}

function edge(fromNode: string, fromSocket: string, toNode: string, toSocket: string): Connection {
  return { id: `${fromNode}.${fromSocket}->${toNode}.${toSocket}`, fromNode, fromSocket, toNode, toSocket };
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
  const [graph, setGraph] = useState<Graph>(buildSmokeTestGraph);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [currentFilename, setCurrentFilename] = useState("project_v1.ovm");
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingSplit = useRef(false);

  // One epoch per session, not per edit — clock.ts's Time node just needs
  // both windows agreeing on a shared "when did frame 0 happen," there's no
  // discontinuous world state here to restart (unlike OpenVMap 2D's physics
  // epoch, which *does* get re-stamped on structural physics changes).
  const [epochMs] = useState(() => Date.now());
  const graphRef = useRef(graph);
  graphRef.current = graph;
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

  const historyRef = useRef<{ past: Graph[]; future: Graph[] }>({ past: [], future: [] });
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

    const snapshot = cloneGraph(graphRef.current);
    const top = historyRef.current.past[historyRef.current.past.length - 1];
    // Several edits can land in one event batch, before graphRef has caught
    // up — without this they'd each store the same pre-batch graph.
    if (top && JSON.stringify(top) === JSON.stringify(snapshot)) return;

    historyRef.current.past.push(snapshot);
    if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
    historyRef.current.future = [];
  }, []);

  const setGraphWithHistory = useCallback(
    (nextGraphOrUpdater: Graph | ((prev: Graph) => Graph), coalesceKey?: string) => {
      pushHistory(coalesceKey);
      setGraph((prev) => (typeof nextGraphOrUpdater === "function" ? nextGraphOrUpdater(prev) : nextGraphOrUpdater));
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    if (historyRef.current.past.length === 0) return;
    const previous = historyRef.current.past.pop()!;
    historyRef.current.future.unshift(cloneGraph(graphRef.current));
    coalesceRef.current = null;
    setGraph(previous);
    setEditorKey((k) => k + 1);
  }, []);

  const redo = useCallback(() => {
    if (historyRef.current.future.length === 0) return;
    const next = historyRef.current.future.shift()!;
    historyRef.current.past.push(cloneGraph(graphRef.current));
    coalesceRef.current = null;
    setGraph(next);
    setEditorKey((k) => k + 1);
  }, []);

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

  const handleLoadGraph = (newGraph: Graph, filename?: string) => {
    historyRef.current = { past: [], future: [] };
    setGraph(rehydrateGraphParams(newGraph, DEFAULT_REGISTRY));
    setSelectedNodeId(null);
    setEditorKey((k) => k + 1);
    if (filename) {
      setCurrentFilename(filename);
    }
  };

  const handleFilenameChange = (name: string, path: string | null) => {
    setCurrentFilename(name);
    setCurrentFilePath(path);
  };

  const onParamChange = (paramId: string, value: unknown) => {
    setGraphWithHistory((prevGraph) => {
      const instance = prevGraph.nodes.find((n) => n.id === selectedNodeId);
      if (!instance) return prevGraph;
      return {
        ...prevGraph,
        nodes: prevGraph.nodes.map((n) =>
          n.id === instance.id ? { ...n, params: { ...n.params, [paramId]: value } } : n,
        ),
      };
    }, `${selectedNodeId}:${paramId}`);
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
    (next: Graph) => setGraphWithHistory(next, `structure:${structuralKey(next)}`),
    [setGraphWithHistory, structuralKey],
  );

  // A gizmo drag writes every frame, so it records its undo step once when
  // the drag *starts* instead. Before this it went through plain setGraph and
  // was simply not undoable at all — Cmd+Z after moving an object skipped
  // straight past it to some older edit.
  const onTransformStart = useCallback(() => pushHistory(), [pushHistory]);

  const onTransformChange = (transformNodeId: string, patch: TransformPatch) => {
    setGraph((prevGraph) => ({
      ...prevGraph,
      nodes: prevGraph.nodes.map((n) =>
        n.id === transformNodeId ? { ...n, params: { ...n.params, ...patch } } : n,
      ),
    }));
  };

  const onSplitHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingSplit.current = true;
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!draggingSplit.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientY - rect.top) / rect.height) * 100;
      setSplitPercent(Math.min(MAX_PANE_PERCENT, Math.max(MIN_PANE_PERCENT, percent)));
    }
    function onMouseUp() {
      draggingSplit.current = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <TopBar
        graph={graph}
        onLoadGraph={handleLoadGraph}
        currentFilename={currentFilename}
        currentFilePath={currentFilePath}
        onFilenameChange={handleFilenameChange}
        onUndo={undo}
        onRedo={redo}
      />
      <div style={{ height: `${splitPercent}%`, minHeight: 0, position: "relative" }}>
        <Viewport
          graph={graph}
          registry={DEFAULT_REGISTRY}
          renderNodeId={findRenderNodeId(graph) ?? ""}
          epochMs={epochMs}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onTransformChange={onTransformChange}
          onTransformStart={onTransformStart}
          onCameraChange={onPreviewCameraChange}
        />
        {needsTransformHint && (
          <div className="viewport-hint">Wire a Transform node into this object's Matrix to move it</div>
        )}
        {selectedInstance && selectedInstance.type === CAMERA_NODE.type && (
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
            params={{ ...selectedDef.defaultParams, ...selectedInstance.params }}
            onChange={onParamChange}
          />
        )}
      </div>
      <div
        onMouseDown={onSplitHandleMouseDown}
        style={{ height: 6, flexShrink: 0, cursor: "row-resize", background: "#2c333f" }}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <GraphEditor
          key={editorKey}
          graph={graph}
          registry={DEFAULT_REGISTRY}
          onGraphChange={onGraphChange}
          onSelectNode={setSelectedNodeId}
          selectedNodeId={selectedNodeId}
        />
      </div>
    </div>
  );
}

export default App;

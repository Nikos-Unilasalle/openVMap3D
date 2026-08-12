import { useEffect, useRef } from "react";
import * as THREE from "three";
import { evaluateGraph } from "../graph/evaluate";
import { Graph, NodeRegistry } from "../graph/types";
import { ClockState, createClock, tickClock } from "../graph/clock";

interface ViewportProps {
  graph: Graph;
  registry: NodeRegistry;
  /** Which node in the graph is the terminal `render` node whose output gets drawn. */
  renderNodeId: string;
  /**
   * Ms epoch the graph's clock counts steps from — see clock.ts. Defaults to
   * mount time. Single window today; once an output-window split exists,
   * this is the one value that has to come from outside (broadcast once),
   * everything else derives locally.
   */
  epochMs?: number;
}

/**
 * Owns the three.js renderer/scene/camera and the per-frame evaluate-and-draw
 * loop. Mirrors OpenVMap's SceneRenderer.tsx: refs for the latest graph/
 * registry (so the running RAF loop always reads current data without the
 * effect re-running and tearing down the GL context on every edit),
 * ResizeObserver instead of a fixed size, explicit renderer.dispose() on
 * unmount.
 *
 * Lighting is hardcoded here today (ambient + one directional), not
 * graph-authored — BIBLE.md wants a `Light` node, but Render only accepts a
 * single Geometry input for now (see render.ts), so a light and the object
 * it lights can't both flow into it yet. Move lighting into the graph once
 * Render (or Sequence feeding it) fans in more than one object.
 */
export function Viewport({ graph, registry, renderNodeId, epochMs }: ViewportProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const registryRef = useRef(registry);
  registryRef.current = registry;
  const renderNodeIdRef = useRef(renderNodeId);
  renderNodeIdRef.current = renderNodeId;

  useEffect(() => {
    if (!hostRef.current) return;
    // Rebound to a fresh const: TS narrows `hostRef.current` to non-null at
    // this line, but that narrowing doesn't reliably survive into the nested
    // closures below (resize, tick) since they're hoisted function
    // declarations — a plain, separately-typed binding sidesteps that.
    const host: HTMLDivElement = hostRef.current;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1117);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0, 0);

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
        // A bug in a specific node is already caught inside evaluateGraph;
        // this is the backstop for something evaluateGraph itself couldn't
        // anticipate (e.g. a malformed graph object) — must not take the
        // render loop down, or the output goes silently, permanently black.
        console.error("graph evaluation failed", err);
        frameId = requestAnimationFrame(tick);
        return;
      }

      const output = results.get(renderNodeIdRef.current)?.geometry;
      const nextObject = output instanceof THREE.Object3D ? output : null;
      if (nextObject !== currentObject) {
        if (currentObject) scene.remove(currentObject);
        if (nextObject) scene.add(nextObject);
        currentObject = nextObject;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // Deliberately not depending on graph/registry/renderNodeId: those are
    // read through refs every frame so editing the graph doesn't tear down
    // and recreate the WebGL context — only remount (mount/unmount) should.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epochMs]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
}

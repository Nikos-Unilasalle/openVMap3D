import * as THREE from "three";
import { evaluateGraph } from "../graph/evaluate";
import { resolveSceneRoots } from "../graph/sceneRoots";
import { DEFAULT_REGISTRY, RENDER_NODE } from "../graph/nodes";
import { STEP_SECONDS } from "../graph/clock";
import { Graph, NodeRegistry } from "../graph/types";
import { captureAnimatedScene, captureScene } from "./sceneSnapshot";
import { buildFolderIndexHtml, buildStandalonePageHtml } from "./exportStandalonePage";
import { collectTextures, encodeTextureToPng, textureFileMapFrom } from "./textureCapture";

/**
 * Snapshots the graph's current frame (t=0, same as a freshly opened
 * project) into a standalone HTML page. Reuses `resolveSceneRoots` — the
 * same "what actually ends up in the viewport" logic Viewport.tsx's own
 * tick() runs — so a node whose geometry got consumed by a Merge/Array/
 * Spawner isn't captured twice as both itself and inside its owner.
 */
export function exportSceneAsStandaloneHtml(graph: Graph, title = "OpenVMap3D Scene", registry: NodeRegistry = DEFAULT_REGISTRY): string {
  const results = evaluateGraph(graph, registry, { time: 0, step: 0, nodeId: "" });
  const rootIds = resolveSceneRoots(graph, registry);

  const roots: THREE.Object3D[] = [];
  for (const nodeId of rootIds) {
    const geometry = results.get(nodeId)?.geometry;
    if (geometry instanceof THREE.Object3D) roots.push(geometry);
  }

  const snapshot = captureScene(roots);
  return buildStandalonePageHtml(snapshot, title);
}

export interface FolderExportFile {
  /** Relative to the export folder's root — "index.html", "scene.js", "textures/tex_0.png", ... */
  path: string;
  data: Uint8Array | string;
}

function collectMaterials(object: THREE.Object3D, out: THREE.Material[]): void {
  if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
    const mat = Array.isArray(object.material) ? object.material[0] : object.material;
    if (mat) out.push(mat);
  }
  for (const child of object.children) collectMaterials(child, out);
}

/**
 * The "complete export" path: a folder (index.html + scene.js + textures/)
 * instead of one inlined file — see exportStandalonePage.ts's
 * buildFolderIndexHtml doc for why textures/scene data ship as sibling
 * files rather than fetch()'d. When a Render node exists in the graph, its
 * frameCount/fps drive a baked transform animation (captureAnimatedScene —
 * per-frame position/rotation/scale only, not per-frame geometry rebuilds;
 * see that function's own doc for the exact scope); with no Render node
 * this degrades to a single static frame, same output as
 * exportSceneAsStandaloneHtml's scene capture.
 */
export async function exportSceneAsFolder(
  graph: Graph,
  title = "OpenVMap3D Scene",
  registry: NodeRegistry = DEFAULT_REGISTRY,
): Promise<FolderExportFile[]> {
  const rootIds = resolveSceneRoots(graph, registry);
  const renderNode = graph.nodes.find((n) => n.type === RENDER_NODE.type);
  const frameCount = renderNode ? Math.max(1, Math.floor(Number(renderNode.params?.frameCount) || 1)) : 1;
  const fps = renderNode ? Math.max(1, Number(renderNode.params?.fps) || 30) : 30;

  // Re-evaluates the graph for one frame and reads its scene-root objects
  // straight off that evaluation — called lazily, one frame at a time, by
  // captureAnimatedScene below (never precomputed into an array up front):
  // many nodes hand back the SAME cached Object3D instance across
  // evaluations, mutated in place, so an array of "roots per frame" built
  // ahead of time would end up with every slot pointing at the identical,
  // by-then-overwritten object — see sceneSnapshot.ts's appendAnimatedFrame
  // doc for the full story.
  const evalFrame = (frame: number): THREE.Object3D[] => {
    const time = frame / fps;
    const results = evaluateGraph(graph, registry, {
      time,
      step: Math.round(time / STEP_SECONDS),
      nodeId: "",
      currentFrame: frame,
      keyframes: graph.keyframes,
    });
    const roots: THREE.Object3D[] = [];
    for (const nodeId of rootIds) {
      const geometry = results.get(nodeId)?.geometry;
      if (geometry instanceof THREE.Object3D) roots.push(geometry);
    }
    return roots;
  };

  const frame0Roots = evalFrame(0);

  // Geometry/material are captured from frame 0 only (see
  // captureAnimatedScene's doc), so textures only need collecting there too.
  const materials: THREE.Material[] = [];
  for (const root of frame0Roots) collectMaterials(root, materials);
  const collected = collectTextures(materials);
  const textureFileMap = textureFileMapFrom(collected);

  const snapshot =
    frameCount > 1
      ? captureAnimatedScene(frameCount, (frame) => (frame === 0 ? frame0Roots : evalFrame(frame)), textureFileMap)
      : captureScene(frame0Roots, textureFileMap);

  const files: FolderExportFile[] = [];
  for (const { texture, fileName } of collected) {
    const bytes = await encodeTextureToPng(texture);
    files.push({ path: `textures/${fileName}`, data: bytes });
  }

  files.push({ path: "scene.js", data: `window.__OVM_SCENE__ = ${JSON.stringify(snapshot)};\nwindow.__OVM_FPS__ = ${fps};\n` });
  files.push({ path: "index.html", data: buildFolderIndexHtml(title) });

  return files;
}

/**
 * Registry of every per-node cache, so deleting a node can actually drop the
 * state it owned.
 *
 * Nodes that own something a pure `evaluate` can't hand back fresh each frame
 * — a THREE.Mesh the viewport keeps in its scene, a loaded texture, a
 * flip-flop's remembered state — keep it in a module-level Map keyed by the
 * node's id (see the `EvalContext.nodeId` doc). Nothing used to clear those
 * on deletion, which was more than the memory leak it was filed as: node ids
 * are *stable*, saved into .ovm files and restored identically by undo, so a
 * node that came back with its old id silently picked its old mesh, texture
 * or toggle state back out of the cache. Deleting a node and re-adding it
 * looked like it "remembered" the previous values because it genuinely did.
 *
 * Caches keyed by anything other than a node id (a sprite name, a file path)
 * must NOT be registered here — they are shared across nodes on purpose.
 */

type NodeCacheDisposer = (nodeId: string) => void;

const disposers: NodeCacheDisposer[] = [];

/**
 * A Map keyed by node id that cleans up after itself. `disposeValue` is for
 * entries holding GPU resources that need an explicit release (geometry,
 * material, render target); omit it for plain state.
 */
export function createNodeCache<T>(disposeValue?: (value: T) => void): Map<string, T> {
  const cache = new Map<string, T>();
  disposers.push((nodeId) => {
    const value = cache.get(nodeId);
    if (value === undefined) return;
    if (disposeValue) {
      try {
        disposeValue(value);
      } catch {
        // A failed release must not stop the other caches from clearing.
      }
    }
    cache.delete(nodeId);
  });
  return cache;
}

/** Drops every cached resource belonging to these nodes. Call when nodes are deleted from the graph. */
export function disposeNodeCaches(nodeIds: Iterable<string>): void {
  for (const nodeId of nodeIds) {
    for (const dispose of disposers) dispose(nodeId);
  }
}

/**
 * Per-node state that must additionally be split per evaluation session —
 * several viewports evaluate the same graph on their own clocks (editor
 * pane, split preview, the offscreen export one), so an edge detector sharing
 * one slot across panes loses the second pane's rising edges: the first pane
 * updates `prev`, and the second pane reads prev === current. The Matrix
 * Delay node established this two-level key; this is its shared form. The
 * outer key stays the node id so `disposeNodeCaches` still drops everything.
 */
export function createSessionCache<T>(): Map<string, Map<string, T>> {
  return createNodeCache<Map<string, T>>();
}

/** Get-or-create this node's state for one session, mutating it in place. */
export function sessionState<T>(
  cache: Map<string, Map<string, T>>,
  nodeId: string,
  sessionId: string,
  init: () => T,
): T {
  let bySession = cache.get(nodeId);
  if (!bySession) {
    bySession = new Map();
    cache.set(nodeId, bySession);
  }
  let state = bySession.get(sessionId);
  if (!state) {
    state = init();
    bySession.set(sessionId, state);
  }
  return state;
}

/** Frees a mesh-like object's GPU resources — the common disposer for scene-object caches. */
export function disposeObject3D(object: { traverse: (cb: (o: any) => void) => void }): void {
  object.traverse((child: any) => {
    child.geometry?.dispose?.();
    const material = child.material;
    const disposeMaterial = (m: any) => {
      if (!m) return;
      // The texture slots a material owns go with it. A texture shared with
      // another live material is safe to dispose here anyway: three.js
      // re-uploads it from its (still-alive) source on next use, so the
      // worst case is one re-upload, never a broken material.
      m.map?.dispose?.();
      m.normalMap?.dispose?.();
      m.roughnessMap?.dispose?.();
      m.emissiveMap?.dispose?.();
      m.aoMap?.dispose?.();
      m.dispose?.();
    };
    if (Array.isArray(material)) material.forEach(disposeMaterial);
    else disposeMaterial(material);
  });
}

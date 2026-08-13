import { createNodeCache } from "./nodeCaches";
type Listener = () => void;

const values = createNodeCache<unknown>();
const listeners = new Set<Listener>();

export function setInspectorValue(nodeId: string, value: unknown) {
  if (values.get(nodeId) !== value) {
    values.set(nodeId, value);
    listeners.forEach((l) => l());
  }
}

export function getInspectorValue(nodeId: string): unknown {
  return values.get(nodeId);
}

export function subscribeInspector(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

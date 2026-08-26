/**
 * Whether we're running inside the Tauri shell rather than a plain browser —
 * the difference between having real filesystem access and not.
 *
 * Its own module, with no imports, on purpose. This one-liner was previously
 * duplicated in `graph/storage.ts` and `ipc.ts`, both of which pull in the
 * whole node registry; anything under `graph/nodes/` that needed the check
 * therefore couldn't reach it without importing its own registry back through
 * a cycle, which leaves the registry half-built at module-init time. A leaf
 * module is importable from anywhere.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

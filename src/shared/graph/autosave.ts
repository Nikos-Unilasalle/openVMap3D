/**
 * Crash/refresh insurance for the browser build.
 *
 * The desktop app has a real file on disk behind Save; the web build at
 * tsuji.xyz had nothing at all — no localStorage, no unload guard — so a
 * reload, a closed tab or a crashed GPU process threw away an entire session's
 * work with no warning. This keeps the last state of the document in
 * localStorage and hands it back on the next load.
 *
 * It is a safety net, not a save system: it holds exactly one document (the
 * one you were last editing) and an explicit Save is still what produces a
 * file you own. `.tsuji` remains the format — the payload here is the same
 * JSON serializeProject writes, so a recovered document and a saved one are
 * byte-identical.
 */

import { deserializeProject, serializeProject } from "./storage";
import { NodeRegistry, Project } from "./types";
import { DEFAULT_REGISTRY } from "./nodes";

const AUTOSAVE_KEY = "tsuji.autosave.v1";

/**
 * localStorage caps out around 5 MB per origin in most engines. A graph is
 * plain JSON and rarely comes close, but a very large one would throw
 * QuotaExceededError mid-write and (in some engines) leave the key holding a
 * truncated value — so oversized documents are skipped rather than written
 * badly, and the previous good snapshot is left alone.
 */
const MAX_AUTOSAVE_BYTES = 4_000_000;

export interface AutosaveRecord {
  project: Project;
  filename: string;
  /** Epoch ms of the write, for the "recovered from …" message. */
  savedAt: number;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Safari in private mode, or a hardened webview: localStorage exists but
    // touching it throws. No autosave there, and nothing else breaks.
    return null;
  }
}

/**
 * Writes the document. Returns the serialized payload on success (the caller
 * uses it as the "what's on disk now" snapshot for dirty tracking), or null if
 * nothing was written.
 */
export function writeAutosave(project: Project, filename: string): string | null {
  const store = storage();
  if (!store) return null;
  let serialized: string;
  try {
    serialized = serializeProject(project);
  } catch {
    return null;
  }
  if (serialized.length > MAX_AUTOSAVE_BYTES) return null;
  try {
    store.setItem(
      AUTOSAVE_KEY,
      JSON.stringify({ filename, savedAt: Date.now(), project: serialized }),
    );
  } catch {
    // Quota, or a storage-disabled context. The in-memory document is
    // untouched; the user just doesn't get the safety net this time.
    return null;
  }
  return serialized;
}

/**
 * The stored document, or null if there is none (or it can't be read — a
 * snapshot written by an incompatible build is dropped rather than crashing
 * the editor on boot).
 */
export function readAutosave(registry: NodeRegistry = DEFAULT_REGISTRY): AutosaveRecord | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw);
    if (!record || typeof record.project !== "string") return null;
    const project = deserializeProject(record.project, registry);
    return {
      project,
      filename: typeof record.filename === "string" && record.filename ? record.filename : "project_v1.tsuji",
      savedAt: Number.isFinite(record.savedAt) ? Number(record.savedAt) : 0,
    };
  } catch {
    clearAutosave();
    return null;
  }
}

export function clearAutosave(): void {
  try {
    storage()?.removeItem(AUTOSAVE_KEY);
  } catch {}
}

/** True if the document has anything in it — an empty one isn't worth restoring. */
export function projectHasContent(project: Project): boolean {
  return project.canvases.some((canvas) => canvas.nodes.length > 0);
}

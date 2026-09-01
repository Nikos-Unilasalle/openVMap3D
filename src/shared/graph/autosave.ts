/**
 * Crash/refresh insurance for the browser build.
 *
 * The desktop app has a real file on disk behind Save; the web build at
 * tsuji.xyz had nothing at all — no localStorage, no unload guard — so a
 * reload, a closed tab or a crashed GPU process threw away an entire session's
 * work with no warning. This keeps the last state of the document in
 * localStorage and hands it back on the next load.
 *
 * It is a safety net, not a save system: it holds rotating snapshots of the
 * document you were last editing and an explicit Save is still what produces
 * a file you own. `.tsuji` remains the format — the payload here is the same
 * JSON serializeProject writes (compact, to stretch the quota), so a
 * recovered document and a saved one are structurally identical.
 */

import { deserializeProject, serializeProject } from "./storage";
import { NodeRegistry, Project } from "./types";
import { DEFAULT_REGISTRY } from "./nodes";

/**
 * Three rotating slots instead of one: opening any demo/project immediately
 * began overwriting the single recovery copy, and one bad write destroyed
 * the whole net. The newest readable slot wins on load.
 */
const AUTOSAVE_SLOTS = 3;
const AUTOSAVE_KEY_PREFIX = "tsuji.autosave.v2.";
const LEGACY_KEY = "tsuji.autosave.v1";

function slotKey(index: number): string {
  return `${AUTOSAVE_KEY_PREFIX}${index}`;
}

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

let rotationCounter = 0;
let warnedOversize = false;

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
    serialized = serializeProject(project, { compact: true });
  } catch {
    return null;
  }
  // Measure the exact string that will be stored — the payload is embedded
  // as an escaped JSON string inside the record, so sizing it alone
  // under-counted by roughly 2× and "safe" writes still hit the quota.
  const record = JSON.stringify({ filename, savedAt: Date.now(), project: serialized });
  if (record.length > MAX_AUTOSAVE_BYTES) {
    // Say so once: a user whose project outgrew the safety net believed the
    // net was running when it had silently stopped updating.
    if (!warnedOversize) {
      warnedOversize = true;
      console.warn(
        `tsuji: autosave paused — this document (${(record.length / 1e6).toFixed(1)} MB) exceeds the ` +
          "localStorage safety net. Save to a .tsuji file to keep it.",
      );
    }
    return null;
  }
  try {
    store.setItem(slotKey(rotationCounter % AUTOSAVE_SLOTS), record);
    rotationCounter++;
  } catch {
    // Quota, or a storage-disabled context. The in-memory document is
    // untouched; the user just doesn't get the safety net this time.
    return null;
  }
  return serialized;
}

/**
 * The newest readable snapshot across all slots, or null if there is none
 * (or none can be read — a snapshot written by an incompatible build is
 * dropped rather than crashing the editor on boot).
 */
export function readAutosave(registry: NodeRegistry = DEFAULT_REGISTRY): AutosaveRecord | null {
  const store = storage();
  if (!store) return null;

  let bestRaw: string | null = null;
  let bestSavedAt = -1;
  for (const key of [slotKey(0), slotKey(1), slotKey(2), LEGACY_KEY]) {
    const raw = store.getItem(key);
    if (!raw) continue;
    let savedAt = 0;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.project !== "string") continue;
      savedAt = Number.isFinite(parsed.savedAt) ? Number(parsed.savedAt) : 0;
    } catch {
      // A truncated slot is skipped; another slot may still be readable.
      continue;
    }
    if (savedAt > bestSavedAt) {
      bestSavedAt = savedAt;
      bestRaw = raw;
    }
  }
  if (!bestRaw) {
    // Nothing readable anywhere — wipe the slots so a corrupted entry doesn't
    // sit there slowing every later boot.
    clearAutosave();
    return null;
  }

  try {
    const record = JSON.parse(bestRaw);
    const project = deserializeProject(record.project, registry);
    return {
      project,
      filename: typeof record.filename === "string" && record.filename ? record.filename : "project_v1.tsuji",
      savedAt: bestSavedAt,
    };
  } catch (err) {
    // A snapshot that can't be read is dropped rather than crashing the editor
    // on boot — but silently discarding someone's recovered work is exactly the
    // failure this module exists to prevent, so say so.
    console.warn("tsuji: could not restore the autosaved document — discarding it", err);
    clearAutosave();
    return null;
  }
}

export function clearAutosave(): void {
  try {
    const store = storage();
    if (!store) return;
    for (let i = 0; i < AUTOSAVE_SLOTS; i++) store.removeItem(slotKey(i));
    store.removeItem(LEGACY_KEY);
  } catch {}
}

/** True if the document has anything in it — an empty one isn't worth restoring. */
export function projectHasContent(project: Project): boolean {
  return project.canvases.some((canvas) => canvas.nodes.length > 0);
}

import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Graph } from "./types";

export function ensureOvmExtension(filename: string): string {
  if (!filename) return "project_v1.ovm";
  const lower = filename.toLowerCase();
  if (lower.endsWith(".ovm") || lower.endsWith(".json")) {
    return filename;
  }
  return `${filename}.ovm`;
}

export function incrementFilename(filename: string): string {
  let ext = ".ovm";
  let base = filename;

  if (filename.toLowerCase().endsWith(".ovm")) {
    ext = ".ovm";
    base = filename.slice(0, -4);
  } else if (filename.toLowerCase().endsWith(".json")) {
    ext = ".json";
    base = filename.slice(0, -5);
  }

  const match = base.match(/^(.+?)([_-]?[vV]?)(\d+)$/);

  if (match) {
    const prefix = match[1];
    const tag = match[2];
    const numStr = match[3];
    const nextNum = parseInt(numStr, 10) + 1;
    const paddedNum =
      numStr.startsWith("0") && numStr.length > 1
        ? String(nextNum).padStart(numStr.length, "0")
        : String(nextNum);
    const actualTag = tag || "_v";
    return `${prefix}${actualTag}${paddedNum}${ext}`;
  }

  return `${base}_v2${ext}`;
}

export function serializeGraph(graph: Graph): string {
  const cleanGraph: Graph = {
    nodes: (graph.nodes || []).map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: Math.round(n.position?.x ?? 0), y: Math.round(n.position?.y ?? 0) },
      params: n.params ? JSON.parse(JSON.stringify(n.params)) : {},
    })),
    connections: (graph.connections || []).map((c) => ({
      id: c.id,
      fromNode: c.fromNode,
      fromSocket: c.fromSocket,
      toNode: c.toNode,
      toSocket: c.toSocket,
    })),
  };
  return JSON.stringify(cleanGraph, null, 2);
}

export function deserializeGraph(jsonString: string): Graph {
  const data = JSON.parse(jsonString);

  if (!data || typeof data !== "object") {
    throw new Error("Invalid file format: content is not a valid JSON object.");
  }

  if (!Array.isArray(data.nodes) || !Array.isArray(data.connections)) {
    throw new Error("Invalid graph format: missing 'nodes' or 'connections' arrays.");
  }

  for (const n of data.nodes) {
    if (!n.id || !n.type || !n.position) {
      throw new Error(
        `Invalid node structure in graph: missing required fields on node ${n?.id || "unknown"}.`
      );
    }
  }

  for (const c of data.connections) {
    if (!c.id || !c.fromNode || !c.fromSocket || !c.toNode || !c.toSocket) {
      throw new Error(
        `Invalid connection structure in graph: missing required fields on connection ${c?.id || "unknown"}.`
      );
    }
  }

  return { nodes: data.nodes, connections: data.connections };
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Open file via native Tauri dialog or browser file picker.
 * Returns { graph, filename } on success, null on cancel.
 */
export async function openGraphWithFilePicker(): Promise<{ graph: Graph; filename: string } | null> {
  if (!isTauri()) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".ovm,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        try {
          const text = await file.text();
          const graph = deserializeGraph(text);
          resolve({ graph, filename: file.name });
        } catch (e) {
          alert("Erreur lors de la lecture du fichier : " + (e as Error).message);
          resolve(null);
        }
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }

  const selected = await dialogOpen({
    multiple: false,
    filters: [{ name: "OpenVMap Project", extensions: ["ovm", "json"] }],
  });

  if (!selected || typeof selected !== "string") return null;

  const content = await readTextFile(selected);
  const graph = deserializeGraph(content);
  const parts = selected.split(/[\/\\]/);
  const filename = parts[parts.length - 1] || "project_v1.ovm";
  return { graph, filename };
}

/**
 * Save file via native Tauri dialog or browser blob download.
 * Returns saved filename on success, null on cancel.
 */
export async function saveGraphAsWithFilePicker(
  graph: Graph,
  suggestedFilename: string
): Promise<string | null> {
  const filename = ensureOvmExtension(suggestedFilename);
  const jsonString = serializeGraph(graph);

  if (!isTauri()) {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return filename;
  }

  const filePath = await dialogSave({
    defaultPath: filename,
    filters: [{ name: "OpenVMap Project", extensions: ["ovm"] }],
  });

  if (!filePath) return null;

  await writeTextFile(filePath, jsonString);
  const parts = filePath.split(/[\/\\]/);
  return parts[parts.length - 1] || filename;
}

/**
 * Save file directly to the given path (no dialog).
 * Used for "Save" (overwrite) and "Incremental Save".
 * Returns the resolved path/filename.
 */
export async function saveGraphToPath(
  graph: Graph,
  filePath: string
): Promise<string> {
  const jsonString = serializeGraph(graph);

  if (!isTauri()) {
    const parts = filePath.split(/[\/\\]/);
    const filename = parts[parts.length - 1] || filePath;
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return filename;
  }

  await writeTextFile(filePath, jsonString);
  const parts = filePath.split(/[\/\\]/);
  return parts[parts.length - 1] || filePath;
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAutosave, projectHasContent, readAutosave, writeAutosave } from "./autosave";
import { emptyGraph, normalizeCanvases, Project } from "./types";

/** A minimal in-memory localStorage — the tests run headless, with no window. */
function installStorage(): { store: Map<string, string>; failWrites?: boolean } {
  const store = new Map<string, string>();
  const state = { store, failWrites: false };
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (state.failWrites) throw new Error("QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
  vi.stubGlobal("window", { localStorage });
  return state;
}

function projectWithBox(): Project {
  const graph = emptyGraph();
  graph.nodes = [{ id: "box_1", type: "object/box", position: { x: 10, y: 20 }, params: {} }];
  return { canvases: normalizeCanvases([graph]), activeCanvas: 0 };
}

describe("autosave", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips a document through storage", () => {
    installStorage();
    writeAutosave(projectWithBox(), "scene_v3.tsuji");

    const record = readAutosave();
    expect(record).not.toBeNull();
    expect(record!.filename).toBe("scene_v3.tsuji");
    expect(record!.project.canvases[0].nodes[0].id).toBe("box_1");
    expect(record!.savedAt).toBeGreaterThan(0);
  });

  it("returns null when nothing was ever stored", () => {
    installStorage();
    expect(readAutosave()).toBeNull();
  });

  it("drops a snapshot it can't parse instead of throwing on boot", () => {
    const state = installStorage();
    state.store.set("tsuji.autosave.v1", "{not json");
    expect(readAutosave()).toBeNull();
    // And it clears the bad entry, so the next boot isn't slowed by it again.
    expect(state.store.size).toBe(0);
  });

  it("survives a storage that refuses writes", () => {
    const state = installStorage();
    state.failWrites = true;
    expect(writeAutosave(projectWithBox(), "x.tsuji")).toBeNull();
  });

  it("does nothing at all without a window", () => {
    vi.stubGlobal("window", undefined);
    expect(writeAutosave(projectWithBox(), "x.tsuji")).toBeNull();
    expect(readAutosave()).toBeNull();
    expect(() => clearAutosave()).not.toThrow();
  });

  it("knows an empty document isn't worth restoring", () => {
    expect(projectHasContent({ canvases: normalizeCanvases([emptyGraph()]), activeCanvas: 0 })).toBe(false);
    expect(projectHasContent(projectWithBox())).toBe(true);
  });
});

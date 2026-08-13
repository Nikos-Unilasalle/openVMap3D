import { describe, expect, test, vi } from "vitest";
import { createNodeCache, disposeNodeCaches } from "./nodeCaches";

describe("createNodeCache", () => {
  test("behaves as an ordinary Map until a node is disposed", () => {
    const cache = createNodeCache<number>();
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  test("drops only the disposed node's entry", () => {
    const cache = createNodeCache<number>();
    cache.set("a", 1);
    cache.set("b", 2);

    disposeNodeCaches(["a"]);

    expect(cache.has("a")).toBe(false);
    expect(cache.get("b")).toBe(2);
  });

  test("runs the value disposer so GPU resources are actually released", () => {
    const dispose = vi.fn();
    const cache = createNodeCache<{ id: string }>(dispose);
    const value = { id: "mesh" };
    cache.set("a", value);

    disposeNodeCaches(["a"]);

    expect(dispose).toHaveBeenCalledWith(value);
  });

  test("clears every registered cache for the same node id — the whole point, since one node can own several", () => {
    const meshes = createNodeCache<string>();
    const textures = createNodeCache<string>();
    meshes.set("a", "mesh");
    textures.set("a", "texture");

    disposeNodeCaches(["a"]);

    expect(meshes.has("a")).toBe(false);
    expect(textures.has("a")).toBe(false);
  });

  test("a node id that comes back (undo, or reloading a file that stores ids) starts empty rather than reusing stale state", () => {
    const cache = createNodeCache<string>();
    cache.set("a", "old state");

    disposeNodeCaches(["a"]);

    expect(cache.get("a")).toBeUndefined();
  });

  test("disposing an id with nothing cached is a no-op, and never calls the disposer", () => {
    const dispose = vi.fn();
    const cache = createNodeCache<string>(dispose);

    expect(() => disposeNodeCaches(["missing"])).not.toThrow();
    expect(dispose).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  test("a throwing disposer does not stop the other caches from clearing", () => {
    const exploding = createNodeCache<string>(() => {
      throw new Error("GPU release failed");
    });
    const other = createNodeCache<string>();
    exploding.set("a", "x");
    other.set("a", "y");

    expect(() => disposeNodeCaches(["a"])).not.toThrow();
    expect(other.has("a")).toBe(false);
  });
});

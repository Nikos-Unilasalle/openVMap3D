import { describe, expect, it, vi } from "vitest";
import {
  describeMissingResources,
  directoryOf,
  externalResourceUris,
  mimeForUri,
  resolveExternalResources,
  resolveSiblingPath,
} from "./gltfExternalResources";

describe("externalResourceUris", () => {
  it("collects the buffers and images the loader will have to fetch", () => {
    expect(
      externalResourceUris({
        buffers: [{ byteLength: 10, uri: "model.bin" }],
        images: [{ uri: "Assets/textures/TARMAC.jpg" }, { uri: "Assets/textures/CARRERA.jpg" }],
      }),
    ).toEqual(["model.bin", "Assets/textures/TARMAC.jpg", "Assets/textures/CARRERA.jpg"]);
  });

  it("ignores data: URIs, which are already inline", () => {
    expect(
      externalResourceUris({
        buffers: [{ byteLength: 4, uri: "data:application/octet-stream;base64,AAAA" }],
        images: [{ uri: "data:image/png;base64,iVBOR" }],
      }),
    ).toEqual([]);
  });

  it("ignores absolute URLs, which aren't files beside the model", () => {
    expect(externalResourceUris({ images: [{ uri: "https://example.com/t.png" }] })).toEqual([]);
  });

  it("reports a self-contained .glb as having nothing external", () => {
    expect(externalResourceUris({ buffers: [{ byteLength: 128 }], images: [] })).toEqual([]);
  });

  it("deduplicates a file referenced more than once", () => {
    expect(externalResourceUris({ images: [{ uri: "t.png" }, { uri: "t.png" }] })).toEqual(["t.png"]);
  });

  it("survives a glTF with no buffers or images at all", () => {
    expect(externalResourceUris({})).toEqual([]);
  });
});

describe("resolveSiblingPath", () => {
  it("resolves a URI against the model's own directory", () => {
    expect(resolveSiblingPath("/models/car/Unity2Skfb.gltf", "Unity2Skfb.bin")).toBe("/models/car/Unity2Skfb.bin");
  });

  it("keeps a URI's subdirectories", () => {
    expect(resolveSiblingPath("/models/car/c.gltf", "Assets/textures/TARMAC.jpg")).toBe(
      "/models/car/Assets/textures/TARMAC.jpg",
    );
  });

  it("percent-decodes, since glTF escapes its URIs but the filesystem doesn't", () => {
    expect(resolveSiblingPath("/models/c.gltf", "my%20texture.png")).toBe("/models/my texture.png");
  });

  it("handles a Windows-style model path", () => {
    expect(resolveSiblingPath("C:\\models\\c.gltf", "c.bin")).toBe("C:\\models/c.bin");
  });

  it("leaves a malformed escape alone rather than throwing", () => {
    expect(() => resolveSiblingPath("/m/c.gltf", "bad%ZZ.png")).not.toThrow();
  });
});

describe("directoryOf", () => {
  it("strips the filename", () => {
    expect(directoryOf("/a/b/c.gltf")).toBe("/a/b");
  });

  it("returns empty for a bare filename", () => {
    expect(directoryOf("c.gltf")).toBe("");
  });
});

describe("mimeForUri", () => {
  it("types images so the browser decodes the blob correctly", () => {
    expect(mimeForUri("t.JPG")).toBe("image/jpeg");
    expect(mimeForUri("t.png")).toBe("image/png");
  });

  it("falls back to binary for a .bin and for anything unknown", () => {
    expect(mimeForUri("m.bin")).toBe("application/octet-stream");
    expect(mimeForUri("m.whatever")).toBe("application/octet-stream");
  });
});

describe("resolveExternalResources", () => {
  const fakeUrls: string[] = [];
  const revoked: string[] = [];

  function stubObjectUrls() {
    let n = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => {
        const url = `blob:stub/${n++}`;
        fakeUrls.push(url);
        return url;
      },
      revokeObjectURL: (url: string) => revoked.push(url),
    });
  }

  it("maps each URI to a blob URL and reports nothing missing", async () => {
    stubObjectUrls();
    const read = vi.fn(async () => new Uint8Array([1, 2, 3]));

    const resolved = await resolveExternalResources("/m/c.gltf", ["c.bin", "t.png"], read);

    expect(resolved.missing).toEqual([]);
    expect(resolved.urlMap.get("c.bin")).toMatch(/^blob:/);
    expect(resolved.urlMap.get("t.png")).toMatch(/^blob:/);
    expect(read).toHaveBeenCalledWith("/m/c.bin");
    expect(read).toHaveBeenCalledWith("/m/t.png");
  });

  it("names the files it could not read instead of failing the whole load silently", async () => {
    stubObjectUrls();
    const read = vi.fn(async (path: string) => {
      if (path.endsWith("missing.bin")) throw new Error("ENOENT");
      return new Uint8Array([1]);
    });

    const resolved = await resolveExternalResources("/m/c.gltf", ["missing.bin", "there.png"], read);

    expect(resolved.missing).toEqual(["missing.bin"]);
    expect(resolved.urlMap.has("there.png")).toBe(true);
  });

  it("release() revokes every blob URL it created", async () => {
    stubObjectUrls();
    revoked.length = 0;
    const resolved = await resolveExternalResources("/m/c.gltf", ["a.bin", "b.png"], async () => new Uint8Array([1]));

    resolved.release();
    expect(revoked).toHaveLength(2);

    // Releasing twice must not double-revoke — the load path can call it from
    // either the success or the error callback.
    resolved.release();
    expect(revoked).toHaveLength(2);
  });
});

describe("describeMissingResources", () => {
  it("names the files and where they should be", () => {
    const message = describeMissingResources(["Unity2Skfb.bin"], "/Users/n/car/Unity2Skfb.gltf");
    expect(message).toContain("Unity2Skfb.bin");
    expect(message).toContain("/Users/n/car");
  });

  it("summarises rather than listing a hundred textures", () => {
    const many = Array.from({ length: 20 }, (_, i) => `t${i}.png`);
    expect(describeMissingResources(many, "/m/c.gltf")).toContain("and 14 more");
  });
});

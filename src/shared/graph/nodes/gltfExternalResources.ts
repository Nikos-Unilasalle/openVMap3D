/**
 * Resolving a .gltf's *external* files — the sibling `.bin` and texture images
 * a non-embedded export leaves next to it.
 *
 * A .gltf is only the JSON half of a model. Sketchfab, Unity and Blender's
 * "glTF Separate" all emit `model.gltf` + `model.bin` + a `textures/` folder,
 * and the JSON refers to them by relative path. Handed such a file with no way
 * to fetch its siblings, GLTFLoader asks the page for `model.bin`, a dev server
 * answers with its SPA fallback HTML, and the loader reads accessor offsets
 * into a few kilobytes of markup — surfacing as "Length out of range of
 * buffer", which names neither the file nor the real problem.
 *
 * So the sibling files are read off disk and handed to three as blob URLs
 * through a LoadingManager rewrite. Blob URLs rather than data URIs: a model's
 * .bin runs to megabytes, and base64-inlining it would cost ~1.4x that in a
 * string on top of the bytes themselves.
 */

/** Everything the loader will ask the network for — data: URIs are already inline. */
export function externalResourceUris(json: unknown): string[] {
  const gltf = json as { buffers?: { uri?: unknown }[]; images?: { uri?: unknown }[] };
  const uris: string[] = [];
  for (const entry of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    const uri = entry?.uri;
    if (typeof uri !== "string" || uri.length === 0) continue;
    if (/^data:/i.test(uri)) continue;
    // An absolute URL is somebody else's to fetch, not a file on disk beside this one.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(uri)) continue;
    uris.push(uri);
  }
  return [...new Set(uris)];
}

/** The directory a path lives in, with no trailing separator. Handles both separators. */
export function directoryOf(filePath: string): string {
  const cut = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return cut <= 0 ? "" : filePath.slice(0, cut);
}

/**
 * Where a glTF-relative URI actually sits on disk. glTF percent-encodes its
 * URIs, so "my%20texture.png" has to come back to "my texture.png" before it
 * can be opened.
 */
export function resolveSiblingPath(gltfPath: string, uri: string): string {
  const dir = directoryOf(gltfPath);
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // A malformed escape is better opened verbatim than not at all.
  }
  const normalised = decoded.replace(/\\/g, "/");
  return dir ? `${dir}/${normalised}` : normalised;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  bmp: "image/bmp",
  gif: "image/gif",
  ktx2: "image/ktx2",
  bin: "application/octet-stream",
};

export function mimeForUri(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export interface ResolvedResources {
  /** Original glTF URI -> blob URL the LoadingManager should serve instead. */
  urlMap: Map<string, string>;
  /** URIs whose file could not be read — the model can't load without these. */
  missing: string[];
  /** Releases every blob URL created. Call once the model has finished loading. */
  release: () => void;
}

/**
 * Reads each URI's file from beside `gltfPath` and turns it into a blob URL.
 * `readBinaryFile` is injected so this stays testable without Tauri, and so
 * the Tauri fs plugin is imported only where it actually exists.
 */
export async function resolveExternalResources(
  gltfPath: string,
  uris: string[],
  readBinaryFile: (path: string) => Promise<Uint8Array>,
): Promise<ResolvedResources> {
  const urlMap = new Map<string, string>();
  const missing: string[] = [];
  const created: string[] = [];

  await Promise.all(
    uris.map(async (uri) => {
      try {
        const bytes = await readBinaryFile(resolveSiblingPath(gltfPath, uri));
        // Copy through a fresh view: the blob must own a plain ArrayBuffer,
        // not a view that might span a larger shared buffer.
        const blob = new Blob([new Uint8Array(bytes)], { type: mimeForUri(uri) });
        const url = URL.createObjectURL(blob);
        created.push(url);
        urlMap.set(uri, url);
      } catch {
        missing.push(uri);
      }
    }),
  );

  return {
    urlMap,
    missing,
    release: () => {
      for (const url of created) URL.revokeObjectURL(url);
      created.length = 0;
    },
  };
}

/** What to tell someone whose model is missing the files it depends on. */
export function describeMissingResources(missing: string[], gltfPath: string): string {
  const dir = directoryOf(gltfPath) || "the model's folder";
  const listed = missing.slice(0, 6).join(", ");
  const more = missing.length > 6 ? ` (and ${missing.length - 6} more)` : "";
  return `This .gltf depends on files that aren't beside it: ${listed}${more}. They should sit in ${dir}. Keep the model's folder intact, or export it as a single self-contained .glb.`;
}

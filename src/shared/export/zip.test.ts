import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildZip } from "./zip";

describe("buildZip", () => {
  it("produces an archive the system `unzip` accepts, round-tripping file contents exactly", () => {
    const fileA = new TextEncoder().encode("hello world\n".repeat(100));
    const fileB = new Uint8Array([0, 1, 2, 3, 255, 254, 253, 10, 13, 0]);

    const zipBytes = buildZip([
      { path: "index.html", data: fileA },
      { path: "textures/tex_0.bin", data: fileB },
    ]);

    const dir = mkdtempSync(join(tmpdir(), "ovm-zip-test-"));
    const zipPath = join(dir, "out.zip");
    writeFileSync(zipPath, zipBytes);

    try {
      execFileSync("unzip", ["-o", zipPath, "-d", dir]);
      const extractedA = readFileSync(join(dir, "index.html"));
      const extractedB = readFileSync(join(dir, "textures/tex_0.bin"));
      expect(new Uint8Array(extractedA)).toEqual(fileA);
      expect(new Uint8Array(extractedB)).toEqual(fileB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("handles an empty entry list", () => {
    const zipBytes = buildZip([]);
    // Just the 22-byte end-of-central-directory record.
    expect(zipBytes.length).toBe(22);
  });
});

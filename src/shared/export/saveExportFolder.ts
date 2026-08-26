import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { mkdir, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { isTauri } from "../graph/storage";
import { FolderExportFile } from "./exportScene";
import { buildZip } from "./zip";

function toBytes(data: Uint8Array | string): Uint8Array {
  return typeof data === "string" ? new TextEncoder().encode(data) : data;
}

/**
 * Writes a folder export to disk (Tauri: a real directory, picked via the
 * native dialog) or triggers one .zip download (browser: there's no way to
 * hand the user an actual folder, so every file goes into a single archive
 * instead — see zip.ts's own doc for why STORE/no-compression is fine here).
 * Returns the destination name on success, null on cancel.
 */
export async function saveExportFolder(files: FolderExportFile[], suggestedName: string): Promise<string | null> {
  if (!isTauri()) {
    const zipBytes = buildZip(files.map((f) => ({ path: f.path, data: toBytes(f.data) })));
    const blob = new Blob([zipBytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${suggestedName}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    return `${suggestedName}.zip`;
  }

  const parentDir = await dialogOpen({ directory: true, multiple: false });
  if (!parentDir || Array.isArray(parentDir)) return null;

  const exportDir = `${parentDir}/${suggestedName}`;
  await mkdir(exportDir, { recursive: true });

  const madeDirs = new Set<string>();
  for (const file of files) {
    const slashIndex = file.path.lastIndexOf("/");
    if (slashIndex !== -1) {
      const subDir = `${exportDir}/${file.path.slice(0, slashIndex)}`;
      if (!madeDirs.has(subDir)) {
        await mkdir(subDir, { recursive: true });
        madeDirs.add(subDir);
      }
    }
    const fullPath = `${exportDir}/${file.path}`;
    if (typeof file.data === "string") {
      await writeTextFile(fullPath, file.data);
    } else {
      await writeFile(fullPath, file.data);
    }
  }

  return suggestedName;
}

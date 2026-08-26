import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { isTauri } from "../graph/storage";

export function ensureHtmlExtension(filename: string): string {
  if (!filename) return "scene_export.html";
  return filename.toLowerCase().endsWith(".html") ? filename : `${filename}.html`;
}

/**
 * Save via native Tauri dialog or browser blob download — same pattern as
 * storage.ts's saveProjectAsWithFilePicker, for the exported standalone
 * scene page instead of a .tsuji project file.
 */
export async function saveStandaloneHtmlWithFilePicker(html: string, suggestedFilename: string): Promise<string | null> {
  const filename = ensureHtmlExtension(suggestedFilename);

  if (!isTauri()) {
    const blob = new Blob([html], { type: "text/html" });
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
    filters: [{ name: "Web Page", extensions: ["html"] }],
  });
  if (!filePath) return null;

  await writeTextFile(filePath, html);
  const parts = filePath.split(/[\/\\]/);
  return parts[parts.length - 1] || filename;
}

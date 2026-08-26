import vendorBundleSrc from "../../player/vendor/vendor.js?raw";
import playerRuntimeSrc from "../../player/playerRuntime.js?raw";
import { SnapshotNode } from "./sceneSnapshot";

/** Inline <script> content can't contain a literal "</script" — this is the standard escape for embedding arbitrary JSON/JS inside one. */
function escapeForInlineScript(text: string): string {
  return text.replace(/<\/(script)/gi, "<\\/$1");
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
}

/**
 * Builds a single, self-contained HTML page that renders a captured scene
 * with no server and no network access at runtime: three.js + OrbitControls
 * ship as the prebuilt `player/vendor/vendor.js` IIFE (see that file's own
 * doc — a Rollup-flattened bundle, not a CDN import), and the scene itself —
 * including every point/vertex/color, base64-encoded (see sceneSnapshot.ts)
 * — is inlined as a JSON blob. What this deliberately drops, to keep the
 * export tractable:
 *   - Textures/images (captureObject3D never reads them) — flat colors only.
 *   - The graph itself — this is a frozen render of the CURRENT state, not
 *     a re-editable copy; re-opening the source .tsuji is still how you'd
 *     change anything.
 *   - The editor's own camera pose — the player frames its own default view
 *     from the exported content's bounding sphere instead.
 * A single page is the only shape this produces today; a huge point cloud
 * makes for a huge HTML file (see plyLoader.ts's own point cap for the
 * matching concern on the *import* side) — splitting assets into sibling
 * files is a possible follow-up, not implemented here.
 */
export function buildStandalonePageHtml(scene: SnapshotNode, title: string): string {
  const sceneJson = escapeForInlineScript(JSON.stringify(scene));
  const escapedTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
  html, body { margin: 0; height: 100%; background: #14161a; overflow: hidden; }
  #app { position: fixed; inset: 0; }
</style>
</head>
<body>
<div id="app"></div>
<script>
${escapeForInlineScript(vendorBundleSrc)}
</script>
<script type="module">
window.__OVM_SCENE__ = ${sceneJson};
${escapeForInlineScript(playerRuntimeSrc)}
runPlayer(window.__OVM_SCENE__, document.getElementById("app"));
</script>
</body>
</html>
`;
}

/**
 * The folder-export counterpart of buildStandalonePageHtml: the scene data
 * and any captured textures ship as SIBLING FILES (scene.js, textures/*.png
 * — see exportScene.ts's exportSceneAsFolder) rather than inlined, so this
 * page only needs a `<script src="scene.js">` tag instead of an inline JSON
 * blob. Deliberately a `<script src>` tag, not `fetch("scene.js")`: a tag
 * load is a plain resource fetch (works on a bare file:// double-click),
 * while fetch()/XHR to a sibling file is blocked by Chrome's file:// origin
 * policy — the same reasoning textures use TextureLoader (also tag-based)
 * for instead of reading bytes over fetch.
 */
export function buildFolderIndexHtml(title: string): string {
  const escapedTitle = escapeHtml(title);

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapedTitle}</title>
<style>
  html, body { margin: 0; height: 100%; background: #14161a; overflow: hidden; }
  #app { position: fixed; inset: 0; }
</style>
</head>
<body>
<div id="app"></div>
<script>
${escapeForInlineScript(vendorBundleSrc)}
</script>
<script src="scene.js"></script>
<script type="module">
${escapeForInlineScript(playerRuntimeSrc)}
runPlayer(window.__OVM_SCENE__, document.getElementById("app"));
</script>
</body>
</html>
`;
}

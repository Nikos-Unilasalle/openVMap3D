/**
 * Where the desktop builds come from, and which one a given visitor wants.
 *
 * Tsuji runs two ways: the web build on GitHub Pages, and the Tauri desktop
 * app. Only the web build has an audience that needs this — someone already
 * running the desktop app has the binary — but the menu is shown in both, so
 * a desktop user can still pick up a newer version without hunting for the
 * repo.
 *
 * The asset list is read from the GitHub Releases API at open time rather
 * than hard-coded, because Tauri stamps the version into every filename
 * (`Tsuji_0.1.0_aarch64.dmg`), so any link written here would break on the
 * next release. Everything in this module is pure so the matching can be
 * tested without a network or a DOM; the fetch itself lives in the menu.
 */

export const REPO = "Nikos-Unilasalle/tsuji";
export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases`;
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export type Platform = "mac" | "windows" | "linux";

export const PLATFORM_LABELS: Record<Platform, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
};

/** The shape of a GitHub release asset — only the fields this uses. */
export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

/**
 * The installer extensions Tauri produces, per platform, best first.
 *
 * `.app.tar.gz` / `.zip` / `.sig` are deliberately absent: those are the
 * updater artifacts, not something anyone should be handed as "the download".
 */
const PLATFORM_EXTENSIONS: Record<Platform, string[]> = {
  mac: [".dmg"],
  windows: [".msi", ".exe"],
  linux: [".AppImage", ".deb", ".rpm"],
};

/**
 * Which build a visitor is on, from the User-Agent.
 *
 * `navigator.userAgentData.platform` is the modern answer but is
 * Chromium-only, so the UA string stays the fallback rather than the other
 * way round. Returns null when it genuinely cannot tell, which the menu shows
 * as "pick your platform" instead of guessing wrong and offering someone a
 * .msi on a Mac.
 */
export function detectPlatform(userAgent: string, platformHint?: string | null): Platform | null {
  const hint = (platformHint ?? "").toLowerCase();
  if (hint.includes("mac")) return "mac";
  if (hint.includes("win")) return "windows";
  if (hint.includes("linux")) return "linux";

  const ua = userAgent.toLowerCase();
  // Android before Linux: every Android UA also says "linux", and offering a
  // .deb to a phone is worse than offering nothing.
  if (ua.includes("android")) return null;
  if (ua.includes("iphone") || ua.includes("ipad")) return null;
  if (ua.includes("mac os") || ua.includes("macintosh")) return "mac";
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return null;
}

/** True when the filename is one of this platform's installers. */
function matchesPlatform(name: string, platform: Platform): boolean {
  return PLATFORM_EXTENSIONS[platform].some((ext) => name.toLowerCase().endsWith(ext.toLowerCase()));
}

/**
 * A platform's downloadable assets, in the order they should be offered:
 * by extension preference first (an .AppImage runs anywhere, a .deb does
 * not), then by name so two architectures of the same format sort stably.
 */
export function assetsFor(platform: Platform, release: Release | null): ReleaseAsset[] {
  if (!release) return [];
  const extensions = PLATFORM_EXTENSIONS[platform];
  return release.assets
    .filter((asset) => matchesPlatform(asset.name, platform))
    .sort((a, b) => {
      const rank = (n: string) => {
        const i = extensions.findIndex((ext) => n.toLowerCase().endsWith(ext.toLowerCase()));
        return i === -1 ? extensions.length : i;
      };
      const byExt = rank(a.name) - rank(b.name);
      return byExt !== 0 ? byExt : a.name.localeCompare(b.name);
    });
}

/** Every platform, the detected one first — so the visitor's own build is the top row. */
export function orderedPlatforms(detected: Platform | null): Platform[] {
  const all: Platform[] = ["mac", "windows", "linux"];
    return detected ? [detected, ...all.filter((p) => p !== detected)] : all;
}

/**
 * The bit of a Tauri asset name worth showing — the architecture, which is
 * the only thing distinguishing two files of the same format. Falls back to
 * the extension so a row is never unlabelled.
 */
export function describeAsset(name: string): string {
  const arch = /(aarch64|arm64|universal|x86_64|x64|amd64|i686)/i.exec(name);
  const ext = /(\.[a-z.]+)$/i.exec(name);
  const format = ext ? ext[1].replace(/^\./, "").replace(/\.tar\.gz$/, "tar.gz") : "";
  if (arch) return `${format} · ${arch[1].toLowerCase()}`;
  return format;
}

/** Human file size for the menu rows. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

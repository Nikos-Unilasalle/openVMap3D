import { describe, expect, it } from "vitest";
import {
  assetsFor,
  describeAsset,
  detectPlatform,
  formatSize,
  orderedPlatforms,
  Release,
} from "./downloads";

/** A release shaped the way Tauri's bundler actually names things. */
const RELEASE: Release = {
  tag_name: "v0.2.0",
  html_url: "https://github.com/Nikos-Unilasalle/tsuji/releases/tag/v0.2.0",
  assets: [
    { name: "Tsuji_0.2.0_universal.dmg", browser_download_url: "u/dmg", size: 42 * 1024 * 1024 },
    { name: "Tsuji_0.2.0_x64-setup.exe", browser_download_url: "u/exe", size: 8 * 1024 * 1024 },
    { name: "Tsuji_0.2.0_x64_en-US.msi", browser_download_url: "u/msi", size: 9 * 1024 * 1024 },
    { name: "tsuji_0.2.0_amd64.deb", browser_download_url: "u/deb", size: 7 * 1024 * 1024 },
    { name: "tsuji_0.2.0_amd64.AppImage", browser_download_url: "u/appimage", size: 88 * 1024 * 1024 },
    // Updater artifacts — must never be offered as "the download".
    { name: "Tsuji.app.tar.gz", browser_download_url: "u/updater", size: 40 * 1024 * 1024 },
    { name: "Tsuji.app.tar.gz.sig", browser_download_url: "u/sig", size: 200 },
  ],
};

describe("detectPlatform", () => {
  it("reads the modern platform hint when the browser provides one", () => {
    expect(detectPlatform("irrelevant", "macOS")).toBe("mac");
    expect(detectPlatform("irrelevant", "Windows")).toBe("windows");
    expect(detectPlatform("irrelevant", "Linux")).toBe("linux");
  });

  it("falls back to the User-Agent string", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Ubuntu; Linux x86_64)")).toBe("linux");
  });

  it("returns null on phones rather than guessing", () => {
    // Every Android UA also says "Linux" — matching that would offer a .deb
    // to a phone, which is worse than offering nothing.
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBeNull();
    expect(detectPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBeNull();
    expect(detectPlatform("something entirely unknown")).toBeNull();
  });
});

describe("assetsFor", () => {
  it("gives each platform only its own installers", () => {
    expect(assetsFor("mac", RELEASE).map((a) => a.name)).toEqual(["Tsuji_0.2.0_universal.dmg"]);
    expect(assetsFor("windows", RELEASE).map((a) => a.name)).toEqual([
      "Tsuji_0.2.0_x64_en-US.msi",
      "Tsuji_0.2.0_x64-setup.exe",
    ]);
    expect(assetsFor("linux", RELEASE).map((a) => a.name)).toEqual([
      "tsuji_0.2.0_amd64.AppImage",
      "tsuji_0.2.0_amd64.deb",
    ]);
  });

  it("never offers the updater artifacts", () => {
    const every = (["mac", "windows", "linux"] as const).flatMap((p) => assetsFor(p, RELEASE));
    expect(every.some((a) => a.name.includes(".tar.gz"))).toBe(false);
    expect(every.some((a) => a.name.endsWith(".sig"))).toBe(false);
  });

  it("puts the format that runs anywhere first — AppImage before deb", () => {
    expect(assetsFor("linux", RELEASE)[0].name).toContain(".AppImage");
  });

  it("returns nothing when there is no release yet, rather than throwing", () => {
    expect(assetsFor("mac", null)).toEqual([]);
    expect(assetsFor("mac", { ...RELEASE, assets: [] })).toEqual([]);
  });
});

describe("orderedPlatforms", () => {
  it("puts the visitor's own platform first", () => {
    expect(orderedPlatforms("linux")).toEqual(["linux", "mac", "windows"]);
    expect(orderedPlatforms("windows")).toEqual(["windows", "mac", "linux"]);
  });

  it("keeps a stable order when the platform is unknown", () => {
    expect(orderedPlatforms(null)).toEqual(["mac", "windows", "linux"]);
  });
});

describe("describeAsset", () => {
  it("names the architecture, the only thing telling two same-format files apart", () => {
    expect(describeAsset("Tsuji_0.2.0_universal.dmg")).toBe("dmg · universal");
    expect(describeAsset("Tsuji_0.2.0_aarch64.dmg")).toBe("dmg · aarch64");
    expect(describeAsset("tsuji_0.2.0_amd64.AppImage")).toBe("AppImage · amd64");
  });

  it("still labels a file with no architecture in its name", () => {
    expect(describeAsset("Tsuji.msi")).toBe("msi");
  });
});

describe("formatSize", () => {
  it("rounds to something readable", () => {
    expect(formatSize(88 * 1024 * 1024)).toBe("88 MB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatSize(400 * 1024)).toBe("400 KB");
  });

  it("says nothing rather than '0 MB' when the size is missing", () => {
    expect(formatSize(0)).toBe("");
    expect(formatSize(NaN)).toBe("");
  });
});

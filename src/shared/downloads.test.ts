import { describe, expect, it } from "vitest";
import {
  assetsFor,
  describeAsset,
  detectPlatform,
  formatSize,
  LAUNCH_NOTES,
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

/**
 * The asset names Tauri's bundler actually produced for v0.1.0, copied from
 * the release rather than guessed. The fixtures above were written before any
 * build existed; these pin the matcher against the real toolchain, so a
 * change in Tauri's naming shows up here instead of as an empty Download menu.
 */
const REAL_v0_1_0: Release = {
  tag_name: "v0.1.0",
  html_url: "https://github.com/Nikos-Unilasalle/tsuji/releases/tag/v0.1.0",
  assets: [
    { name: "Tsuji-0.1.0-1.x86_64.rpm", browser_download_url: "u/rpm", size: 8451592 },
    { name: "Tsuji_0.1.0_amd64.AppImage", browser_download_url: "u/appimage", size: 85846520 },
    { name: "Tsuji_0.1.0_amd64.deb", browser_download_url: "u/deb", size: 8450932 },
    { name: "Tsuji_0.1.0_universal.dmg", browser_download_url: "u/dmg", size: 14761460 },
    { name: "Tsuji_0.1.0_x64-setup.exe", browser_download_url: "u/exe", size: 6248129 },
    { name: "Tsuji_0.1.0_x64_en-US.msi", browser_download_url: "u/msi", size: 7348224 },
    { name: "Tsuji_universal.app.tar.gz", browser_download_url: "u/updater", size: 14530607 },
  ],
};

describe("the real v0.1.0 release", () => {
  it("offers every installer and nothing else", () => {
    expect(assetsFor("mac", REAL_v0_1_0).map((a) => a.name)).toEqual(["Tsuji_0.1.0_universal.dmg"]);
    expect(assetsFor("windows", REAL_v0_1_0).map((a) => a.name)).toEqual([
      "Tsuji_0.1.0_x64_en-US.msi",
      "Tsuji_0.1.0_x64-setup.exe",
    ]);
    // The .rpm uses dashes where the others use underscores — matching is by
    // extension precisely so that kind of difference cannot break it.
    expect(assetsFor("linux", REAL_v0_1_0).map((a) => a.name)).toEqual([
      "Tsuji_0.1.0_amd64.AppImage",
      "Tsuji_0.1.0_amd64.deb",
      "Tsuji-0.1.0-1.x86_64.rpm",
    ]);
  });

  it("leaves no asset unaccounted for", () => {
    const offered = (["mac", "windows", "linux"] as const).flatMap((p) =>
      assetsFor(p, REAL_v0_1_0).map((a) => a.name),
    );
    const skipped = REAL_v0_1_0.assets.map((a) => a.name).filter((n) => !offered.includes(n));
    // Exactly one file is withheld, and it is the updater bundle.
    expect(skipped).toEqual(["Tsuji_universal.app.tar.gz"]);
  });

  it("labels each real file readably", () => {
    expect(describeAsset("Tsuji_0.1.0_universal.dmg")).toBe("dmg · universal");
    expect(describeAsset("Tsuji_0.1.0_x64_en-US.msi")).toBe("msi · x64");
    expect(describeAsset("Tsuji_0.1.0_x64-setup.exe")).toBe("exe · x64");
    expect(describeAsset("Tsuji_0.1.0_amd64.AppImage")).toBe("AppImage · amd64");
    expect(describeAsset("Tsuji-0.1.0-1.x86_64.rpm")).toBe("rpm · x86_64");
  });
});

describe("LAUNCH_NOTES", () => {
  it("gives macOS the exact command that unblocks the app", () => {
    // Verified by hand on a real 0.1.0 .dmg: without clearing the quarantine
    // flag macOS reports the app as damaged, which reads as a corrupt
    // download rather than a signing policy — so the command is not a tip,
    // it is the difference between a working download and a dead one.
    expect(LAUNCH_NOTES.mac.command).toBe("xattr -cr /Applications/Tsuji.app");
  });

  it("matches the bundle's real capitalisation, for case-sensitive volumes", () => {
    // A default macOS volume is case-insensitive, so a lowercase path also
    // works there — but only this spelling works on a case-sensitive one.
    expect(LAUNCH_NOTES.mac.command).toContain("Tsuji.app");
  });

  it("tells Windows users what SmartScreen will ask, with no command to run", () => {
    expect(LAUNCH_NOTES.windows.command).toBeUndefined();
    expect(LAUNCH_NOTES.windows.text).toMatch(/SmartScreen/);
  });

  it("covers the AppImage executable bit, which a browser download drops", () => {
    expect(LAUNCH_NOTES.linux.command).toBe("chmod +x Tsuji_*.AppImage");
  });

  it("has a note for every platform, so none is left unexplained", () => {
    for (const p of ["mac", "windows", "linux"] as const) {
      expect(LAUNCH_NOTES[p].text.length).toBeGreaterThan(0);
    }
  });
});

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { captureScene } from "./sceneSnapshot";
import { buildStandalonePageHtml } from "./exportStandalonePage";

describe("buildStandalonePageHtml", () => {
  it("produces a self-contained page: vendored three+OrbitControls IIFE, embedded scene JSON, no external refs", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ color: 0x38bdf8 }));
    const snapshot = captureScene([mesh]);
    const html = buildStandalonePageHtml(snapshot, "Test Scene");

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<title>Test Scene</title>');
    expect(html).toContain("var OVMVendor=");
    expect(html).toContain("window.__OVM_SCENE__");
    expect(html).toContain("runPlayer(window.__OVM_SCENE__");
    // No CDN/network dependency — three+OrbitControls ship as the vendored
    // bundle above (three's own source does contain a couple of harmless
    // string-literal/comment URLs — an XML namespace, a paper citation —
    // neither fetched at runtime, so only CDN hosts are checked here).
    expect(html).not.toContain("unpkg.com");
    expect(html).not.toContain("cdn.");
    expect(html).not.toContain("jsdelivr");
  });

  it("escapes a literal </script> sequence inside the embedded scene JSON so it can't break out of the inline script", () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = "</script><script>alert(1)</script>";
    const snapshot = captureScene([mesh]);
    const html = buildStandalonePageHtml(snapshot, "Title");

    expect(html).not.toContain("</script><script>alert(1)");
    // The escaped form must still be present and JSON-parseable back to the original string.
    const match = html.match(/window\.__OVM_SCENE__ = (.*);\n/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1].replace(/<\\\//g, "</"));
    expect(parsed.children[0].name).toBe("</script><script>alert(1)</script>");
  });

  it("escapes HTML metacharacters in the title", () => {
    const snapshot = captureScene([]);
    const html = buildStandalonePageHtml(snapshot, "<b>Bold</b> & Co");
    expect(html).toContain("<title>&lt;b&gt;Bold&lt;/b&gt; &amp; Co</title>");
  });
});

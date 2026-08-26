import { defineConfig } from "vite";
export default defineConfig({
  // Otherwise Vite copies the whole project `public/` dir alongside this
  // build's own single output file, littering src/player/vendor with
  // unrelated app assets (logo.png, favicon svgs, ...).
  publicDir: false,
  build: {
    lib: {
      entry: "src/player/vendorEntry.js",
      name: "OVMVendor",
      formats: ["iife"],
      fileName: () => "vendor.js",
    },
    outDir: "src/player/vendor",
    emptyOutDir: false,
    minify: true,
  },
});

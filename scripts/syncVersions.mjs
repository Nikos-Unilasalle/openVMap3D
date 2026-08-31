#!/usr/bin/env node
/**
 * Keeps the four version declarations in step with package.json:
 *
 *   package.json            (source of truth — bumped by `npm version …`)
 *   src-tauri/tauri.conf.json  (what the desktop installers report)
 *   src-tauri/Cargo.toml       (what the binary reports via env!()/compile-time)
 *   src-tauri/Cargo.lock       (regenerated entry for the tauri-app crate)
 *
 * `npm version` alone only touches package.json, so a `v0.3.0` tag used to
 * ship binaries still calling themselves 0.2.0. release.yml runs this before
 * building, so the tag, the app UI and the installers always agree.
 *
 * Run manually with `npm run sync:versions` after bumping.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`package.json has no usable semver version: "${version}"`);
  process.exit(1);
}

let changed = 0;

const confPath = resolve(root, "src-tauri/tauri.conf.json");
const conf = readFileSync(confPath, "utf8");
const confNext = conf.replace(
  /("version":\s*")\d+\.\d+\.\d+(")/,
  `$1${version}$2`,
);
if (confNext !== conf) {
  writeFileSync(confPath, confNext);
  changed++;
}

const cargoPath = resolve(root, "src-tauri/Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const cargoNext = cargo.replace(
  /^(name = "tauri-app"\nversion = ")\d+\.\d+\.\d+(")/m,
  `$1${version}$2`,
);
if (cargoNext !== cargo) {
  writeFileSync(cargoPath, cargoNext);
  changed++;
}

console.log(
  changed > 0
    ? `synced src-tauri version files to ${version} (${changed} file(s) updated; run \`cargo update -p tauri-app\` or a build to refresh Cargo.lock)`
    : `src-tauri version files already at ${version}`,
);

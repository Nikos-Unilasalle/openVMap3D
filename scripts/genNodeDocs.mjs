#!/usr/bin/env node
/**
 * Regenerates the README's node catalogue from DEFAULT_REGISTRY — the single
 * source of truth. The hand-written table it replaces had drifted badly:
 * dozens of type strings no longer existed and most of the real catalogue
 * wasn't listed at all. With this script the catalogue can't lie again.
 *
 * Usage:
 *   npm run docs:nodes          rewrite the section between the markers
 *   npm run docs:nodes -- --check   exit 1 if the section is out of date (CI)
 *
 * The section is delimited by `<!-- nodes:begin -->` / `<!-- nodes:end -->`
 * in README.md; everything else in the file is left untouched.
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readmePath = resolve(root, "README.md");
const cacheDir = resolve(root, "node_modules/.cache");
const bundlePath = resolve(cacheDir, "tsuji-node-docs.mjs");

const check = process.argv.includes("--check");

await build({
  entryPoints: [resolve(here, "nodeDocsEntry.ts")],
  bundle: true,
  platform: "node",
  // ESM, not CJS: three's loaders evaluate `new URL(..., import.meta.url)`
  // (draco wasm path) at import time, which has no meaning in CJS.
  format: "esm",
  outfile: bundlePath,
  logLevel: "warning",
});

const { ENTRIES, CATEGORIES } = await import(pathToFileURL(bundlePath).href);
rmSync(bundlePath, { force: true });

/** @type {Map<string, {type: string, label: string, category: string}[]>} */
const byCategory = new Map();
for (const entry of ENTRIES) {
  if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
  byCategory.get(entry.category).push(entry);
}

const sections = [];
for (const category of CATEGORIES.order) {
  const nodes = byCategory.get(category);
  if (!nodes || nodes.length === 0) continue;
  const label = CATEGORIES.labels[category] ?? category;
  const rows = nodes
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
    .map((n) => `| **${n.label}** | \`${n.type}\` |`)
    .join("\n");
  sections.push(`### ${label}\n\n| Node | Type |\n| :--- | :--- |\n${rows}`);
}

const generated = [
  `**${ENTRIES.length} nœuds enregistrés** — tableau généré depuis \`DEFAULT_REGISTRY\` par \`npm run docs:nodes\`, ne pas éditer à la main.`,
  "",
  ...sections,
].join("\n\n");

const BEGIN = "<!-- nodes:begin -->";
const END = "<!-- nodes:end -->";

const readme = readFileSync(readmePath, "utf8");
const startIndex = readme.indexOf(BEGIN);
const endIndex = readme.indexOf(END);
if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.error(
    "README.md is missing the <!-- nodes:begin --> / <!-- nodes:end --> markers around the node catalogue.",
  );
  process.exit(1);
}

const next = `${readme.slice(0, startIndex + BEGIN.length)}\n${generated}\n${readme.slice(endIndex)}`;

if (check) {
  if (next !== readme) {
    console.error("README.md's node catalogue is out of date — run `npm run docs:nodes`.");
    process.exit(1);
  }
  console.log("README node catalogue is up to date.");
} else {
  if (next !== readme) {
    writeFileSync(readmePath, next);
    console.log(`README node catalogue regenerated (${ENTRIES.length} nodes).`);
  } else {
    console.log("README node catalogue already up to date.");
  }
}

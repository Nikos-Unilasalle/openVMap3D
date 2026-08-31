/**
 * Bundle entry for scripts/genNodeDocs.mjs: exports the registry's node list
 * and the category metadata as plain JSON-able data. Kept separate from the
 * generator so esbuild has a tiny surface to bundle (the registry pulls in
 * all of three, papaparse, etc. — all safe to import in node, none of it is
 * executed).
 */
import { DEFAULT_REGISTRY } from "../src/shared/graph/nodes";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "../src/shared/graph/categories";

export const ENTRIES = Array.from(DEFAULT_REGISTRY.entries()).map(([type, def]) => ({
  type,
  label: def.label,
  category: def.category,
}));

export const CATEGORIES = {
  order: CATEGORY_ORDER,
  labels: CATEGORY_LABEL,
};

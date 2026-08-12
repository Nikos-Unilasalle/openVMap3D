/**
 * Loaded-CSV cache, keyed by node id — same shape as the GPU-resource
 * caches (object.ts's meshCache, merge.ts's groupCache): loading is a
 * side effect triggered by a user action (the file picker), not something
 * `evaluate()` can do itself (it must stay pure and synchronous), so the
 * result lives here instead, outside the pure calculation. `setCsv` is
 * called once, from the param panel's file-picker handler, after the file
 * is read and parsed; `evaluate()` (and `dynamicParamFields`, for the
 * column dropdown) then just read whatever's here right now.
 */
export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

const csvCache = new Map<string, CsvData>();

export function getCsv(nodeId: string): CsvData | undefined {
  return csvCache.get(nodeId);
}

export function setCsv(nodeId: string, data: CsvData): void {
  csvCache.set(nodeId, data);
}

/**
 * A v4-style unique id. `crypto.randomUUID()` only exists in secure contexts
 * (HTTPS / localhost), so a plain-http deployment (e.g. http://tsiju.xyz) throws
 * on it and node add/paste silently dies. Fall back to a random UUID otherwise.
 */
export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

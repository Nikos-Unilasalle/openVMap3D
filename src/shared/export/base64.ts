/**
 * Chunked base64 codec for typed-array buffers. `btoa`/`atob` only accept a
 * "binary string" (one char per byte), and `String.fromCharCode(...bytes)`
 * blows the call stack past a few hundred thousand elements — exactly the
 * range a point cloud's position/color attributes land in. Chunking through
 * a fixed-size window keeps every call well under that limit regardless of
 * how many points the source geometry has.
 */
const CHUNK_SIZE = 0x8000;

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Minimal ZIP writer — STORE method only (no compression). Used solely for
 * the browser-fallback download path (a folder export becomes one .zip
 * since a browser can't hand the user a real directory); the Tauri path
 * writes actual files to disk instead (see saveExportFolder.ts) and never
 * touches this. STORE is fine here: the payload is already-compressed PNGs
 * plus base64 text, so DEFLATE would buy little, and skipping it avoids
 * pulling in a compression library for what's essentially "N files as one
 * download."
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

/** DOS date/time fields ZIP requires per entry — fixed dummy value, no file in this export needs a meaningful mtime. */
const DOS_DATE = (1 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.path);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    localChunks.push(new Uint8Array(local.buffer), nameBytes, entry.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, DOS_TIME, true);
    central.setUint16(14, DOS_DATE, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);

    centralChunks.push(new Uint8Array(central.buffer), nameBytes);

    offset += local.buffer.byteLength + nameBytes.length + size;
  }

  const centralOffset = offset;
  const centralSize = centralChunks.reduce((a, c) => a + c.length, 0);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true);

  const total = centralOffset + centralSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of localChunks) {
    out.set(c, p);
    p += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, p);
    p += c.length;
  }
  out.set(new Uint8Array(end.buffer), p);
  return out;
}

#!/usr/bin/env python3
"""Bakes tools/raccoon.obj into src/shared/three/raccoonGeometry.ts.

The Raccoon node is a *primitive*, not a loader: its mesh has to exist the
moment the node is dropped on the canvas, with no file to find and nothing to
rehydrate (rehydrateFiles is Tauri-only and reads absolute local paths, so
anything shipped with the app cannot go through the loader nodes at all).

Run this only to change the model. The OBJ lives under tools/ rather than
public/ so Vite never serves it — it is build-time source, not a runtime
asset.

    python3 tools/bake_raccoon.py
"""
import base64
import os
import struct

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "tools/raccoon.obj")
TARGET = os.path.join(ROOT, "src/shared/three/raccoonGeometry.ts")


def parse_obj(path):
    positions, uvs, normals, faces = [], [], [], []
    with open(path) as handle:
        for line in handle:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == "v":
                positions.append(tuple(map(float, parts[1:4])))
            elif parts[0] == "vt":
                uvs.append(tuple(map(float, parts[1:3])))
            elif parts[0] == "vn":
                normals.append(tuple(map(float, parts[1:4])))
            elif parts[0] == "f":
                if len(parts) != 4:
                    raise SystemExit("triangulate the mesh first — got an n-gon")
                faces.append(parts[1:])
    return positions, uvs, normals, faces


def build(positions, uvs, normals, faces):
    """Flat non-indexed arrays, centred on X/Z with the feet left on y=0.

    Non-indexed because the source gives every triangle corner its own normal
    and UV: all 4,200 corners are already unique, so an index buffer would add
    numbers without removing any.
    """
    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    zs = [p[2] for p in positions]
    cx = (min(xs) + max(xs)) / 2
    cz = (min(zs) + max(zs)) / 2
    floor = min(ys)

    out_pos, out_nrm, out_uv = [], [], []
    for face in faces:
        for corner in face:
            bits = corner.split("/")
            x, y, z = positions[int(bits[0]) - 1]
            out_pos += [x - cx, y - floor, z - cz]
            out_nrm += list(normals[int(bits[2]) - 1]) if len(bits) > 2 and bits[2] else [0.0, 0.0, 1.0]
            out_uv += list(uvs[int(bits[1]) - 1]) if len(bits) > 1 and bits[1] else [0.0, 0.0]
    return out_pos, out_nrm, out_uv


def b64(values):
    return base64.b64encode(struct.pack("<%df" % len(values), *values)).decode()


def wrap(payload, width=100):
    chunks = [payload[i:i + width] for i in range(0, len(payload), width)]
    return "\n".join('  "%s" +' % c for c in chunks)[:-2].rstrip()


def main():
    positions, uvs, normals, faces = parse_obj(SOURCE)
    pos, nrm, uv = build(positions, uvs, normals, faces)
    print(f"{len(pos) // 3} vertices / {len(pos) // 9} triangles")

    with open(TARGET) as handle:
        current = handle.read()
    header = current.split("const POSITIONS_B64 =")[0]

    with open(TARGET, "w") as handle:
        handle.write(header)
        handle.write(f"const POSITIONS_B64 =\n{wrap(b64(pos))};\n\n")
        handle.write(f"const NORMALS_B64 =\n{wrap(b64(nrm))};\n\n")
        handle.write(f"const UVS_B64 =\n{wrap(b64(uv))};\n")
        handle.write(current.split(";\n", 1)[0] and "")
        handle.write(TAIL)
    print("wrote", os.path.relpath(TARGET, ROOT))


TAIL = '''
function decodeFloats(base64: string): Float32Array {
  // atob in the browser and in Node 16+; Buffer is the fallback for older
  // Node, which the test runner could still be on.
  const binary =
    typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

let cached: THREE.BufferGeometry | undefined;

/**
 * The shared raccoon geometry. One instance for the whole app: every Raccoon
 * node wraps it in its own Mesh with its own material, exactly as the other
 * primitives share nothing but their construction code.
 */
export function raccoonGeometry(): THREE.BufferGeometry {
  if (!cached) {
    cached = new THREE.BufferGeometry();
    cached.setAttribute("position", new THREE.BufferAttribute(decodeFloats(POSITIONS_B64), 3));
    cached.setAttribute("normal", new THREE.BufferAttribute(decodeFloats(NORMALS_B64), 3));
    cached.setAttribute("uv", new THREE.BufferAttribute(decodeFloats(UVS_B64), 2));
    cached.computeBoundingBox();
    cached.computeBoundingSphere();
  }
  return cached;
}
'''


if __name__ == "__main__":
    main()

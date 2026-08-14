import * as THREE from "three";

/**
 * A single billboard mesh showing a short string, rendered onto a canvas and
 * mapped as a texture — the same technique Bar Graph pioneered for its
 * per-bar value labels (see object.ts), pulled out here so Line Graph and
 * Chart Axis don't each reimplement it. `mesh` is a unit PlaneGeometry;
 * callers position/rotate it, `updateLabelText` handles sizing.
 */
export interface LabelMeshState {
  mesh: THREE.Mesh;
  canvas?: HTMLCanvasElement;
  texture?: THREE.CanvasTexture;
  lastText?: string;
  aspect?: number;
}

export function createLabelMesh(nodeId: string): LabelMeshState {
  const mat = new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide });
  const geom = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.visible = false;
  mesh.userData.nodeId = nodeId;
  return { mesh };
}

/**
 * Re-renders the label's canvas texture only when `text` actually changed
 * since the last call, then sizes the mesh to `worldHeight` at the texture's
 * own aspect ratio. Safe to call every frame — unchanged text is a no-op
 * past the string comparison.
 */
export function updateLabelText(label: LabelMeshState, text: string, worldHeight: number): void {
  if (label.lastText !== text) {
    if (typeof document !== "undefined" && document.createElement) {
      if (!label.canvas) label.canvas = document.createElement("canvas");
      const canvas = label.canvas;
      const ctx2d = canvas.getContext ? canvas.getContext("2d") : null;

      if (ctx2d) {
        const fontSize = 256;
        ctx2d.font = `bold ${fontSize}px sans-serif`;
        const metrics = ctx2d.measureText(text);
        const w = Math.max(128, Math.ceil((metrics.width || 128) + fontSize * 0.4));
        const h = Math.max(64, Math.ceil(fontSize * 1.4));
        canvas.width = w;
        canvas.height = h;

        ctx2d.font = `bold ${fontSize}px sans-serif`;
        ctx2d.fillStyle = "#ffffff";
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "middle";
        ctx2d.clearRect(0, 0, w, h);
        ctx2d.fillText(text, w / 2, h / 2);

        if (label.texture) label.texture.dispose();
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.anisotropy = 16;
        label.texture = tex;
        (label.mesh.material as THREE.MeshBasicMaterial).map = tex;
        (label.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
        label.aspect = w / h;
      }
    }
    label.lastText = text;
  }

  const aspect = label.aspect ?? 2;
  label.mesh.scale.set(worldHeight * aspect, worldHeight, 1);
}

export function disposeLabelMesh(label: LabelMeshState): void {
  label.mesh.geometry.dispose();
  (label.mesh.material as THREE.Material).dispose();
  label.texture?.dispose();
}

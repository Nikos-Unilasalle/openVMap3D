# Évolution : Export Vidéo Matériel via WebCodecs (4K60 MP4/AV1)

*Domaine : Exportation Hors-Ligne & Rendu Vidéo Accéléré*

---

## 1. Limitations de `MediaRecorder`
Le système actuel (`src/shared/export/videoExport.ts`) utilise l'API `MediaRecorder` du navigateur :
- Encodage en temps réel contraint (WebM / VP9) souvent limité en résolution et sensible aux chutes de framerate lors de l'enregistrement.

---

## 2. Solution avec l'API WebCodecs (`VideoEncoder`)
1. Extraction déterministe frame-par-frame via `renderer.readRenderTargetPixels()`.
2. Envoi direct des frames à `VideoEncoder` (support H.264, H.265/HEVC, AV1).
3. Multiplexage direct MP4 via `mp4box.js` ou `webm-muxer`.
4. **Gain** : Export d'animations 4K à 60 fps constants sans aucune perte d'image, à une vitesse $5\times$ à $10\times$ plus rapide.

---

## 🔗 Notes Associées
- [[Spout and Syphon Shared GPU Memory Streaming]]
- [[Graph Evaluation Runtime]]

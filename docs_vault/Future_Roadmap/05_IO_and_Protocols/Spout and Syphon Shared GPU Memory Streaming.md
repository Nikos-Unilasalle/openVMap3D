# Évolution : Partage de Textures GPU en Mémoire Partagée (Spout / Syphon)

*Domaine : Flux Vidéo Inter-Applications Zéro-Copie*

---

## 1. Objectif
Permettre à Tsuji d'envoyer son rendu 3D temps réel à d'autres logiciels multimédias (Resolume Arena, MadMapper, OBS Studio, Notch) ou de recevoir des flux de caméras externes sans aucune copie CPU.

---

## 2. Spécification Spout (Windows) & Syphon (macOS)
- **Texture DirectX / Metal Partagée** : Le buffer de rendu Three.js (`WebGLRenderTarget`) est enregistré comme texture partagée dans le composant natif Tauri en Rust.
- **Débit** : Rendu $4\text{K à } 60\text{ fps}$ avec une latence nulle ($<1\text{ ms}$).

---

## 🔗 Notes Associées
- [[WebCodecs Hardware Video Export at 4K60]]
- [[ThreeJS Viewport and Calibration Pipeline]]

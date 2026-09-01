# Prévention des Fuites de Mémoire VRAM sur GPU

*Domaine : Gestion Mémoire WebGL / WebGPU & Cycle de Vie Three.js*

---

## 1. La Déconnexion entre Garbage Collection et VRAM
En JavaScript, les ressources GPU (`THREE.BufferGeometry`, `THREE.Texture`, `THREE.WebGLRenderTarget`, `THREE.Material`) sont des descripteurs JS pointant vers des structures allouées dans la mémoire physique de la carte graphique (VRAM).
- Lorsque la variable JS est supprimée ou mise à `null`, le ramasse-miettes détruit l'objet JS, mais **les données sur le GPU restent allouées indéfiniment**.
- Seul un appel explicite à `.dispose()` sur chaque ressource transmet l'ordre de libération au pilote graphique (`gl.deleteBuffer()`, `gl.deleteTexture()`).

---

## 2. Les 4 Catégories Critiques à Libérer

1. **Géométries (`geometry.dispose()`)** : Libère les Vertex Buffer Objects (VBO) et Index Buffers (IBO).
2. **Textures (`texture.dispose()`)** : Libère la mémoire vidéo des pixels et des mipmaps.
3. **Matériaux (`material.dispose()`)** : Libère le programme de shader compilé et détache les uniformes.
4. **Cibles de Rendu (`renderTarget.dispose()`)** : Libère les framebuffers FBO hors-écran.

---

## 🔗 Notes Associées
- [[Recursive ThreeJS Disposal Protocol]]
- [[JavaScript Heap vs GPU VRAM Dual-Stack]]
- [[Resource Lifecycle and Cache Garbage Collection]]

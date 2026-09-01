# Préchauffage et Compilation Asynchrone des Shaders

*Domaine : Fluidité de Rendu, Élimination des Saccades (Jank)*

---

## 1. Le Phénomène du "Shader Compilation Stutter"
Dans WebGL et Three.js, un shader GLSL n'est compilé et lié sur le GPU qu'au moment précis où un objet portant ce matériau **entre pour la première fois dans le champ de vision** de la caméra.
- La compilation synchrone bloque le thread principal pendant $20$ à $150\text{ ms}$, provoquant un gel visuel brutal (*jank*).

---

## 2. Solution : `renderer.compileAsync()`

Three.js fournit l'API `renderer.compileAsync(scene, camera)` (ou `renderer.compile()` en synchrone) :
- Permet de forcer la compilation de tous les programmes graphiques et l'allocation des buffers VRAM pendant l'écran de chargement ou en tâche de fond.

```typescript
export async function prewarmScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
  // Préchauffe de manière non bloquante l'intégralité des shaders de la scène :
  await renderer.compileAsync(scene, camera);
}
```

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[GLSL Branchless Programming and Optimization]]
- [[WebGPU Architecture and TSL Shaders]]

# Évolution : Migration vers `WebGPURenderer`

*Domaine : Pipeline Graphique WebGPU*

---

## 1. Objectif
Remplacer le renderer WebGL standard par le `WebGPURenderer` (disponible dans Three.js r171+) avec rétrocompatibilité automatique WebGL 2.0.

---

## 2. Étapes d'Implémentation
1. **Initialisation Asynchrone** :
   ```typescript
   import { WebGPURenderer } from "three/webgpu";

   const renderer = new WebGPURenderer({ antialias: true });
   await renderer.init();
   ```
2. **Détection de Fonctionnalités** : Détecter `navigator.gpu` et basculer en mode fallback transparent en cas d'absence de pilote compatible.

---

## 🔗 Notes Associées
- [[TSL Compute Shaders for Particle Simulation]]
- [[WebGPU Architecture and TSL Shaders]]

# Évolution : Compute Shaders TSL pour Simulation de Particules

*Domaine : Calcul Parallèle & Simulation de Particules*

---

## 1. Objectif
Remplacer le système `GPUComputationRenderer` actuel par des passes de calcul **Compute Shaders TSL**.

---

## 2. Spécification Technique
- **Storage Buffers Directs** : Les positions et vitesses sont stockées dans des `storageBuffer` GPU sans passer par des textures 2D.
- **Passes de Forces et Collisions** : Calculs de turbulence Simplex, forces magnétiques et collisions avec les surfaces du décor via TSL.
- **Capacité** : Simulation fluide de plus de 2 millions de particules interactives à 60 fps.

---

## 🔗 Notes Associées
- [[WebGPURenderer Architecture Migration]]
- [[GPGPU Ping-Pong Texture Simulation]]
- [[Parametric Geometry and Modifiers]]

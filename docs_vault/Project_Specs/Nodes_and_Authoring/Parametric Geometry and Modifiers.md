# Parametric Geometry and Modifiers (Tsuji)

*Emplacement dans le code : `src/shared/graph/nodes/lattice.ts`, `subdivide.ts`, `boolean.ts`, `particleRuntime.ts`*

Ce document décrit le traitement procédural des maillages 3D et les shaders personnalisés dans Tsuji.

---

## 1. Déformation par Treillis 3D (`lattice.ts`)
- Applique une interpolation trilinéaire de Bernstein pour déformer un maillage selon une grille de points de contrôle paramétrables.
- Les sommets originaux sont préservés et recalculés en temps réel dans un buffer Three.js dédié.

---

## 2. Subdivision de Maillage et Opérations CSG
- **Subdivision (`subdivide.ts`)** : Lissage Catmull-Clark / Loop.
- **Booléens (`boolean.ts`)** : Exploite `three-bvh-csg` pour exécuter des unions, soustractions et intersections solides accélérées par arbre BVH.

---

## 3. Moteur de Particules GPGPU (`particleRuntime.ts`)
- Utilise `GPUComputationRenderer` pour mettre à jour des textures de position et de vitesse flottantes à 60 fps.
- Les forces appliquées (champs de bruit Simplex, gravité, vortex) sont calculées dans des fragment shaders GLSL.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[Spatial Indexing and BVH Acceleration]]

# Compression Géométrique Meshopt & Outil `gltfpack`

*Domaine : Optimisation Géométrique, Quantization & Cache Sommets GPU*

---

## 1. Principes de Meshopt (Meshoptimizer)
Créé par Arseny Kapoulkine, **Meshoptimizer** est la référence industrielle pour l'optimisation des maillages 3D en production.

### Optimisations Appliquées :
1. **Vertex Cache Optimization** : Réordonnancement des indices pour maximiser le réemploi des sommets dans le cache matériel L1 du GPU.
2. **Vertex Fetch Optimization** : Réordonnancement des sommets en mémoire pour garantir un accès séquentiel et réduire les défauts de cache mémoire.
3. **Quantization** : Compression des positions 32-bit flottantes vers des entiers 16-bit ou 8-bit normalisés.

---

## 2. Automatisation avec `gltfpack`

L'outil en ligne de commande `gltfpack` applique automatiquement ces optimisations sur les fichiers `.gltf` / `.glb` :
```bash
gltfpack -i model.gltf -o model_optimized.glb -cc -tc -kn
```
- `-cc` : Compression Meshopt complète.
- `-tc` : Conversion automatique de toutes les textures en KTX2.
- `-kn` : Maintien des nœuds d'animation.

---

## 🔗 Notes Associées
- [[Draco vs Meshopt Comparison]]
- [[KTX2 and Basis Universal Texture Compression]]
- [[GLTF Asset Ingestion Pipeline]]

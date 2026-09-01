# Évolution : Virtualisation d'Assets & Pipeline de Transcodage KTX2

*Domaine : Gestion des Données Lourdes, Chargement Asynchrone & Caching*

---

## 1. Contexte & Problématique

Dans Tsuji, le chargement de modèles 3D complexes (ex. GLTF avec textures 4K, nuages de points PLY de plusieurs millions de points) peut figer l'interface pendant plusieurs secondes lors de l'importation.

---

## 2. Architecture de Virtualisation & Chargement Asynchrone

```
[Import Fichier Utilisateur (GLTF / OBJ / PLY)]
                      │
                      ▼
[Web Worker de Transcodage d'Assets]
  ├── Décompression Meshopt / Draco (Wasm SIMD)
  ├── Transcodage KTX2 / Basis Universal en format GPU natif (BC7/ASTC)
  └── Calcul de la hiérarchie BVH
                      │
                      ▼
[Stockage Binaire Persistant (IndexedDB)]
                      │
                      ▼ (Transferable ArrayBuffers)
[Mise à Disposition Instantanée dans le Graphe de Rendu]
```

### 2.1 Points Clés de l'Implémentation :
1. **Transcodage Basis Universal en Tâche de Fond** : Les images PNG/JPG sont converties automatiquement en formats GPU compressés dans un Worker sans ralentir le rendu 3D.
2. **Niveau de Détail Géométrique Automatique (LOD Procedural)** : Génération automatique de 3 versions allégées des maillages importés pour optimiser le rendu à distance.
3. **Persistance des Nuages de Points Prétraités** : Les nuages de points PLY/XYZ sont analysés une seule fois et mis en cache dans IndexedDB pour un chargement immédiat aux lancements ultérieurs.

---

## 🔗 Notes Associées
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[Parametric Geometry and Modifiers]]

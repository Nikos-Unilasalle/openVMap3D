# ThreeJS Viewport and Calibration Pipeline

*Emplacement dans le code : `src/shared/three/Viewport.tsx`, `src/shared/graph/calibration/dlt.ts`*

Ce document détaille le pipeline de rendu Three.js, la gestion des vues multiples et la calibration spatiale par DLT dans Tsuji.

---

## 1. Pipeline 3D Unifié

- Tous les éléments 2D (formes, textes) sont générés comme de la géométrie 3D plane positionnée à $z = 0$.
- Les projections, déformations et décalages d'angle s'exécutent au sein du même pipeline Three.js sans surcouche 2D externe.

---

## 2. Calibration Spatiale : Nœud `Room Corner` et Solveur DLT

- **Principe** : L'opérateur définit les dimensions physiques de la pièce et ajuste les poignées 2D sur les coins visibles de la salle.
- **Calcul DLT (`dlt.ts`)** : La résolution matricielle estime simultanément la position $(x, y, z)$, l'orientation tridimensionnelle et la matrice de projection asymétrique intégrant le *lens shift* du vidéoprojecteur.
- **Erreur de Reprojection** : Le résidu numérique est renvoyé en temps réel pour valider la précision de l'alignement.

---

## 3. Chaîne de Post-Traitement (`postProcessChain.ts`)

Passe de rendu en espace écran combinant :
- Bloom (`postprocess/bloom`)
- Profondeur de champ DOF (`postprocess/dof`)
- Vignettage, grain argentique, aberrations chromatiques (RGB shift) et occlusion ambiante SSAO.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Projective Geometry and DLT Calibration]]
- [[State Management and Multi-Canvas]]

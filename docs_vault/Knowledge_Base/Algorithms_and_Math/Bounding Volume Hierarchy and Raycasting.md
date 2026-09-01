# Hiérarchie de Boîtes Englobantes (BVH) & Raycasting

*Domaine : Structures Spatiales & Détection d'Intersection*

---

## 1. Principe de l'Arbre BVH
Un arbre BVH (Bounding Volume Hierarchy) regroupe récursivement les polygones d'un maillage 3D dans un arbre binaire de boîtes alignées sur les axes (AABB).

---

## 2. Accélération de l'Intersection de Rayon
- **Sans BVH** : Test linéaire de tous les triangles $\mathcal{O}(N)$ ($100\,000$ tests pour $100\text{k}$ faces).
- **Avec BVH (`three-mesh-bvh`)** : Traversée d'arbre $\mathcal{O}(\log N)$ ($\approx 15$ tests de boîtes englobantes).
- **Applications** : Sélection précise à la souris, détection de collisions, opérations booléennes CSG fluides à 60 fps.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Parametric Geometry and Modifiers]]

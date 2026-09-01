# Spatial Indexing and BVH Acceleration

*Domaine : Structures de Données Spatiales & Algorithmes Géométriques*

Ce document détaille les principes de partitionnement spatial par arbres **BVH** (Bounding Volume Hierarchy) et leur impact sur le calcul temps réel en infographie 3D.

---

## 1. Problématique du Raycasting Naïf

Dans un moteur 3D standard, tester l'intersection d'un rayon avec un maillage géométrique nécessite de vérifier l'algorithme d'intersection Rayon-Triangle (ex. Möller–Trumbore) pour chaque face :
- Pour un maillage de $N = 100\,000$ triangles, cela représente $100\,000$ tests géométriques par frame et par rayon.
- Complexité algorithmique : $\mathcal{O}(N)$.

---

## 2. Structure d'un Arbre BVH

Un arbre BVH partitionne récursivement l'ensemble des triangles d'un maillage dans une hiérarchie d'englobants englobants (généralement des boîtes alignées sur les axes - **AABB** / *Axis-Aligned Bounding Boxes*) :

```
                        [Racine : Scène Entière]
                               /        \
                    [AABB Gauche]      [AABB Droite]
                       /     \            /     \
                   [Feuille] [Feuille] [Feuille] [Feuille]
```

### Algorithme de Traversée :
1. Tester l'intersection du rayon avec la boîte englobante racine.
2. Si le rayon ne touche pas la boîte, **ignorer immédiatement tout le sous-arbre** correspondant.
3. Si la boîte est touchée, descendre récursivement vers les enfants.
4. Seuls les triangles contenus dans les boîtes feuilles intersectées sont testés.

### Résultat de Performance :
- Nombre moyen de tests : proportionnel à la hauteur de l'arbre $\mathcal{O}(\log N)$.
- Pour $100\,000$ triangles, le nombre de tests passe de $100\,000$ à environ $15$ à $20$.

---

## 3. Applications Pratiques

1. **Picking & Interaction UI 3D** : Sélection précise de sommets, d'arêtes ou de faces sous le curseur de la souris à 60/120 fps.
2. **Booléens CSG (Constructive Solid Geometry)** : Calcul rapide des intersections et des découpes entre deux maillages complexes sans figer le thread principal.
3. **Détection de Collision et Physique** : Détection des contacts précis entre solides ou particules.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[Parametric Geometry and Modifiers]]

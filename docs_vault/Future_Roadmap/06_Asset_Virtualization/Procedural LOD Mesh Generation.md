# Évolution : Génération Procédurale de Niveaux de Détail (LODs)

*Domaine : Gestion de la Complexité Géométrique*

---

## 1. Objectif
Générer automatiquement des variantes simplifiées des maillages importés (à 50%, 25% et 10% du nombre original de triangles) via l'algorithme de simplification de sommets (*Quadratic Error Metric - QEM*) dans un Web Worker.

---

## 2. Basculement Dynamique Three.js (`THREE.LOD`)
Le nœud d'affichage commute automatiquement la géométrie affichée en fonction de la distance à la caméra active (`activeCameraPose`), réduisant le nombre de triangles dessinés au strict nécessaire.

---

## 🔗 Notes Associées
- [[Meshopt Geometry Compression and gltfpack]]
- [[Frustum Culling and Bounding Volumes]]

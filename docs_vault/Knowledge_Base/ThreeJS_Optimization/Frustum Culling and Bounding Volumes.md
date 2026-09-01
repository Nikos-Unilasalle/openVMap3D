# Culling de Frustum & Volumes Englobants (Bounding Spheres)

*Domaine : Élimination des Objets Hors-Champ & Performance CPU/GPU*

---

## 1. Principe du Frustum Culling
Le *Frustum Culling* teste si la boîte ou la sphère englobante d'un maillage intersecte la pyramide de vision (frustum) de la caméra.
- Si l'objet est hors-champ, Three.js ignore complètement son draw call pour la trame courante.

---

## 2. Bonnes Pratiques & Pièges

1. **Pré-calcul des Sphères Englobantes** :
   S'assurer que `geometry.computeBoundingSphere()` a été appelé lors de la création de géométries procédurales, sous peine d'artefacts d'apparition/disparition.
2. **Désactivation pour Nuages de Particules & Déformations** :
   Pour les nuages de particules occupant tout l'espace ou les maillages animés par vertex shader (où les sommets bougent sans que la géométrie CPU ne le sache) :
   ```typescript
   mesh.frustumCulled = false;
   ```
   Cela évite que l'objet ne disparaisse brutalement lorsque son centre théorique sort du cadre.

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[Bounding Volume Hierarchy and Raycasting]]

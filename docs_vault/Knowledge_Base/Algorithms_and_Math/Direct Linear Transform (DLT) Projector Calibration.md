# Calibration par Transformation Linéaire Directe (DLT)

*Domaine : Vision par Ordinateur & Vidéo-Mapping Spatial*

---

## 1. Formulation de la DLT
La méthode DLT permet d'estimer la matrice de projection $3 \times 4$ ($\mathbf{P}$) liant des coordonnées 3D réelles $\mathbf{X}_i = [X, Y, Z, 1]^T$ à leurs projections 2D mesurées sur l'écran $\mathbf{x}_i = [u, v, 1]^T$ :
$$s \mathbf{x}_i = \mathbf{P} \mathbf{X}_i$$

---

## 2. Résolution par SVD
À partir d'au moins 6 points non coplanaires (par exemple les 6 coins d'une pièce), le système d'équations linéaires $\mathbf{A} \mathbf{p} = 0$ est résolu par décomposition en valeurs singulières (**SVD**).
- **Résultat** : Récupération simultanée de la position $(x, y, z)$, de la rotation 3D et des paramètres de focale et de décentrement de lentille du projecteur.

---

## 🔗 Notes Associées
- [[Asymmetric Projection Frustums and Lens Shift]]
- [[ThreeJS Viewport and Calibration Pipeline]]

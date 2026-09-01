# Frustums Asymétriques & Décentrement Optique (Lens Shift)

*Domaine : Optique Projective & Modélisation de Vidéoprojecteurs*

---

## 1. Pourquoi le FOV Standard Échoue
Une caméra 3D classique suppose un point principal optique parfaitement centré au milieu du capteur.
- Les vidéoprojecteurs d'installation projettent l'image bien au-dessus de l'axe de la lentille (*Lens Shift* vertical de 50% à 150%). Un champ de vision symétrique (FOV) est incapable de modéliser ce décalage.

---

## 2. La Matrice de Projection Asymétrique
$$\mathbf{M}_{\text{proj}} = \begin{bmatrix}
\frac{2 n}{r - l} & 0 & \frac{r + l}{r - l} & 0 \\
0 & \frac{2 n}{t - b} & \frac{t + b}{t - b} & 0 \\
0 & 0 & -\frac{f + n}{f - n} & -\frac{2 f n}{f - n} \\
0 & 0 & -1 & 0
\end{bmatrix}$$
où $l, r, b, t$ désignent les coordonnées asymétriques des plans gauche, droite, bas et haut du frustum.

---

## 🔗 Notes Associées
- [[Direct Linear Transform (DLT) Projector Calibration]]
- [[ThreeJS Viewport and Calibration Pipeline]]

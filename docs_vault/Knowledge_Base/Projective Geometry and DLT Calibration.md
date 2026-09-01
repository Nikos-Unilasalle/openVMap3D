# Projective Geometry and DLT Calibration

*Domaine : Vision par Ordinateur, Géométrie Projective & Vidéo-Mapping 3D*

Ce document expose les principes mathématiques de la calibration géométrique pour les installations de vidéo-projection spatiale et l'algorithme DLT (Direct Linear Transform).

---

## 1. Limites des Méthodes par Points de Fuite

Les approches traditionnelles de calibration basée sur la photo (ex: fSpy) exploitant deux points de fuite échouent dans les configurations réelles de vidéo-projection pour trois raisons :
1. **Perte de la position 3D** : Deux points de fuite permettent de retrouver la rotation et la focale, mais **jamais la position spatiale $(x, y, z)$** du projecteur dans la pièce.
2. **Décentrement optique (*Lens Shift*)** : Les projecteurs d'installation ont un point principal très décentré (projection au-dessus de l'axe de la lentille). Les formules classiques supposent un point principal centré $(c_x = 0, c_y = 0)$, faussant totalement le modèle.
3. **Conditionnement numérique dégénéré** : Sur des surfaces restreintes (ex. coin de mur), les lignes tracées sont quasi-parallèles, repoussant les points de fuite à l'infini avec une instabilité numérique extrême.

---

## 2. L'Algorithme DLT (Direct Linear Transform)

La méthode DLT résout simultanément l'ensemble des paramètres extrinsèques (position, rotation) et intrinsèques (focales $f_x, f_y$, point principal $c_x, c_y$ correspondant au lens shift).

### Formulation Matricielle :
Chaque point de référence $i$ associe une coordonnée 3D connue dans l'espace physique $\mathbf{X}_i = [X_i, Y_i, Z_i, 1]^T$ à sa projection 2D observée sur l'écran $\mathbf{x}_i = [u_i, v_i, 1]^T$ :
$$s \mathbf{x}_i = \mathbf{P} \mathbf{X}_i$$
où $\mathbf{P}$ est la matrice de projection $3 \times 4$.

Pour chaque point de correspondance, deux équations linéaires indépendantes sont formées :
$$\begin{aligned}
\mathbf{p}_1^T \mathbf{X}_i - u_i \mathbf{p}_3^T \mathbf{X}_i &= 0 \\
\mathbf{p}_2^T \mathbf{X}_i - v_i \mathbf{p}_3^T \mathbf{X}_i &= 0
\end{aligned}$$

Avec au moins 6 points non coplanaires (par exemple les 6 sommets d'un coin de pièce tridimensionnel), le système homogène $\mathbf{A} \mathbf{p} = 0$ est résolu par **Décomposition en Valeurs Singulières (SVD)**.

---

## 3. Matrice de Projection Asymétrique

Une fois la matrice $\mathbf{P}$ obtenue, elle est décomposée (via décomposition QR inverse) pour générer directement la **matrice de projection perspective asymétrique** exploitable par la caméra virtuelle 3D :
$$\mathbf{M}_{\text{proj}} = \begin{bmatrix}
\frac{2 n}{r - l} & 0 & \frac{r + l}{r - l} & 0 \\
0 & \frac{2 n}{t - b} & \frac{t + b}{t - b} & 0 \\
0 & 0 & -\frac{f + n}{f - n} & -\frac{2 f n}{f - n} \\
0 & 0 & -1 & 0
\end{bmatrix}$$
Ce modèle intègre parfaitement le décentrement optique (*frustum asymétrique*) sans artifice 2D.

---

## 🔗 Notes Associées
- [[ThreeJS 3D Viewport Architecture]]
- [[Spatial Indexing and BVH Acceleration]]

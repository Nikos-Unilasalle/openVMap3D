# Évolution : Spécification du Shader de Soft-Edge Blending

*Domaine : Vidéo-Mapping Multi-Projecteurs & Raccord Lumineux*

---

## 1. Formulation Mathématique du Fondu de Bord
Pour compenser la superposition de faisceaux lumineux entre projecteurs voisins :
$$I(u) = \begin{cases}
\left( \frac{1 - \cos(\pi u / w)}{2} \right)^\gamma & \text{si } u \in [0, w] \\
1.0 & \text{au-delà}
\end{cases}$$
- $w$ : Largeur normalisée de la zone de recouvrement ($10\% - 25\%$).
- $\gamma$ : Facteur de correction gamma de la lampe du projecteur ($\approx 2.2$).

---

## 2. Le Nœud `calibration/edge-blend`
Inséré en amont de la sortie finale pour générer les masques d'atténuation sur les 4 côtés (Gauche, Droite, Haut, Bas).

---

## 🔗 Notes Associées
- [[Non-Linear 3D Mesh Warping Grids]]
- [[Direct Linear Transform (DLT) Projector Calibration]]

# Solveurs de Bézier Cubique par Bissection de Racine

*Domaine : Résolution Numérique & Évaluation de Courbes Paramétriques*

---

## 1. La Courbe de Bézier Cubique 2D
Définie par $P_0=(0,0)$, $P_3=(1,1)$ et deux points de contrôle $P_1=(x_1, y_1)$, $P_2=(x_2, y_2)$ :
$$\begin{aligned}
x(t) &= 3(1-t)^2 t x_1 + 3(1-t) t^2 x_2 + t^3 \\
y(t) &= 3(1-t)^2 t y_1 + 3(1-t) t^2 y_2 + t^3
\end{aligned}$$

---

## 2. Résolution Numérique de $x(t) = p$
Étant donné un progrès temporel $p \in [0, 1]$, on recherche le paramètre $t$ tel que $x(t) = p$ :
- **Méthode de Bissection** : 20 itérations de division par deux de l'intervalle $[lo, hi]$ garantissent une précision flottante à $10^{-6}$.
- Une fois $t$ déterminé, l'évaluation de $y(t)$ fournit la valeur interpolée exacte.

---

## 🔗 Notes Associées
- [[Arrival Easing and Segment Interpolation Math]]
- [[Keyframe Store and Timeline]]

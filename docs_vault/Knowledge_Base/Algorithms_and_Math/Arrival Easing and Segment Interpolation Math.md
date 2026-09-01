# Mathématiques de l'Interpolation & Modèle "Arrival Easing"

*Domaine : Mathématiques de l'Animation & Courbes Clés*

---

## 1. Modèle d'Atténuation d'Arrivée (*Arrival Easing*)
Pour interpoler une valeur $v(t)$ entre deux images-clés $K_1 (t_1, v_1)$ et $K_2 (t_2, v_2)$ avec $p = \frac{t - t_1}{t_2 - t_1} \in [0, 1]$ :
$$v(p) = v_1 + (v_2 - v_1) \cdot E(p)$$

- **Principe fondamental** : La forme de la courbe du segment est gouvernée **exclusivement par l'atténuation d'arrivée portée par $K_2$** (`easeIn`).

---

## 2. Formules des Atténuations Principales
1. **Lisse (Smooth / Sine Ease-In-Out)** : $E(p) = \frac{1 - \cos(\pi p)}{2}$
2. **Exponentielle (Expo)** : $E(p) = 1 - 2^{-k p}$ ($k \approx 10$)
3. **Dépassement (Back)** : $E(p) = 1 + (s + 1)(p - 1)^3 + s(p - 1)^2$ ($s \approx 1.70158$)

---

## 🔗 Notes Associées
- [[Cubic Bezier Root Bisection Solvers]]
- [[Spring-Damper Harmonic Dynamics]]
- [[Keyframe Store and Timeline]]

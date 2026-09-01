# Motion Design and Easing Mathematics

*Domaine : Mathématiques de l'Animation, Courbes d'Interpolation & Motion Design*

Ce document présente les formulations mathématiques des courbes d'atténuation (*easings*), des courbes de Bézier cubiques et des dynamiques physiques appliquées à l'animation numérique.

---

## 1. Modèle d'Atténuation d'Arrivée (*Arrival Easing*)

Dans les logiciels d'animation avancés, l'interpolation d'un segment entre deux images-clés $K_1$ (temps $t_1$, valeur $v_1$) et $K_2$ (temps $t_2$, valeur $v_2$) est définie par le paramètre normalisé $p = \frac{t - t_1}{t_2 - t_1} \in [0, 1]$.

La valeur interpolée $v(p)$ est calculée par :
$$v(p) = v_1 + (v_2 - v_1) \cdot E(p)$$
où $E(p) : [0, 1] \rightarrow [0, 1]$ est la fonction d'atténuation.

### Règle de l'Atténuation d'Arrivée :
Dans un modèle fondé sur l'arrivée, la forme du segment $K_1 \rightarrow K_2$ est déterminée **exclusivement par la fonction d'atténuation portée par $K_2$** (*easeIn*).

---

## 2. Formulations des Fonctions d'Atténuation Usuelles

### 2.1 Sinusoïdale Lisse (*Smooth / Sine Ease-In-Out*)
Vitesse continue aux extrémités :
$$E_{\text{smooth}}(p) = \frac{1 - \cos(\pi p)}{2}$$

### 2.2 Exponentielle (*Exponential Deceleration*)
Décélération progressive avec facteur de contraste $k$ :
$$E_{\text{expo}}(p, k) = 1 - 2^{-k \cdot p}$$

### 2.3 Dépassement (*Back / Anticipation*)
Effet de rebond ou d'overshoot avec coefficient $s$ ($s \approx 1.70158$) :
$$E_{\text{back}}(p, s) = 1 + (s + 1)(p - 1)^3 + s(p - 1)^2$$

### 2.4 Courbe de Bézier Cubique $(P_0, P_1, P_2, P_3)$
Avec $P_0 = (0, 0)$ et $P_3 = (1, 1)$ et deux points de contrôle $P_1 = (x_1, y_1)$, $P_2 = (x_2, y_2)$ :
$$\begin{aligned}
x(t) &= 3(1-t)^2 t x_1 + 3(1-t) t^2 x_2 + t^3 \\
y(t) &= 3(1-t)^2 t y_1 + 3(1-t) t^2 y_2 + t^3
\end{aligned}$$
Pour un progrès temporel $p$, on résout d'abord $x(t) = p$ par méthode de bissection ou de Newton-Raphson pour trouver $t$, puis on évalue $y(t)$.

---

## 3. Dynamique de Ressort-Amortisseur (*Spring-Damper*)

Pour les interactions élastiques temps réel, la dynamique est régie par l'équation différentielle du second ordre :
$$m \frac{d^2 x}{dt^2} + c \frac{dx}{dt} + k (x - x_{\text{cible}}) = 0$$
- $k$ : Raideur du ressort (*Stiffness*).
- $c$ : Coefficient d'amortissement (*Damping*).
- $m$ : Masse.

---

## 🔗 Notes Associées
- [[Node Graph Theory and Evaluation Models]]
- [[Keyframe Store and Timeline]]
- [[Audio Reactive Signal Processing]]

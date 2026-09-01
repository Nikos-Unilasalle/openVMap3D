# Dynamique Harmonique : Système Ressort-Amortisseur (Spring-Damper)

*Domaine : Physique Temps Réel & Animation Procédurale*

---

## 1. Formulation Différentielle
Le mouvement d'un oscillateur harmonique amorti répond à l'équation :
$$m \frac{d^2 x}{dt^2} + c \frac{dx}{dt} + k (x - x_{\text{cible}}) = 0$$
- $k$ : Constante de raideur du ressort (*Stiffness*).
- $c$ : Coefficient d'amortissement (*Damping*).
- $m$ : Masse.

---

## 2. Intégration Numérique Semi-Implicite d'Euler
À chaque pas $\Delta t$ :
```typescript
const force = -stiffness * (currentPosition - targetPosition) - damping * velocity;
velocity += (force / mass) * deltaTime;
currentPosition += velocity * deltaTime;
```

---

## 🔗 Notes Associées
- [[Arrival Easing and Segment Interpolation Math]]
- [[Node Catalog]]

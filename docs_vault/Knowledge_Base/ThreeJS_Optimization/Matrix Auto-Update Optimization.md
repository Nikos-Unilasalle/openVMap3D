# Optimisation des Matrices : `matrixAutoUpdate = false`

*Domaine : Réduction de la Charge CPU sur le Graphe de Scène*

---

## 1. Comportement par Défaut de Three.js
À chaque frame, Three.js parcourt récursivement tous les nœuds de la scène et recalcule leur matrice monde locale (`matrixWorld`) par multiplication matricielle, même si l'objet n'a pas bougé d'un millimètre.
- Dans une scène de 1000 objets statiques, cela représente $1000 \times 60 = 60\,000$ multiplications matricielles inutiles par seconde.

---

## 2. Optimisation des Objets Statiques

Pour tout objet immobile dans l'espace :
```typescript
object.matrixAutoUpdate = false;
object.updateMatrix(); // Calcul unique lors de l'initialisation
```
Si l'objet est déplacé ultérieurement par une action utilisateur ou un paramètre :
```typescript
object.position.set(x, y, z);
object.updateMatrix(); // Mise à jour ponctuelle à la demande
```

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[Frustum Culling and Bounding Volumes]]

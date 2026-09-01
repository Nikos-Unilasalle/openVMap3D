# FLAW-07a : Duplication des Solveurs de Bézier Cubique

*Gravité : 🟢 MINEURE*  
*Fichiers : `src/shared/graph/evaluate.ts:48-67`, `src/windows/motionGraphUtils.ts`*

---

## 1. Description du Défaut
La fonction de résolution de courbe de Bézier par bissection de racine est codée en double :
- Une version dans `evaluate.ts` (`cubicBezierY`).
- Une seconde version dans `motionGraphUtils.ts` pour le tracé graphique de la courbe dans l'éditeur.

---

## 2. Solution
Extraire le solveur dans `src/shared/math/bezier.ts` et l'importer dans les deux modules pour garantir une stricte cohérence visuelle et mathématique.

---

## 🔗 Notes Associées
- [[FLAW-07_Math and Easing Utility Redundancies]]
- [[Cubic Bezier Root Bisection Solvers]]

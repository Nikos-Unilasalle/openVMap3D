# FLAW-07b : Dispersion des Conversions d'Unités d'Angles (Degrés $\leftrightarrow$ Radians)

*Gravité : 🟢 MINEURE*  
*Fichiers : `nodes/transform.ts`, `nodes/camera.ts`, `nodes/oscillator.ts`, `angleUnits.ts`*

---

## 1. Description du Défaut
Alors qu'un module centralisé `src/shared/graph/angleUnits.ts` existe déjà (`degreesToRadians`, `radiansToDegrees`), plusieurs nœuds recalculent localement les conversions via des formules `(deg * Math.PI) / 180` codées en dur.

---

## 2. Solution
Remplacer toutes les occurrences par l'import systématique des fonctions utilitaires de `angleUnits.ts`.

---

## 🔗 Notes Associées
- [[FLAW-07_Math and Easing Utility Redundancies]]
- [[System Invariants and Coding Rules]]

# Testing Harness and Vitest Suites

*Emplacement dans le code : `src/shared/graph/**/*.test.ts`, `src/shared/graph/nodes/nodes.test.ts`*

Ce document détaille la stratégie de test et l'exécution de la suite Vitest pour Tsuji.

---

## 1. Contexte de Test Standard (`CTX`)

```typescript
import { EvalContext } from "../types";

export const CTX: EvalContext = {
  time: 0,
  step: 0,
  nodeId: "test-node",
};
```

---

## 2. Couverture Obligatoire pour Tout Nouveau Nœud

1. **Cas Nominal** : Calcul correct avec des entrées valides.
2. **Cas Déconnecté** : Vérification du repli propre sur `defaultParams` avec un objet vide `{}`.
3. **Cas Limites** : Division par zéro (`1 / 0 -> 0`), tableaux vides, types inattendus.

---

## 3. Commandes de Validation

```bash
# Vérification des types
npm run build --noEmit # ou npx tsc --noEmit

# Exécution des tests Vitest
npm test
```

---

## 🔗 Notes Associées
- [[Node Creation Guide]]
- [[System Invariants and Coding Rules]]
- [[Graph Evaluation Runtime]]

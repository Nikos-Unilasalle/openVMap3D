# Node Creation Guide

*Emplacement dans le code : `src/shared/graph/nodes/`*

Ce document est le guide de référence pour le développement d'un nouveau type de nœud dans Tsuji.

---

## 1. Arborescence des Fichiers

```
src/shared/graph/
  sockets.ts           <- Définition des 12 types de sockets
  types.ts             <- Interfaces NodeDefinition et EvalContext
  nodes/
    <categorie>.ts     <- Implémentation du nœud
    index.ts           <- Enregistrement dans STARTER_NODES et export *
    nodes.test.ts      <- Tests unitaires Vitest
```

---

## 2. Patron de Conception (`NodeDefinition`)

```typescript
import { NodeDefinition } from "../types";

export const MY_NODE: NodeDefinition = {
  type: "category/my-node",          // Identifiant unique en minuscules
  label: "My Node",                  // Libellé affiché dans l'UI
  category: "math",                  // Catégorie déterminant la couleur
  inputs: [
    { id: "factor", label: "Factor", type: "value" },
  ],
  outputs: [
    { id: "out", label: "Out", type: "value" },
  ],
  defaultParams: { factor: 1.0 },
  paramFields: [
    { id: "factor", label: "Factor", kind: "number", step: 0.1 },
  ],
  evaluate: (inputs, params, ctx) => {
    const raw = inputs.factor !== undefined ? inputs.factor : params.factor;
    const factor = Number(raw) || 0;
    const result = factor * 2;
    return {
      out: Number.isFinite(result) ? result : 0,
    };
  },
};
```

---

## 3. Règles Strictes pour `evaluate`

1. **Pureté Déterministe** : Aucun appel à `Date.now()` ou `Math.random()`. Se référer uniquement à `ctx.time` et `ctx.step`.
2. **Immuabilité** : Cloner tout objet Three.js partagé avant modification (`vec.clone()`).
3. **Gestion des Objets GPU Persistants** : Utiliser un cache module `Map<string, THREE.Mesh>` indexé par `ctx.nodeId`.
4. **Valeurs Numériques Saines** : Interdiction absolue de renvoyer `NaN` ou `Infinity`.

---

## 🔗 Notes Associées
- [[Socket Type System and Ownership]]
- [[Graph Evaluation Runtime]]
- [[Node Catalog]]
- [[Testing Harness and Vitest Suites]]

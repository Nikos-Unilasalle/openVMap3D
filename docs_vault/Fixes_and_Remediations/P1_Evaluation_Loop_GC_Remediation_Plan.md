# Plan d'Action & Spécification Corrective : P1 — Optimisation GC de la Boucle d'Évaluation 60 FPS

*Domaine : Performance Temps Réel, Zéro-Allocation & Moteur d'Évaluation*  
*Priorité : 🟠 P1 (Haute Priorité)*

---

## 1. Contexte & Diagnostic des Bottlenecks

À chaque trame ($60\text{ fps}$), la fonction `evaluateGraph()` dans `src/shared/graph/evaluate.ts` générait des milliers d'allocations éphémères sur le tas V8 :

| Goulot d'Étranglement | Code Actuel | Coût par Frame (50 nœuds) | Solution Zéro-Allocation |
| :--- | :--- | :--- | :--- |
| **Indexation des Nœuds** | `new Map(graph.nodes.map(...))` | 1 tableau + 1 `Map` par trame | Cacher `nodesById` sur la référence `graph` |
| **Recherche de Connexions** | `connections.filter()` + `.find()` | $\mathcal{O}(E)$ itérations répétées | Indexer `connectionsByToNode` et `connectionByToNodeSocket` en $\mathcal{O}(1)$ |
| **Collections d'Entrées** | `new Set()` & `new Map()` par nœud | $100$ allocations / trame ($6\,000/\text{sec}$) | **Object Pooling** : réutiliser 2 instances persistantes avec `.clear()` |
| **Clonage `defaultParams`** | `Object.keys()` + 4 tests `instanceof` | $\sim 500$ inspections d'objets / trame | Cacher la liste des clés mutables dans une `WeakMap` |

---

## 2. Spécification Technique de l'Implémentation

### 1. Structure de Cache Topologique & Structurel
```typescript
interface GraphStructuralCache {
  topo: TopoResult;
  nodesById: Map<string, NodeInstance>;
  connectionsByToNode: Map<string, Connection[]>;
  connectionByToNodeSocket: Map<string, Connection>;
}
```
Ce cache est régénéré uniquement lors d'une modification structurelle du graphe (`lastGraphRef !== graph`).

### 2. Object Pooling pour `connectedInputs` & `inputSources`
```typescript
const pooledConnectedInputs = new Set<string>();
const pooledInputSources = new Map<string, string>();
```
Ces collections sont vidées (`.clear()`) et réutilisées de manière synchrone pour chaque nœud sans aucune allocation mémoire.

### 3. WeakMap pour les Clés Mutables de `defaultParams`
```typescript
const mutableKeysCache = new WeakMap<Record<string, unknown>, string[]>();
```

---

## 3. Plan de Test & Validation

1. **Suite Complète Vitest** :
   Valider que les 133 suites de tests et 1731 tests passent sans régression (`npm test`).
2. **Test de Comportement Topologique & Cycles** :
   Valider le maintien strict des ordres d'évaluation et de la résolution des feedbacks temporels.
3. **Typecheck TypeScript** :
   `npx tsc --noEmit`.

---

## 🔗 Notes Associées
- [[FLAW-02_Evaluation Loop Garbage Collection and Allocation Overhead]]
- [[Object Pooling in 60 FPS Render Loops]]
- [[Graph Evaluation Runtime]]

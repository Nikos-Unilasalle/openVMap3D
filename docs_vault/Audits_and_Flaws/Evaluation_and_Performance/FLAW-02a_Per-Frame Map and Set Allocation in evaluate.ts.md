# FLAW-02a : Allocations de `Map` & `Set` à Chaque Trame dans `evaluate.ts`

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P1)**  
> Corrigé dans [`src/shared/graph/evaluate.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/evaluate.ts).  
> `evaluateGraph` utilise désormais un **Object Pool** de `pooledConnectedInputs` et `pooledInputSources` avec `.clear()`.  
> 🔗 *Plan de remédiation :* [[P1_Evaluation_Loop_GC_Remediation_Plan]].

*Gravité initiale : 🟠 MAJEURE*  
*Fichier : `src/shared/graph/evaluate.ts:476, 477`*

---

## 1. Description du Défaut Initial
À chaque frame pour chaque nœud, `evaluateGraph` allouait un `new Set<string>()` (`connectedInputs`) et une `new Map<string, string>()` (`inputSources`), surchargeant la mémoire du Garbage Collector.

---

## 2. Correctif Appliqué
```typescript
const pooledConnectedInputs = new Set<string>();
const pooledInputSources = new Map<string, string>();

// Dans la boucle evaluateGraph :
pooledConnectedInputs.clear();
pooledInputSources.clear();
```

---

## 🔗 Notes Associées
- [[P1_Evaluation_Loop_GC_Remediation_Plan]]
- [[FLAW-02_Evaluation Loop Garbage Collection and Allocation Overhead]]
- [[Object Pooling in 60 FPS Render Loops]]

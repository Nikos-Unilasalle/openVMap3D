# FLAW-06a : Fils Fantômes lors du Morphing de Sockets Dynamiques

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P3)**  
> Corrigé dans [`src/windows/GraphEditor.tsx`](file:///Users/nikos/Desktop/tsuji/src/windows/GraphEditor.tsx).  
> 🔗 *Plan de remédiation :* [[P3_Dynamic_Sockets_and_Math_Consolidation_Plan]].

*Gravité initiale : 🟢 MINEURE*  
*Fichier : `src/windows/GraphEditor.tsx:376-388`*

---

## 1. Description du Défaut Initial
Lors de la suppression d'une arête dans le canvas ReactFlow, `nextEdges` n'était pas confronté aux nouveaux `nextInputs` et `nextOutputs` générés par `refreshDynamicSockets`.

---

## 2. Correctif Appliqué
```typescript
// Filtrage des arêtes dont le port a disparu :
nextEdges = nextEdges.filter((e) => {
  const srcNode = nextNodes.find((n) => n.id === e.source);
  const tgtNode = nextNodes.find((n) => n.id === e.target);
  if (!srcNode || !tgtNode) return false;
  const srcHasSocket = srcNode.data.outputs.some((s) => s.id === e.sourceHandle);
  const tgtHasSocket = tgtNode.data.inputs.some((s) => s.id === e.targetHandle);
  return srcHasSocket && tgtHasSocket;
});
```

---

## 🔗 Notes Associées
- [[P3_Dynamic_Sockets_and_Math_Consolidation_Plan]]
- [[FLAW-06_Dynamic Socket Morphing and Dangling Connection Inconsistencies]]
- [[Dynamic Sockets and Variadic Ports]]

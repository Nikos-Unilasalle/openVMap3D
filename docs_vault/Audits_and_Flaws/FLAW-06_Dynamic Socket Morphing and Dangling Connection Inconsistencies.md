# FLAW-06 : Incohérences de Morphing des Sockets Dynamiques

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P3)**  
> Corrigé dans [`src/windows/GraphEditor.tsx`](file:///Users/nikos/Desktop/tsuji/src/windows/GraphEditor.tsx) et [`src/shared/graph/pruneConnections.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/pruneConnections.ts).  
> `onEdgesDelete` filtre proactivement les arêtes dont les sockets sources/cibles ont disparu lors de la rétractation des ports dynamiques.  
> 🔗 *Plan de remédiation :* [[P3_Dynamic_Sockets_and_Math_Consolidation_Plan]].

*Gravité initiale : 🟢 MINEURE*  
*Fichiers Concernés : `src/windows/GraphEditor.tsx`, `src/shared/graph/pruneConnections.ts`*

---

## 1. Description de la Faille Initiale
Lorsqu'un nœud dynamique (ex: `Merge` ou `List Group`) voyait ses entrées se rétracter après la suppression d'une connexion, les arêtes résiduelles reliées à des index disparus n'étaient pas immédiatement retirées du tableau `edges`, créant des connexions fantômes.

---

## 2. Correctif Appliqué
Purge proactive automatique dans `onEdgesDelete` et renforcement des tests de suppression dans `pruneConnections.test.ts`.

---

## 🔗 Notes Associées
- [[P3_Dynamic_Sockets_and_Math_Consolidation_Plan]]
- [[Dynamic Sockets and Variadic Ports]]
- [[State Management and Multi-Canvas]]

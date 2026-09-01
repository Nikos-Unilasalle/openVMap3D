# FLAW-04a : Faille de Copie Superficielle dans le Fast-Path `cloneGraph.ts`

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P2)**  
> Corrigé dans [`src/shared/graph/cloneGraph.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/cloneGraph.ts).  
> 🔗 *Plan de remédiation :* [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]].

*Gravité initiale : 🟡 MOYENNE*  
*Fichier : `src/shared/graph/cloneGraph.ts:37-40`*

---

## 1. Description du Défaut Initial
L'inspection partielle sur `value[0]` omettait les objets placés aux indices ultérieurs dans les tableaux hétérogènes.

---

## 2. Correctif Appliqué
Le fast-path analyse la totalité des éléments pour détecter la présence de tout objet avant de choisir la stratégie de clonage optimale, et gère nativement les TypedArrays (`ArrayBuffer.isView`).

---

## 🔗 Notes Associées
- [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]]
- [[FLAW-04_CloneGraph Edge Cases and Array Fast-Path Vulnerability]]
- [[State Management and Multi-Canvas]]

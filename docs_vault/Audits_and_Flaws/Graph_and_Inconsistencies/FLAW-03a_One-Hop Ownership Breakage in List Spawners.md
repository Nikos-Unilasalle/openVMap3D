# FLAW-03a : Rupture d'Appropriation à 1-Saut dans les Nœuds de Liste

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P2)**  
> Corrigé dans [`src/shared/graph/sceneRoots.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/sceneRoots.ts).  
> 🔗 *Plan de remédiation :* [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]].

*Gravité initiale : 🟡 MOYENNE*  
*Fichier : `src/shared/graph/sceneRoots.ts:58-67`*

---

## 1. Description du Défaut Initial
`isOwnedDownstream()` ne parcourait que les connexions directes au premier niveau (`connection.fromNode !== nodeId`). Les géométries acheminées via `List Group` continuaient d'être ajoutées à la scène comme racines indépendantes.

---

## 2. Correctif Appliqué
```typescript
// Multi-hop ownership traversal:
if (consumerDef.category === "list" || consumerDef.type === "utility/reroute") {
  return isOwnedDownstream(graph, registry, consumer.id, visited);
}
```

---

## 🔗 Notes Associées
- [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]]
- [[FLAW-03_Geometry Ownership Blind Spots in Lists and Spawners]]
- [[Socket Type System and Ownership]]

# FLAW-01c : Cache de Textures Éclatées & État GLTF dans `gltfLoader.ts`

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P0)**  
> Corrigé dans [`src/shared/graph/nodes/gltfLoader.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/nodes/gltfLoader.ts).  
> `gltfStateCache` utilise désormais `createNodeCache<GltfState>((s) => disposeObject3D(s.group))`.

*Gravité initiale : 🔴 CRITIQUE*  
*Fichier : `src/shared/graph/nodes/gltfLoader.ts:455`*

---

## 1. Description du Défaut Initial
`gltfStateCache` était instancié sans disposer, laissant les sous-maillages, géométries et matériaux d'objets GLTF orphelins en mémoire GPU lors de la suppression du nœud.

---

## 2. Correctif Appliqué
```typescript
import { createNodeCache, disposeObject3D } from "../nodeCaches";

const gltfStateCache = createNodeCache<GltfState>((s) => disposeObject3D(s.group));
```

---

## 🔗 Notes Associées
- [[P0_VRAM_Leak_Remediation_Plan]]
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[GLTF Asset Ingestion Pipeline]]

# FLAW-01a : Cache de Groupe Non Géré dans `camera.ts`

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P0)**  
> Corrigé dans [`src/shared/graph/nodes/camera.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/nodes/camera.ts).  
> `groupCache` utilise désormais `createNodeCache<THREE.Group>(disposeObject3D)`.

*Gravité initiale : 🔴 CRITIQUE*  
*Fichier : `src/shared/graph/nodes/camera.ts:36`*

---

## 1. Description du Code Initial
```typescript
// camera.ts:36
const groupCache = new Map<string, THREE.Group>();
```
Ce cache associait l'identifiant d'une instance de caméra (`nodeId`) à un objet `THREE.Group` contenant la caméra virtuelle et ses helpers d'affichage sans nettoyage automatique à la suppression.

---

## 2. Correctif Appliqué
```typescript
import { createNodeCache, disposeObject3D } from "../nodeCaches";

const groupCache = createNodeCache<THREE.Group>(disposeObject3D);
```

---

## 🔗 Notes Associées
- [[P0_VRAM_Leak_Remediation_Plan]]
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[Recursive ThreeJS Disposal Protocol]]

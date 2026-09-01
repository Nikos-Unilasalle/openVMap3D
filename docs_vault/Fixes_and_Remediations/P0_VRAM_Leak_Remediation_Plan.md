# Plan d'Action & Spécification Corrective : P0 — Élimination des Fuites VRAM

*Domaine : Assurance Qualité, Robustesse Mémoire & Débogage GPU*  
*Priorité : 🔴 P0 (Critique)*

---

## 1. Contexte & Diagnostic

Lors de l'audit critique du code source, plusieurs nœuds ont été identifiés comme conservant des objets 3D Three.js (`THREE.Group`, `THREE.Mesh`, `THREE.Texture`) dans des structures de données `new Map` brutes ou des caches non équipés de fonctions de libération (`disposer`) :

| Fichier Cible | Cache Problématique | Type d'Objet Stocké | Faille Détectée | Correctif Cible |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/graph/nodes/camera.ts:36` | `groupCache` | `THREE.Group` | `new Map` brute sans enregistrement | `createNodeCache<THREE.Group>(disposeObject3D)` |
| `src/shared/graph/nodes/array.ts:6` | `groupCache` | `THREE.Group` | `createNodeCache` sans disposer | `createNodeCache<THREE.Group>(disposeObject3D)` |
| `src/shared/graph/nodes/merge.ts:22` | `groupCache` | `THREE.Group` | `createNodeCache` sans disposer | `createNodeCache<THREE.Group>(disposeObject3D)` |
| `src/shared/graph/nodes/spawn.ts:16` | `groupCache` | `THREE.Group` | `createNodeCache` sans disposer | `createNodeCache<THREE.Group>(disposeObject3D)` |
| `src/shared/graph/nodes/gltfLoader.ts:455` | `gltfStateCache` | `GltfState` (`group`) | `createNodeCache` sans disposer | `createNodeCache<GltfState>((s) => disposeObject3D(s.group))` |
| `src/shared/graph/nodes/objLoader.ts:18` | `objStateCache` | `ObjState` (`group`, `textures`) | `createNodeCache` sans disposer | `createNodeCache<ObjState>((s) => { disposeObject3D(s.group); s.textureMap?.dispose(); s.normalMap?.dispose(); })` |
| `src/shared/graph/nodes/object.ts:1432` | `textMeshCache` | `TextMeshState` (`mesh`) | `createNodeCache` sans disposer | `createNodeCache<TextMeshState>((s) => disposeObject3D(s.mesh))` |
| `src/shared/graph/nodes/object.ts:1485` | `barGraphCache` | `BarGraphState` (`group`, labels) | `createNodeCache` sans disposer | `createNodeCache<BarGraphState>((s) => { disposeObject3D(s.group); s.unitGeometry.dispose(); s.labelStates.forEach(l => { l.texture?.dispose(); disposeObject3D(l.mesh); }); })` |

---

## 2. Protocole de Libération Récursive

Toutes les destructions d'objets 3D s'appuient sur l'utilitaire éprouvé `disposeObject3D()` dans `src/shared/graph/nodeCaches.ts` :
```typescript
export function disposeObject3D(object: { traverse: (cb: (o: any) => void) => void }): void {
  object.traverse((child: any) => {
    child.geometry?.dispose?.();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m: any) => m?.dispose?.());
    else material?.dispose?.();
  });
}
```

---

## 3. Plan de Test & Validation

1. **Test Unitaire Dédié (`nodeCaches.test.ts`)** :
   Ajouter des tests vérifiant que la suppression d'un `nodeId` déclenche bien `geometry.dispose()` et `material.dispose()` sur les nœuds corrigés.
2. **Suite Complète Vitest** :
   Exécuter les 133 suites de tests de non-régression (`npm test`).
3. **Validation TypeScript** :
   Vérifier l'absence d'erreurs de typage (`npx tsc --noEmit`).

---

## 🔗 Notes Associées
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[Recursive ThreeJS Disposal Protocol]]
- [[Centralized ResourceLifecycleManager Design]]

# FLAW-01 : Fuites Mémoire GPU & Caches de Nœuds Non Gérés

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P0)**  
> Ce problème a été intégralement corrigé dans le codebase Tsuji. Tous les caches de nœuds (`camera.ts`, `array.ts`, `merge.ts`, `spawn.ts`, `gltfLoader.ts`, `objLoader.ts`, `object.ts`) sont désormais enregistrés avec des destructeurs récursifs `disposeObject3D` dans `nodeCaches.ts`.  
> 🔗 *Plan de remédiation & détails :* [[P0_VRAM_Leak_Remediation_Plan]].

*Gravité initiale : 🔴 CRITIQUE*  
*Fichiers Concernés : `src/shared/graph/nodeCaches.ts`, `nodes/camera.ts`, `nodes/array.ts`, `nodes/merge.ts`, `nodes/spawn.ts`, `nodes/gltfLoader.ts`, `nodes/objLoader.ts`, `nodes/object.ts`*

---

## 1. Description de la Faille

Dans l'architecture de Tsuji, `createNodeCache()` a été introduit dans `src/shared/graph/nodeCaches.ts` pour enregistrer des fonctions de nettoyage (`disposers`) exécutées automatiquement lors de la suppression d'un nœud (`disposeNodeCaches(nodeIds)`).

Cependant, une inspection approfondie du dossier `src/shared/graph/nodes/` a révélé que de nombreux nœuds instanciaient des `new Map<string, ...>()` directes au niveau du module ou utilisaient `createNodeCache()` sans lui fournir de callback de libération `.dispose()`.

---

## 2. Conséquences Initiales

- **Fuite VRAM Irréversible** : Dans une session d'édition prolongée, ajouter et supprimer des nœuds accumulait des mégaoctets de buffers WebGL et de textures sans que le Garbage Collector JS ne puisse les détruire.
- **Rémanence Fantôme d'Identifiants (ID Collision)** : Si un nœud était supprimé puis ré-ajouté avec le même ID via l'historique Undo/Redo, il réutilisait silencieusement les anciennes données périmées du cache non vidé.

---

## 3. Correctif Appliqué (Résolution P0)

1. **Remplacement systématique par `createNodeCache` équipé** :
   ```typescript
   import { createNodeCache, disposeObject3D } from "../nodeCaches";

   // Pour les objets 3D (camera, array, merge, spawn, gltfLoader, objLoader, object) :
   const groupCache = createNodeCache<THREE.Group>(disposeObject3D);
   ```
2. **Couverture de tests unitaires** :
   Ajout de tests dans `src/shared/graph/nodeCaches.test.ts` vérifiant que `disposeObject3D` appelle bien `.dispose()` sur la géométrie et le matériau.

---

## 🔗 Notes Associées
- [[P0_VRAM_Leak_Remediation_Plan]]
- [[Resource Lifecycle and Cache Garbage Collection]]
- [[Recursive ThreeJS Disposal Protocol]]

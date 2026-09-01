# State Management and Multi-Canvas

*Emplacement dans le code : `src/App.tsx`, `src/shared/graph/types.ts`, `src/shared/graph/autosave.ts`*

Ce document décrit la gestion d'état centralisée, le découpage multi-canvas et la persistance dans Tsuji.

---

## 1. Modèle Multi-Canvas (`Project`)

```typescript
export const CANVAS_COUNT = 6;

export interface Project {
  canvases: Graph[];
  activeCanvas: number; // Index 0..5
}
```

### Principes :
- **6 Arbres Indépendants** : Chaque canvas possède son propre graphe de nœuds, ses fils, ses images-clés et ses paramètres de sortie (Render node).
- **Commutation Instantanée** : Le basculement de canvas ne détruit pas les caches GPU associés (`nodeCaches.ts`). Seul le canvas actif est évalué et affiché à l'écran.

---

## 2. Flux Réactionnel React (`App.tsx`)

- Les mutations d'état (ajout de nœuds, câblage, modification de paramètres, édition de clés) génèrent de nouvelles copies immuables du graphe via `cloneGraph.ts`.
- **Isolation du Gizmo (`liveEditNodeId`)** : Pendant la manipulation d'un gizmo dans la vue 3D, le nœud ciblé ignore l'écrasement de sa matrice par le graphe pour éviter tout clignotement à 60 fps.

---

## 3. Persistance & Reconstitution (`autosave.ts`, `rehydrateParams.ts`)

- **Sauvegarde Automatique Débouncée** : Enregistrement sur disque (via l'API Tauri ou le stockage local).
- **Réhydratation Typée** : Lors du chargement JSON, les structures simples représentant des vecteurs, couleurs et matrices sont automatiquement réinstanciées en objets réels `THREE.Vector3`, `THREE.Color` et `THREE.Matrix4`.

---

## 🔗 Notes Associées
- [[Graph Evaluation Runtime]]
- [[ThreeJS Viewport and Calibration Pipeline]]
- [[Keyframe Store and Timeline]]

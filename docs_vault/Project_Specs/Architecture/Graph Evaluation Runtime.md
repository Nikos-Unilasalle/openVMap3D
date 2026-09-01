# Graph Evaluation Runtime (Tsuji Implementation)

*Emplacement dans le code : `src/shared/graph/evaluate.ts`*

Ce document détaille l'implémentation concrète de l'évaluateur de graphe dans Tsuji.

---

## 1. Boucle d'Évaluation Eager

Tsuji exécute une passe avant complète sur chaque frame de rendu :
```
[Horloge Déterministe clock.ts] ──▶ [Tri Topologique topoSort] ──▶ [evaluateGraph()] ──▶ [Rendu Three.js]
```

### 1.1 Cache Structurel & Indexation O(1)
Le tri topologique et les index de connexions sont mis en cache par référence de graphe (`GraphStructuralCache`) :
- Pendant la lecture sans modification structurelle, le coût du tri $\mathcal{O}(V+E)$ et des filtres de connexions $\mathcal{O}(E)$ est nul.
- Les correspondances socket-connexion sont indexées en $\mathcal{O}(1)$ via `connectionByToNodeSocket`.
- Les nœuds cycliques sont identifiés et placés à la fin de la file d'exécution.

### 1.2 Zéro-Allocation & Object Pooling
- Les structures `connectedInputs` (`Set`) et `inputSources` (`Map`) utilisent le pattern **Object Pooling** (`pooledConnectedInputs.clear()`), éliminant tout surcoût pour le Garbage Collector à 60 fps.
- Les paramètres mutables (`Vector3`, `Color`, `Euler`) sont isolés et mis en cache via une `WeakMap` de clés par définition de nœud.

### 1.3 Résolution Déterministe des Cycles
Si un nœud dépend d'une boucle cyclique, il récupère la valeur calculée à la frame précédente via le cache `previousFrameOutputsBySession`.
- Ce mécanisme est isolé par session (`ctx.sessionId`) pour éviter les conflits entre l'éditeur temps réel et l'export vidéo headless.

---

## 2. Structure d'`EvalContext`

Chaque fonction `evaluate` reçoit le contexte immuable suivant :
```typescript
export interface EvalContext {
  time: number;                   // Secondes déterministes (jamais Date.now())
  step: number;                   // Numéro de frame
  nodeId: string;                 // UUID d'instance (clé pour le cache GPU)
  liveEditNodeId?: string | null; // Nœud en cours de manipulation par gizmo 3D
  renderer?: THREE.WebGLRenderer; // Instance WebGLRenderer active
  renderSize?: { width: number; height: number }; // Dimensions de la vue
  sessionId?: string;             // Identifiant de la session de rendu
  keyframes?: KeyframeStore;      // Pistes d'animation
  currentFrame?: number;          // Frame courante
  connectedInputs?: ReadonlySet<string>; // Sockets réellement connectés
  inputSources?: ReadonlyMap<string, string>; // Nœud source par socket
}
```

---

## 3. Priorité des Données

Lors de l'alimentation d'un socket d'entrée :
1. **Connexion Filaire** : Si un fil est connecté, sa valeur en temps réel prime.
2. **Animation / Keyframe** : Si le socket n'est pas câblé mais possède des images-clés sur la frame courante, la valeur interpolée est injectée.
3. **Paramètre Statique** : En l'absence de fil et de clé, la valeur provient de `params[socketId]` ou de `defaultParams[socketId]`.

---

## 🔗 Notes Associées
- [[Node Graph Theory and Evaluation Models]]
- [[State Management and Multi-Canvas]]
- [[Socket Type System and Ownership]]
- [[Node Creation Guide]]

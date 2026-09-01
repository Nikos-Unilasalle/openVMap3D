# Évolution : Migration vers le Moteur WebGPU & Shaders TSL

*Domaine : Rendu Nouvelle Génération, Compute Shaders & Multi-threading*

---

## 1. Contexte & Limitations de l'Architecture Actuelle

Dans le moteur actuel de Tsuji :
- Le calcul de particules (`particleRuntime.ts`) repose sur `GPUComputationRenderer` : une technique WebGL 2.0 détournant des fragment shaders et des textures 2D flottantes en double-buffer (ping-pong).
- Bien que fonctionnelle, cette approche impose des contraintes de dimensionnement de texture (ex. $512 \times 512 = 262\,144$ particules), un surcoût de swap de framebuffers et l'impossibilité de modifier dynamiquement le nombre de particules actives.
- L'évaluation du graphe et le rendu s'exécutent sur le thread principal du navigateur, partageant le temps CPU avec l'interface React et la timeline.

---

## 2. Architecture Cible : `WebGPURenderer` & Compute Shaders

```
                               ┌───────────────────────────┐
                               │     WebGPURenderer        │
                               └─────────────┬─────────────┘
                                             │
      ┌──────────────────────────────────────┴──────────────────────────────────────┐
      ▼                                                                             ▼
[Compute Shaders WGSL / TSL]                                           [Pipeline de Rendu TSL]
- `storageBuffer` pour positions, vitesses, durée de vie                - Matériaux physiques unifiés
- Calcul de physique massivement parallèle (>2M particules)            - Post-processing en une passe
- Dispatch direct sans conversion en texture                           - Multi-threading GPU natif
```

### 2.1 Shaders TSL (Three.js Shading Language)
Three.js introduit le langage node-based **TSL**, permettant d'écrire des shaders modulaires en TypeScript pur transpilables en temps réel vers GLSL (fallback WebGL) et WGSL (WebGPU) :

```typescript
import { Fn, float, vec3, storage, instanceIndex } from "three/tsl";

// Exemple de Compute Shader TSL pour particules :
export const updateParticlesCompute = Fn(() => {
  const index = instanceIndex;
  const pos = positionBuffer.element(index);
  const vel = velocityBuffer.element(index);

  // Intégration Euler :
  pos.addAssign(vel.mul(deltaTime));
});
```

### 2.2 Déport du Moteur sur `OffscreenCanvas` & Web Worker
- **Thread 1 (Main Thread UI)** : Interface React, graphe `@xyflow/react`, timeline, inspector.
- **Thread 2 (Worker Graph & Evaluation)** : Exécution de `evaluateGraph()`, calcul des matrices, tri topologique.
- **Thread 3 (Worker Render WebGPU)** : Soumission des commandes de rendu WebGPU directement via `OffscreenCanvas`.

---

## 3. Plan d'Implémentation Étape par Étape

1. **Phase A (Abstraction de Rendu)** : Encapsuler l'instanciation de `THREE.WebGLRenderer` dans une factory supportant la détection de capacité `navigator.gpu` et le fallback automatique.
2. **Phase B (Portage TSL des Nœuds Post-Process)** : Réécrire les passes GLSL de `postprocessing.ts` en modules TSL.
3. **Phase C (Moteur de Particules Compute)** : Remplacer `GPUComputationRenderer` par des compute passes utilisant des Storage Buffers natifs.

---

## 🔗 Notes Associées
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[Graph Evaluation Runtime]]

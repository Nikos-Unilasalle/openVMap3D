# Architecture WebGPU & Shaders TSL (Three.js Shading Language)

*Domaine : Nouvelle Génération Graphique Web & Compute Shaders*

---

## 1. WebGPU vs. WebGL 2.0
- **WebGPU** offre un accès direct et bas niveau au GPU moderne, réduisant drastiquement le surcoût du pilote CPU.
- **Compute Shaders natifs** : Permet le calcul parallèle de données physiques sans recourir à des textures graphiques.

---

## 2. Le Langage TSL (Three.js Shading Language)
TSL permet d'écrire des shaders de matériaux et de calcul en TypeScript pur, compilés automatiquement vers WGSL (WebGPU) ou GLSL (WebGL) :
```typescript
import { Fn, float, vec3, uniform } from "three/tsl";

export const customWaveMaterial = Fn(() => {
  const time = uniform("time");
  // Logique de shader modulaire composable
});
```

---

## 🔗 Notes Associées
- [[GLSL Branchless Programming and Optimization]]
- [[GPGPU Ping-Pong Texture Simulation]]
- [[WebGPURenderer Architecture Migration]]

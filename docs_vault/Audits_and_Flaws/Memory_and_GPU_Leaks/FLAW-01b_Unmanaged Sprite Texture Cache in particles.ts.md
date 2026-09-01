# FLAW-01b : Cache de Textures Sprite Non Géré dans `particles.ts`

*Gravité : 🔴 CRITIQUE*  
*Fichier : `src/shared/graph/nodes/particles.ts:618`*

---

## 1. Description du Code Vulnérable
```typescript
// particles.ts:618
const spriteTextureCache = new Map<string, THREE.Texture>();
```

---

## 2. Défaut de Conception
Les textures générées ou chargées pour les particules de type Sprite sont conservées dans cette table. La suppression du nœud de rendu de particules ne déclenche aucun appel à `texture.dispose()`, conservant la texture allouée en VRAM.

---

## 3. Correctif Recommandé
```typescript
import { createNodeCache } from "../nodeCaches";

const spriteTextureCache = createNodeCache<THREE.Texture>((texture) => texture.dispose());
```

---

## 🔗 Notes Associées
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[GPU Memory and VRAM Leak Prevention]]

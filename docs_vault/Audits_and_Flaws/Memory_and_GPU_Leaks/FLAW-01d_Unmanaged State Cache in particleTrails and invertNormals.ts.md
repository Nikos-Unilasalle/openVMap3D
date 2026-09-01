# FLAW-01d : Caches d'État Non Gérés dans `particleTrails.ts` & `invertNormals.ts`

*Gravité : 🔴 CRITIQUE*  
*Fichiers : `src/shared/graph/nodes/particleTrails.ts:125`, `src/shared/graph/nodes/invertNormals.ts:142`*

---

## 1. Description du Code Vulnérable
Dans ces deux fichiers, des objets d'état d'animation et de géométrie contenant des `Map` internes sont alloués sans être enregistrés dans `nodeCaches.ts` :
```typescript
// particleTrails.ts:125
state = { histories: new Map(), lastAge: new Map(), buckets: [] };

// invertNormals.ts:142
state = { flipped: new Map() };
```

---

## 2. Conséquence
Les géométries de traînées (*trails*) et les maillages aux normales inversées continuent d'occuper de la mémoire VRAM même après la suppression des nœuds.

---

## 🔗 Notes Associées
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[Recursive ThreeJS Disposal Protocol]]

# FLAW-04b : Risque d'Aplatissement de Types lors de la Sérialisation JSON des Images-Clés

*Gravité : 🟡 MOYENNE*  
*Fichiers : `src/App.tsx:73-76`, `src/shared/graph/rehydrateParams.ts`*

---

## 1. Description du Code Vulnérable
```typescript
// App.tsx:73-76
function serializeKeyframeValue(value: unknown): unknown {
  if (value === undefined) return 0;
  return JSON.parse(JSON.stringify(value));
}
```

---

## 2. Risque Identifié
L'utilisation de `JSON.parse(JSON.stringify(value))` convertit les instances de classes Three.js (`THREE.Vector3`, `THREE.Color`) en objets littéraux anonymes `{ x, y, z }` et `{ r, g, b }` dépourvus de leurs méthodes et prototypes de classe (`.clone()`, `.lerp()`).
- Si un nœud attend strictement un `instanceof THREE.Vector3`, l'évaluation peut échouer silencieusement si la réhydratation dans `rehydrateParams.ts` n'est pas passée par toutes les pistes d'animation imbriquées.

---

## 🔗 Notes Associées
- [[Keyframe Store and Timeline]]
- [[State Management and Multi-Canvas]]

# FLAW-04a : Faille du Fast-Path de Tableaux dans `cloneGraph.ts`

*Gravité : 🟡 MOYENNE*  
*Fichier : `src/shared/graph/cloneGraph.ts:37-41`*

---

## 1. Description du Code Vulnérable
```typescript
// cloneGraph.ts:37-41
if (Array.isArray(value)) {
  if (value.length === 0 || typeof value[0] !== "object" || value[0] === null) {
    return value.slice(); // ⚠️ Ne teste que le premier élément !
  }
  return value.map(cloneParamValue);
}
```

---

## 2. Le Cas de Rupture
Si un tableau contient un mélange d'entiers et d'objets `THREE.Vector3` (ex: `[0, new THREE.Vector3(1, 2, 3)]`), le test `typeof value[0] !== "object"` s'évalue à `true`.
- La fonction exécute `value.slice()`.
- Les vecteurs aux indices $> 0$ sont copiés par référence superficielle au lieu d'être clonés, entraînant des mutations croisées lors des opérations de Undo/Redo.

---

## 3. Correctif
Remplacer par une vérification de type `Float32Array` / `every(isPrimitive)` ou exécuter systématiquement `value.map(cloneParamValue)`.

---

## 🔗 Notes Associées
- [[FLAW-04_CloneGraph Edge Cases and Array Fast-Path Vulnerability]]
- [[State Management and Multi-Canvas]]

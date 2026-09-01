# FLAW-02b : Surcoût de Clonage des `defaultParams` dans la Boucle 60 FPS

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P1)**  
> Corrigé dans [`src/shared/graph/evaluate.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/evaluate.ts).  
> `getMutableDefaultKeys()` met en cache la liste des clés mutables (`Vector3`, `Color`, `Euler`) dans une `WeakMap`, évitant d'inspecter `Object.keys()` et de répéter des tests `instanceof` à chaque trame.

*Gravité initiale : 🟠 MAJEURE*  
*Fichier : `src/shared/graph/evaluate.ts`*

---

## 1. Description du Défaut Initial
La boucle parcourait récursivement l'ensemble des clés de `def.defaultParams` et exécutait 4 tests `instanceof` consécutifs sur chaque clé de chaque nœud à chaque frame.

---

## 2. Correctif Appliqué
```typescript
const mutableKeysCache = new WeakMap<Record<string, unknown>, string[]>();

function getMutableDefaultKeys(defaultParams: Record<string, unknown>): string[] {
  let keys = mutableKeysCache.get(defaultParams);
  if (!keys) {
    keys = [];
    for (const key of Object.keys(defaultParams)) {
      const v = defaultParams[key];
      if (v instanceof THREE.Vector3 || v instanceof THREE.Color || v instanceof THREE.Euler || v instanceof THREE.Quaternion) {
        keys.push(key);
      }
    }
    mutableKeysCache.set(defaultParams, keys);
  }
  return keys;
}
```

---

## 🔗 Notes Associées
- [[P1_Evaluation_Loop_GC_Remediation_Plan]]
- [[FLAW-02_Evaluation Loop Garbage Collection and Allocation Overhead]]
- [[Object Pooling in 60 FPS Render Loops]]

# Le Pattern "Object Pooling" dans la Boucle de Rendu

*Domaine : Design Pattern Temps Réel & Zéro Allocation*

---

## 1. Principe de l'Object Pooling
L'Object Pooling consiste à pré-instancier des objets utilitaires réutilisables au niveau du module ou de la classe pour effectuer les calculs géométriques et vectoriels sans jamais solliciter l'allocateur mémoire du Heap pendant la boucle de rendu.

---

## 2. Exemple de Pattern d'Implémentation
```typescript
// Variables statiques de travail pré-allouées (hors de la boucle) :
const _scratchVec1 = new THREE.Vector3();
const _scratchVec2 = new THREE.Vector3();
const _scratchMat = new THREE.Matrix4();

export function computeIntermediateTransform(targetPosition: THREE.Vector3, factor: number): THREE.Matrix4 {
  // Réutilisation sans création d'objet :
  _scratchVec1.copy(targetPosition).multiplyScalar(factor);
  _scratchMat.makeTranslation(_scratchVec1.x, _scratchVec1.y, _scratchVec1.z);
  return _scratchMat;
}
```

---

## 🔗 Notes Associées
- [[Garbage Collection Pauses and Mitigation]]
- [[JavaScript Heap vs GPU VRAM Dual-Stack]]
- [[System Invariants and Coding Rules]]

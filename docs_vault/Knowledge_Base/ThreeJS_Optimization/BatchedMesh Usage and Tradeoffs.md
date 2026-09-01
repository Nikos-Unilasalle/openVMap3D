# BatchedMesh : Utilisation, Fonctionnement & Compromis

*Domaine : Three.js Rendu par Lots & Architecture 3D*

---

## 1. Principe de `BatchedMesh` (Three.js r160+)
Contrairement à `InstancedMesh` qui exige une géométrie strictement identique, `THREE.BatchedMesh` permet de fusionner **plusieurs géométries différentes** partageant le même matériau au sein d'un draw call unique.

```typescript
const batchedMesh = new THREE.BatchedMesh(maxGeometryCount, maxVertexCount, maxIndexCount, sharedMaterial);

// Ajout de géométries uniques dans le lot :
const boxId = batchedMesh.addGeometry(boxGeometry);
const sphereId = batchedMesh.addGeometry(sphereGeometry);

// Positionnement indépendant :
batchedMesh.setMatrixAt(boxId, matrixA);
batchedMesh.setMatrixAt(sphereId, matrixB);
```

---

## 2. Matrice de Décision & Compromis

| Critère | `InstancedMesh` | `BatchedMesh` |
| :--- | :--- | :--- |
| **Type de Géométrie** | Identique pour tous les éléments | Hétérogène (formes variées) |
| **Complexité CPU** | Minimale (copie directe de matrices) | Modérée (gestion de sous-buffers et décalages) |
| **Cas Optimal** | Particules, arbres, cubes, data points | Bâtiments d'une ville, mobilier d'intérieur, UI 3D composite |
| **Seuil de Recommandation** | Dès $>2$ objets identiques | Quand $>5$ géométries distinctes partagent un matériau |

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[InstancedMesh Usage and Best Practices]]
- [[Frustum Culling and Bounding Volumes]]

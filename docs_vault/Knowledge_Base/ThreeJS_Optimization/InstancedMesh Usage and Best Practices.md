# InstancedMesh : Utilisation & Bonnes Pratiques

*Domaine : Three.js Instancing & Performance GPU*

---

## 1. Principe de Fonctionnement
`THREE.InstancedMesh` permet de rendre $N$ copies d'un même maillage (`BufferGeometry` + `Material`) en un **unique draw call** matériel.

- Les transformations spatiales sont encodées dans un buffer linéaire d'attributs d'instance : `instanceMatrix` (`Float32Array` de taille $N \times 16$).
- Les couleurs personnalisées par instance sont transmises via `instanceColor` (`Float32Array` de taille $N \times 3$).

---

## 2. Règles de Performance en Production

1. **Usage des Buffers (`setUsage`)** :
   ```typescript
   // Pour des instances statiques :
   mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

   // Pour des instances animées chaque frame :
   mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
   ```
2. **Drapeau de Mise à Jour (`needsUpdate`)** :
   Ne positionner `mesh.instanceMatrix.needsUpdate = true` que lors des trames où au moins une matrice a changé.
3. **Limitation du Nombre d'Instances Allouées** :
   Allouer une capacité maximale lors de l'instanciation (`new THREE.InstancedMesh(geom, mat, maxCount)`), puis ajuster dynamiquement le nombre visible avec `mesh.count = currentActiveCount`.

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[BatchedMesh Usage and Tradeoffs]]
- [[GPU Memory and VRAM Leak Prevention]]

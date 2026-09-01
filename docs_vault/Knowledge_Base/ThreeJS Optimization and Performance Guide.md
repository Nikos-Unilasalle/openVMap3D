# Three.js Optimization & Performance Engineering Guide

*Domaine : Connaissance Théorique & Pratiques Industrielles WebGL / WebGPU*

Ce document synthétise les règles fondamentales et les techniques avancées d'optimisation pour les moteurs graphiques basés sur **Three.js**, indépendamment de toute logique applicative spécifique.

---

## 1. Réduction des Draw Calls (Appels de Rendu)

Le coût principal d'un moteur 3D en temps réel réside dans le surcoût de communication CPU $\rightarrow$ GPU (les draw calls). Deux stratégies majeures permettent de regrouper les objets :

```
                  ┌─────────────────────────────────────────┐
                  │ Les géométries sont-elles identiques ?  │
                  └────────────────────┬────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
         [Géométries Identiques]                 [Géométries Uniques]
                    │                                     │
                    ▼                                     ▼
           `THREE.InstancedMesh`                  `THREE.BatchedMesh`
                    │                                     │
           - Buffer unique de sommets             - Sous-géométries multiples
           - Matrice 4×4 par instance             - Matériau partagé unique
           - Adapté aux grands volumes (>10k)     - Scènes composites
```

### 1.1 `THREE.InstancedMesh`
- **Cas d'usage** : Particules, débris, répétitions modulaires, visualisations de données.
- **Principe** : Une seule géométrie instanciée $N$ fois. Les transformations sont stockées dans un buffer linéaire `instanceMatrix` (`Float32Array`).
- **Bonne pratique** : Définir `instanceMatrix.setUsage(THREE.DynamicDrawUsage)` si les instances bougent à chaque frame, ou `THREE.StaticDrawUsage` si elles sont fixes. Positionner `mesh.instanceMatrix.needsUpdate = true` uniquement lors des frames de modification.

### 1.2 `THREE.BatchedMesh`
- **Cas d'usage** : Regroupement de modèles géométriques hétérogènes partageant les mêmes propriétés de matériau (textures, shaders).
- **Compromis** : La gestion dynamique des sous-géométries induit une légère charge CPU. Si une scène ne contient que 2 ou 3 types de géométries, plusieurs `InstancedMesh` distincts sont souvent plus performants qu'un `BatchedMesh`.

---

## 2. Accélération Spatiale : Arbres BVH (`three-mesh-bvh`)

Le raycasting standard de Three.js effectue une recherche linéaire en $O(N)$ sur l'intégralité des triangles d'un maillage. Dès qu'un modèle dépasse $50\,000$ polygones, cette opération provoque des chutes drastiques de framerate.

- **Principe** : La structure d'arbre hiérarchique de boîtes englobantes (*Bounding Volume Hierarchy*) partitionne spatialement les sommets.
- **Complexité** : Réduit le coût d'intersection de $O(N)$ à $O(\log N)$.
- **Bénéfices** :
  - Détection de survol/clic souris ultra-rapide ($<0.1\text{ ms}$).
  - Opérations booléennes CSG (*Constructive Solid Geometry*) fluides.
  - Détection de collisions spatiales et culling d'occlusion.

---

## 3. Gestion du Cycle de Vie Mémoire GPU (Évitement des Fuites VRAM)

Le ramasse-miettes (Garbage Collector) de JavaScript **ne libère pas** la mémoire allouée sur le processeur graphique (VRAM). Les objets WebGL (buffers de géométrie, textures, programmes shaders, framebuffers) y demeurent indéfiniment sans appel explicite à `.dispose()`.

### Protocole de Nettoyage Récursif :
```javascript
function disposeHierarchy(root) {
  root.traverse((obj) => {
    if (obj.isMesh) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(disposeMaterial);
        } else {
          disposeMaterial(obj.material);
        }
      }
    }
  });
}

function disposeMaterial(mat) {
  Object.keys(mat).forEach((key) => {
    const prop = mat[key];
    if (prop && typeof prop === "object" && typeof prop.dispose === "function") {
      prop.dispose(); // Libère les textures (map, normalMap, roughnessMap, envMap)
    }
  });
  mat.dispose();
}
```

### Pièges Fréquents :
1. **`ImageBitmap` dans les Chargeurs GLTF** : Les chargeurs modernes décodent les images sous forme d'objets `ImageBitmap`. Lors de la suppression d'une texture, il est nécessaire d'appeler `texture.source.data.close()` pour libérer le descripteur mémoire système.
2. **Pooling de `WebGLRenderTarget`** : Éviter d'instancier et de détruire des cibles de rendu à chaque passe de post-processing. Préférer un pool statique réutilisable.

---

## 4. Optimisations CPU & Boucle de Rendu

1. **Désactivation de la mise à jour automatique des matrices (`matrixAutoUpdate`)** :
   - Par défaut, Three.js recalcule récursivement la matrice monde (`matrixWorld`) de chaque nœud du graphe de scène à chaque frame.
   - Pour les objets fixes, positionner `object.matrixAutoUpdate = false` et exécuter une unique mise à jour manuelle via `object.updateMatrix()`.
2. **Préchauffage Asynchrone des Shaders (`renderer.compileAsync`)** :
   - La compilation synchrone des shaders WebGL au moment du premier affichage d'un maillage engendre des saccades (*jank*).
   - Utiliser `await renderer.compileAsync(scene, camera)` lors du chargement des scènes pour pré-compiler les pipelines graphiques sur le GPU.

---

## 5. WebGPU & Shaders TSL

Dans les versions récentes de Three.js (`r171+`), l'architecture `WebGPURenderer` unifie les accès bas niveau :
- **Compute Shaders natifs** : Remplacement des simulations basées sur des textures flottantes ping-pong par de vrais compute shaders parallèles.
- **TSL (Three.js Shading Language)** : Langage de shader modulaire transpilant à la fois vers GLSL (WebGL) et WGSL (WebGPU).

---

## 🔗 Notes Associées
- [[Spatial Indexing and BVH Acceleration]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[PBR Shading and Material Models]]

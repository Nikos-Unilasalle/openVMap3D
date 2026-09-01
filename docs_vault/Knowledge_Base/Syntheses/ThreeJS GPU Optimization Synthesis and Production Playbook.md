# Synthèse d'Optimisation GPU pour Three.js — Le Playbook de Production

*Domaine : Ingénierie Graphique Temps Réel, WebGL 2.0, WebGPU & Performance GPU*  
*Sources & Références : Three.js Core, glTF-Transform (Don McCurdy), Meshoptimizer (Arseny Kapoulkine), Basis Universal (Binomial/Google), three-perf, pmndrs/postprocessing, Discover Three.js.*

---

## 1. Cartographie des Goulots d'Étranglement GPU

L'optimisation d'une application Three.js nécessite d'identifier la nature exacte du goulot d'étranglement :

```
                               ┌───────────────────────────┐
                               │ Diagnostiquer le Bottleneck│
                               └─────────────┬─────────────┘
                                             │
      ┌──────────────────────────────────────┼──────────────────────────────────────┐
      ▼                                      ▼                                      ▼
[CPU-Bound : Draw Calls]           [GPU-Bound : Remplissage/Overdraw]    [VRAM/Bande Passante Mémoire]
- Nombre de draw calls > 150       - Fragment shaders trop lourds        - Textures JPG/PNG géantes décompressées
- Surcharge de commutation d'état  - Trop de couches transparentes        - Géométries non compressées sans index
- CPU à 100%, GPU sous-utilisé     - Résolution trop élevée (Retina 3x)  - Fuites mémoire sans dispose()
- Remède: InstancedMesh/Batching   - Remède: Depth Pre-pass, clamp DPR   - Remède: KTX2/Basis, Meshopt, gltfpack
```

### Outils de Mesure et Profilage Indispensables :
- **[`three-perf`](https://github.com/TheoTheDev/three-perf)** : Moniteur temps réel intégré pour Three.js (mesure séparée CPU time, GPU time via timer queries WebGL, FPS, mémoire VRAM et géométries).
- **[`Spector.js`](https://github.com/BabylonJS/Spector.js)** : Extension de capture de trame permettant d'inspecter chaque commande WebGL, liaison de texture et compilation de shader.
- **`renderer.info`** : Inspection native de `renderer.info.render.calls`, `renderer.info.render.triangles` et `renderer.info.memory.textures`.

---

## 2. Pipeline d'Assets & Mémoire VRAM : Le Standard KTX2 / Meshopt

L'erreur la plus coûteuse consiste à charger des textures JPG/PNG standards. Une image PNG de 5 Mo en 4K (4096×4096) est décompressée en VRAM sous forme de matrice brute RGBA à **67 Mo de VRAM** ($4096 \times 4096 \times 4\text{ octets} \times 1.33\text{ avec mipmaps}$).

### 2.1 Compression de Textures GPU Native : KTX2 / Basis Universal
Les formats de compression GPU natifs (**BC7** sur PC, **ASTC** sur mobile, **ETC2**) restent compressés directement dans la VRAM et sont décompressés à la volée par le matériel silicium du GPU lors du texturage.

| Format | Taille Fichier (Réseau) | Empreinte VRAM (GPU) | Décompression CPU |
| :--- | :--- | :--- | :--- |
| **PNG standard (2K)** | ~3 Mo | **16.7 Mo** | Lourde (PNG decode) |
| **JPG standard (2K)** | ~1.5 Mo | **16.7 Mo** | Lourde (JPEG decode) |
| **KTX2 / Basis (2K)** | **~1.2 Mo** | **2.7 Mo (Gain $\times 6$)** | Quasi-instantanée (Transcodage) |

### 2.2 Compression Géométrique : Meshopt vs. Draco
- **Draco** : Excellente compression réseau, mais décompression CPU lourde au chargement (provoque des gels de thread).
- **Meshopt (`gltfpack` / `Meshoptimizer`)** : Le standard de production moderne. Décompression ultra-rapide (SIMD WebAssembly), quantization des attributs, alignement optimal du cache de sommets GPU (*Vertex Cache Optimization*).

### 2.3 Automatisation du Pipeline avec `gltfpack` :
Commande de build recommandée pour traiter les modèles 3D :
```bash
gltfpack -i scene.gltf -o scene.glb -cc -tc -kn
```
- `-cc` : Compression Meshopt de la géométrie (indices et sommets).
- `-tc` : Compression des textures en KTX2 Basis Universal.
- `-kn` : Préservation des noms de nœuds pour l'animation.

---

## 3. Élimination des Draw Calls & Commutations d'État

Chaque changement de matériau, de texture ou d'état de mélange (BlendMode) oblige le pilote graphique à émettre un ordre de commutation coûteux.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Matrice de Décision de Rendu                             │
├──────────────────────────┬─────────────────────────────┬───────────────────────────────┤
│ Configuration Géométrique│ Technique Recommandée        │ Impact Draw Calls             │
├──────────────────────────┼─────────────────────────────┼───────────────────────────────┤
│ $N$ objets identiques    │ `THREE.InstancedMesh`       │ $N$ draw calls $\rightarrow$ **1** │
│ Multiples objets divers   │ `THREE.BatchedMesh` (Three.js 160+) | $M$ draw calls $\rightarrow$ **1** │
│ Géométries statiques fixes│ `BufferGeometryUtils.merge` │ $K$ draw calls $\rightarrow$ **1** │
└──────────────────────────┴─────────────────────────────┴───────────────────────────────┘
```

### Règles d'Or de l'Instanciation :
1. **Usage Buffer Déclaratif** :
   ```typescript
   instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Si animation
   // Ne déclencher la mise à jour que lors des frames modifiées :
   instancedMesh.instanceMatrix.needsUpdate = true;
   ```
2. **Attributs par Instance (`InstancedBufferAttribute`)** :
   Injecter les variations (couleurs, indices de texture, décalages d'animation) dans des attributs personnalisés plutôt que de créer des matériaux séparés.

---

## 4. Optimisation du Remplissage (*Rasterizer*) & Overdraw

L'*overdraw* (sur-dessin) survient lorsque le GPU exécute des fragment shaders complexes pour des pixels qui seront ensuite recouverts par d'autres objets situés plus près de la caméra.

### 4.1 La Technique du Depth Pre-Pass (Early-Z)
Pour les scènes denses avec des shaders lourds (PBR, réfraction, bruit procédural) :
1. **Passe 1 (Z-Prepass)** : Rendre la scène avec un matériau de profondeur simple (`MeshDepthMaterial`) en désactivant l'écriture de couleur (`colorWrite = false`, `depthWrite = true`).
2. **Passe 2 (Passe Principale)** : Rendre la scène avec les matériaux complexes en mode `depthFunc = THREE.EqualDepth` (ou `LEQUAL`) et `depthWrite = false`.
3. **Gain** : Le GPU élimine instantanément au niveau matériel (*Early-Z*) tous les fragments masqués sans exécuter un seul calcul de lumière ou de texture dans le fragment shader.

### 4.2 Limitation du Pixel Ratio (DPR)
Sur les écrans Retina / 4K mobiles, un `window.devicePixelRatio` de 3 engendre $9 \times$ plus de pixels à calculer qu'un écran standard.
```typescript
// Toujours plafonner le pixel ratio :
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
```

### 4.3 Optimisation des Shaders GLSL
- **Éviter le branchement dynamique divergent** (`if/else` dépendant des variables) dans les fragment shaders car les processeurs de flux GPU (warps/wavefronts) exécutent les deux branches pour tous les threads. Remplacer par `step()`, `smoothstep()`, `mix()`, `clamp()`.
- **Déplacer les calculs du Fragment Shader vers le Vertex Shader** : Calculer les vecteurs de lumière, distances ou coordonnées UV animées dans le Vertex Shader (exécuté $N_{\text{sommets}}$ fois) et les transmettre via `varying` (interpolés matériellement) au lieu de recalculer $N_{\text{pixels}}$ fois.
- **Précision Numérique** : Déclarer `precision mediump float;` pour les couleurs et normales, et réserver `highp` aux calculs de position dans l'espace monde et aux matrices de vue.

---

## 5. Éclairages, Ombres & Environnement IBL

Les ombres portées traditionnelles (*Shadow Maps*) ré-exécutent une passe complète de rendu de la scène par source lumineuse.

### Bonnes Pratiques Ombres :
1. **Désactiver la mise à jour automatique** pour les lumières statiques :
   ```typescript
   renderer.shadowMap.autoUpdate = false;
   // Forcer la mise à jour uniquement sur modification :
   renderer.shadowMap.needsUpdate = true;
   ```
2. **Ajuster au plus juste le Frustum de l'Ombre** :
   Réduire les dimensions de `light.shadow.camera.left`, `right`, `top`, `bottom`, `near`, `far` pour englober strictement les objets visibles. Un frustum trop large gaspille la résolution de la shadow map.
3. **Résolution Ciblée** : Réduire `light.shadow.mapSize.set(512, 512)` sur les lumières secondaires.

---

## 6. Post-Processing & Fusion des Passes (*Uber-Shader*)

L'utilisation naïve de `EffectComposer` enchaîne plusieurs passes séquentielles (Bloom $\rightarrow$ Vignette $\rightarrow$ Grain $\rightarrow$ Tone Mapping), impliquant des lectures/écritures répétées dans des cibles de rendu mémoire (*framebuffer switches*).

### Le Standard `pmndrs/postprocessing` :
- Utiliser la bibliothèque [`pmndrs/postprocessing`](https://github.com/pmndrs/postprocessing) qui compile l'ensemble des effets compatibles au sein d'un **seul et unique shader de post-traitement** (*EffectPass* fusionné).
- Réduit le coût de post-traitement de 5 passes de rendu distinctes à **1 seule passe plein écran**.

---

## 7. Checklist de Validation de Performance GPU (Normes 2026)

| Indicateur / Métrique | Valeur Cible (60 fps stable) | Action Corrective si Dépassé |
| :--- | :--- | :--- |
| **Draw Calls (`renderer.info.render.calls`)** | **$\le 100$** | Instanciation (`InstancedMesh`), fusion géométrique. |
| **Triangles Visibles** | **$\le 500\,000$** | LOD (Level of Detail), décimation Blender, Meshopt. |
| **Empreinte VRAM Textures** | **$\le 250$ Mo** | Compression KTX2/Basis, réduction des résolutions (max 2K). |
| **Plafond DPR** | **$\le 2.0$** | `Math.min(window.devicePixelRatio, 2)`. |
| **Raycasting Spatial** | **$\le 0.5$ ms** | Implémenter `three-mesh-bvh` sur les maillages $>5k$ polys. |
| **Shadow Map Updates** | **Sur événement** | `shadowMap.autoUpdate = false`. |
| **Fuites VRAM (Changement de Scène)** | **0 fuite** | Traversée récursive et appel `.dispose()` sur géométries et textures. |

---

## 🔗 Notes Associées dans la Base de Connaissances
- [[ThreeJS Optimization and Performance Guide]]
- [[Spatial Indexing and BVH Acceleration]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[PBR Shading and Material Models]]
- [[ThreeJS Viewport and Calibration Pipeline]]

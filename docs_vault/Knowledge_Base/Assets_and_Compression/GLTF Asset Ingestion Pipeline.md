# Pipeline Industriel d'Ingestion d'Assets GLTF

*Domaine : Pipeline de Données 3D & Optimisation en Amont*

---

## 1. Étapes Clés du Pipeline d'Ingestion

```
[Export Modèle 3D (Blender / Maya)]
                │ (GLTF / GLB brut)
                ▼
      [Nettoyage & Décimation]
      - Suppression des faces invisibles
      - Suppression des attributs non utilisés (Vertex Colors orphelines, Tangents superflues)
                │
                ▼
      [Traitement gltfpack]
      - Compression géométrie : Meshopt
      - Compression textures : KTX2 / Basis Universal
                │
                ▼
      [Livraison & Décodage Three.js]
      - GLTFLoader + KTX2Loader + MeshoptDecoder (Wasm)
```

---

## 2. Configuration Standard de `GLTFLoader` dans Three.js
```typescript
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(renderer);

export const gltfLoader = new GLTFLoader()
  .setKTX2Loader(ktx2Loader)
  .setMeshoptDecoder(MeshoptDecoder);
```

---

## 🔗 Notes Associées
- [[KTX2 and Basis Universal Texture Compression]]
- [[Meshopt Geometry Compression and gltfpack]]
- [[Draco vs Meshopt Comparison]]

# Node Catalog (Tsuji)

*Emplacement dans le code : `src/shared/graph/nodes/index.ts`*

Ce document référence l'ensemble des plus de 100 nœuds disponibles dans le moteur Tsuji, classés par domaine fonctionnel.

---

## 1. Mathématiques, Logique & Signaux
- **`value/math`**, **`value/map-range`**, **`value/clamp`**, **`value/constant`**
- **`vector/compose`**, **`vector/decompose`**, **`vector/math`**
- **`color/compose`**, **`color/decompose`**, **`color/math`**
- **`logic/compare`**, **`logic/boolean`**, **`logic/trigger`**, **`logic/toggle`**, **`logic/gate`**
- **`time/time`**, **`time/frame`**, **`oscillator`**, **`envelope`**, **`pulse`**

## 2. Géométrie 3D & Modificateurs
- **Primitives 3D** : Box, Sphere, Cylinder, Cone, Disc, Plane, Polygon, Text 3D, Empty.
- **Importateurs** : OBJ (`objLoader.ts`), GLTF (`gltfLoader.ts`), PLY (`plyLoader.ts`).
- **Modificateurs** : `lattice/deform`, `subdivide`, `mesh/extrude`, `mesh/delete`, `boolean`, `shade`, `visualSlice`.
- **Courbes & Lignes** : Catmull-Rom splines, SVG import, shape keys, curve to mesh, curve deform.

## 3. Particules & Simulation GPGPU
- **Émetteurs** : `particles/emitter`, `emitter-from-points`, `emitter-from-surface`.
- **Moteur GPU** : `particles/simulate` (shaders de turbulence, gravité, vortex).
- **Rendu** : `particles/render` (points), `particles/render-instances` (`THREE.InstancedMesh`), `particles/trails`.

## 4. Audio & Signaux Interactifs
- **`sound/audio-player`**, **`sound/spectrum`**, **`sound/peak-detector`**, **`sound/synth`**, **`sound/microphone`**.
- **`keyboard`**, **`mouse`**, **`click`**, **`csv-reader`**.

## 5. Post-Traitement & Éclairage
- **Post-Process** : Bloom, DOF, RGB Shift, Vignette, Outline, Grain, Glitch, SSAO, Fog.
- **Lumières** : Directional, Point, Spot, Ambient, Environment, Light Probe.

---

## 🔗 Notes Associées
- [[Node Creation Guide]]
- [[Parametric Geometry and Modifiers]]
- [[Socket Type System and Ownership]]

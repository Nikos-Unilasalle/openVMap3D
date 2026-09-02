# Node Catalog (Tsuji)

*Emplacement dans le code : `src/shared/graph/nodes/index.ts`*

Ce document référence l'ensemble des plus de 115 nœuds disponibles dans le moteur Tsuji, classés par domaine fonctionnel.

---

## 1. Mathématiques, Logique & Signaux
- **`value/math`**, **`value/map-range`**, **`value/clamp`**, **`value/constant`**
- **`vector/compose`**, **`vector/decompose`**, **`vector/math`**
- **`color/compose`**, **`color/decompose`**, **`color/math`**
- **`logic/compare`**, **`logic/boolean`**, **`logic/trigger`**, **`logic/toggle`**, **`logic/gate`**
- **`time/time`**, **`time/frame`**, **`oscillator`**, **`envelope`**, **`pulse`**, **`animation/wiggle`**

## 2. Géométrie 3D & Modificateurs
- **Primitives 3D** : Box, Sphere, Cylinder, Cone, Disc, Plane, Polygon, Text 3D, Empty, **`object/raccoon`** *(avec Gizmo interactif)*.
- **Importateurs** : OBJ (`objLoader.ts`), GLTF (`gltfLoader.ts`), PLY (`plyLoader.ts`).
- **Modificateurs Paramétriques** :
  - **`geometry/twist-bend-taper`** : Torsion axiale (*Twist*), flexion circulaire (*Bend*) et effilement conique (*Taper*).
  - **`geometry/wave-ripple`** : Ondulations concentriques (*Ripple* avec point d'impact $X/Z$) et ondes planes (*Linear*).
  - **`geometry/facet-explode`** : Éclatement polygonal le long des normales de faces.
  - `lattice/deform`, `subdivide`, `mesh/extrude`, `mesh/delete`, `boolean`, `shade`, `visualSlice`, `squash`.
- **Courbes & Lignes** : Catmull-Rom splines, SVG import, shape keys, curve to mesh, curve deform.

## 3. Particules & Simulation GPGPU / Chaos
- **Émetteurs** : `particles/emitter`, `emitter-from-points`, `emitter-from-surface`.
- **Moteur GPU & Champs de Force** :
  - `particles/simulate` (shaders de turbulence, gravité, vortex, rebond sol).
  - `particles/force-field` : attracteur, vortex, vent, turbulence.
  - **`particles/curl-noise`** : champ de force vectoriel à rotationnel incompressible (volutes de fumée / encre) avec proxy Gizmo 3D dans le viewport.
- **Dynamique Chaotique** :
  - **`particles/strange-attractor`** : solveur RK4 de systèmes non-linéaires (**Lorenz**, **Aizawa**, **Thomas**) avec transform, gizmo natif et sortie points list.
- **Rendu** : `particles/render` (points), `particles/render-instances` (`THREE.InstancedMesh`), `particles/trails`.

## 4. Matériaux Procéduraux & Shaders FX
Tous ces matériaux se branchent directement sur la prise `material` des maillages Three.js et disposent de contrôles créatifs temps réel :
- **`material/hologram`** : Scanlines 3D animées en coordonnées monde, contour Fresnel néon, tranches de glitchs, grain cathodique (`noiseIntensity`) et netteté de trames (`stripeSharpness`).
- **`material/liquid-metal`** : Mercure et métal liquide en fusion avec bruit Simplex et **Domain Warping** imbriqué multi-octaves, brillance spéculaire (`metalness`) et nuançage nacré (`iridescence`).
- **`material/cel-shade`** : Shading cartoon / pop-art, bandes de lumière franches (2 à 10), trame de demi-teinte (*halftone dots*), contour manga et éclat spéculaire paramétrable (`specularStrength`).
- **`material/iridescent`** : Simulation physique d'interférence en couches minces (*thin-film*) avec déphasage spectral nanométrique.
- **`material/wireframe-pulse`** : Filaire vectoriel dérivé à largeur constante à l'écran avec onde de choc lumineuse pulsée (*pulse wave*).
- **`material/thermal`** : Caméra thermique / vision infrarouge (FLIR) avec gradient spectral physique et bascule instantanée White Hot / Black Hot (`invert`).
- **`material/xray`** : Scanner radiologique et tomographie médicale avec transparence frontale et condensation de densité optique aux tangentes.
- **`material/energy-shield`** : Bouclier de force hexagonal cyberpunk avec onde d'impact réactive et lueurs Fresnel.

## 5. Scénographie & Éclairage Volumétrique
- **`object/laser-beam`** : Projecteur scénographique motorisé avec tête rotative **Pan / Tilt**, faisceau laser volumétrique transparent simulant la brume d'ambiance, stroboscope / pulsation BPM (`pulseFrequency`), divergence conique (`coneAngle`), spot d'impact lumineux au sol (`spotSize`) et support complet du transform/gizmo natif.
- **Lumières Standard** : Directional, Point, Spot, Ambient, Environment, Light Probe.

## 6. Audio & Signaux Interactifs
- **`sound/audio-player`**, **`sound/spectrum`**, **`sound/peak-detector`**, **`sound/synth`**, **`sound/microphone`**.
- **`keyboard`**, **`mouse`**, **`click`**, **`csv-reader`**.

## 7. Post-Traitement
- **Post-Process** : Bloom, DOF, RGB Shift, Vignette, Outline, Grain & CRT Scanlines (animés à 60 FPS), Glitch, SSAO, Fog.

---

## 🔗 Notes Associées
- [[Creative FX and Stage Nodes]]
- [[Creative WebGL Shaders and Distortion Techniques]]
- [[Node Creation Guide]]
- [[Parametric Geometry and Modifiers]]
- [[Socket Type System and Ownership]]

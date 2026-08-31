# Tsuji

Moteur de Studio 3D et Node Graph Temps Réel pour le Vidéo-Mapping, la Data-Visualisation, l'Animation Paramétrique et les Arts Numériques.

Disponible directement en ligne sur le Web et en application Desktop haute performance (Tauri 2, React 19, Three.js, Vite 7, TypeScript).

* **Version en ligne (Web App)** : [https://nikos-unilasalle.github.io/tsuji/](https://nikos-unilasalle.github.io/tsuji/)
* **Version Desktop** : macOS, Windows, Linux via Tauri v2.

---

## Sommaire

1. [Présentation du Logiciel](#présentation-du-logiciel)
2. [Stack Technique](#stack-technique)
3. [Architecture et Moteur d'Évaluation](#architecture-et-moteur-dévaluation)
4. [Types de Sockets et Données](#types-de-sockets-et-données)
5. [Catalogue des Nœuds (Nodes)](#catalogue-des-nœuds-nodes)
   - [Structure et Primitives 3D](#structure-et-primitives-3d)
   - [Édition Géométrique et Opérations CSG](#édition-géométrique-et-opérations-csg)
   - [Import Vectoriel et SVG](#import-vectoriel-et-svg)
   - [Points, Sélection et Connectivité](#points-sélection-et-connectivité)
   - [Physique et Raycasting](#physique-et-raycasting)
   - [Animation, Mouvement et Dynamique (Spring, Trail, Orbit)](#animation-mouvement-et-dynamique-spring-trail-orbit)
   - [Courbes, Morphing et Shape Keys](#courbes-morphing-et-shape-keys)
   - [Lumières, Matériaux et Environnement](#lumières-matériaux-et-environnement)
   - [Instanciation et Formations (Array & Spawner)](#instanciation-et-formations-array--spawner)
   - [Système de Particules, Champs de Forces et Trajectoires](#système-de-particules-champs-de-forces-et-trajectoires)
   - [Caméra et Calibration Vidéo-Mapping (DLT)](#caméra-et-calibration-vidéo-mapping-dlt)
   - [Data-Visualisation et Graphiques](#data-visualisation-et-graphiques)
   - [Post-Traitement et Shaders GPU](#post-traitement-et-shaders-gpu)
   - [Audio et Analyse Spectrale (FFT)](#audio-et-analyse-spectrale-fft)
   - [Mathématiques, Vecteurs et Logique](#mathématiques-vecteurs-et-logique)
   - [Listes et Manipulation de Données](#listes-et-manipulation-de-données)
   - [Texte, Typographie et Entrées/Sorties](#texte-typographie-et-entrées-sorties)
   - [Utilitaires et Organisation](#utilitaires-et-organisation)
6. [Moteur d'Animation Paramétrique et Studio 3D](#moteur-danimation-paramétrique-et-studio-3d)
7. [Raccourcis Clavier](#raccourcis-clavier)
8. [Installation, Tests et Déploiement](#installation-tests-et-déploiement)
9. [Licence](#licence)

---

## Présentation du Logiciel

Tsuji est un environnement de création nodale temps réel dédié à la scénographie numérique, au vidéo-mapping architectural, à la data-visualisation 3D et aux installations interactives.

Accessible instantanément depuis un navigateur web moderne ou compilé en application desktop native avec Tauri v2, Tsuji combine la puissance de rendu Three.js avec la réactivité d'un graphe de flux de données acyclique (DAG). Chaque élément visuel, transformation spatiale, comportement physique, modulation sonore et passe de post-traitement est piloté de manière déclarative par les interconnexions de nœuds.

---

## Stack Technique

- **Core UI & Logic** : React 19, TypeScript, Vite 7
- **Rendu 3D & Moteur Graphique** : Three.js (r185), `three-mesh-bvh`, `three-bvh-csg`
- **Graphe Nodal & Éditeur** : `@xyflow/react` v12
- **Gestion d'État** : Zustand v5
- **Application Native** : Tauri 2 (Rust)
- **Suite de Tests** : Vitest v4
- **Parsing & Format** : PapaParse (CSV), Opentype.js, UUID

---

## Architecture et Moteur d'Évaluation

Le graphe de Tsuji fonctionne selon un pipeline d'évaluation trié topologiquement et exécuté à chaque rafraîchissement d'image (60 FPS) :

1. **Résolution des Dépendances** : Le graphe trie les nœuds de la source vers les puits. Les cycles sont détectés et traités sans bloquer l'exécution.
2. **Propagations et Fallbacks** : Si une prise d'entrée n'est pas connectée, la valeur provient du paramètre local du nœud ou de sa valeur par défaut.
3. **Caches de Géométrie et GPU Hygiene** : Les géométries, textures, frames de Frenet, shaders et simulateurs de particules sont mis en cache par identifiant de nœud (`nodeId`) et recyclés intelligemment pour éviter les allocations mémoire superflues.
4. **Isolation Live-Edit** : Pendant la manipulation d'un gizmo dans la vue 3D, la matrice de l'objet manipulé est préservée temporairement pour permettre l'écriture inverse sans écrasement par le graphe.

---

## Types de Sockets et Données

Les prises de connexion (sockets) sont identifiées par des codes couleur normalisés :

| Type de Socket | Identifiant | Description | Format de Donnée |
| :--- | :--- | :--- | :--- |
| **Scalaire** | `value` | Nombre flottant ou entier, booleen (0/1) | `number` |
| **Vecteur** | `vector` | Coordonnées 3D (X, Y, Z) | `THREE.Vector3` |
| **Matrice** | `matrix` | Matrice de transformation 4x4 | `THREE.Matrix4` |
| **Couleur** | `color` | Valeur chromatique RGB/RGBA | `THREE.Color` |
| **Géométrie** | `geometry` | Objet 3D, Mesh, Group ou Line Three.js | `THREE.Object3D` |
| **Texture** | `texture` | Texture bitmap, carte de normale ou canvas | `THREE.Texture` |
| **Courbe** | `curve` | Trajectoire 3D continue paramétrable | `THREE.Curve<THREE.Vector3>` |
| **Liste** | `list` | Tableau ordonné d'éléments | `Array<unknown>` |
| **Texte** | `text` | Chaîne de caractères | `string` |
| **Polymorphe** | `any` | Socket adaptatif acceptant tout format | `unknown` |
| **Matériau** | `material` | Descripteur de matériau PBR (couleur, émissif, sans ombrage) | `MaterialValue` |
| **Post-traitement** | `postprocess` | Configuration d'une passe d'effet (Bloom, DOF…) | `PostProcessConfig` |

---

## Catalogue des Nœuds (Nodes)

<!-- nodes:begin -->
**206 nœuds enregistrés** — tableau généré depuis `DEFAULT_REGISTRY` par `npm run docs:nodes`, ne pas éditer à la main.



### Calibration

| Node | Type |
| :--- | :--- |
| **3D Grid** | `calibration/grid` |
| **Camera** | `calibration/camera` |
| **Fly To** | `camera/fly_to` |
| **Room Corner** | `calibration/room_corner` |

### Compose

| Node | Type |
| :--- | :--- |
| **Compose Color** | `color/compose` |
| **Compose Matrix** | `transform` |
| **Compose Vector** | `vector/compose` |
| **Decompose Color** | `color/decompose` |
| **Decompose Matrix** | `matrix/decompose` |
| **Decompose Vector** | `vector/decompose` |

### Converter

| Node | Type |
| :--- | :--- |
| **Color to Vector** | `converter/color-to-vector` |
| **Instance Positions** | `structure/instance-positions` |
| **Instances to List** | `structure/instances-to-list` |
| **Mesh to Points** | `converter/mesh-to-points` |
| **Points to Mesh** | `converter/points-to-mesh` |
| **Value to Color** | `converter/value-to-color` |
| **Value to Text** | `converter/value-to-text` |
| **Value to Vector** | `converter/value-to-vector` |
| **Vector to Color** | `converter/vector-to-color` |

### Curve / Path

| Node | Type |
| :--- | :--- |
| **Curve Array** | `curve/array` |
| **Curve Deform** | `curve/deform` |
| **Curve from Points** | `curve/from_points` |
| **Curve from Points** | `curve/from_point_lists` |
| **Curve Primitive** | `curve/primitive` |
| **Curve Shape Key** | `curve/shape_key` |
| **Curve Subdivide** | `curve/subdivide` |
| **Curve to Line** | `curve/to_line` |
| **Curve to Mesh** | `curve/to_mesh` |
| **Curve to Points** | `curve/to_points` |
| **Curves to Lines** | `curve/to_line_list` |
| **Curves to Meshes** | `curve/to_mesh_list` |
| **Follow Path** | `curve/sample` |
| **SVG to Curves** | `curve/svg` |
| **SVG to Mesh** | `curve/svg_mesh` |
| **SVG to Solid** | `curve/svg_solid` |

### HUD

| Node | Type |
| :--- | :--- |
| **HUD Image** | `hub/image` |
| **HUD Text** | `hub/text` |

### Instance

| Node | Type |
| :--- | :--- |
| **Array** | `structure/array` |
| **Geometry Transform** | `structure/geometry-transform` |
| **Get Instance** | `structure/get-instance` |
| **Instance Transform** | `structure/instance-transform` |
| **Set Instance Color** | `structure/instance-color` |
| **Spawner** | `structure/spawn` |
| **Texture Pixel Spawner** | `texture/pixel-spawner` |

### I/O

| Node | Type |
| :--- | :--- |
| **Inspector** | `io/inspector` |
| **Keyboard** | `io/keyboard` |
| **Mouse** | `io/mouse` |
| **Mouse Click** | `io/click` |

### Lighting & Shadows

| Node | Type |
| :--- | :--- |
| **Ambient Light** | `light/ambient` |
| **Directional Light** | `light/directional` |
| **Environment & HDRI** | `lighting/environment` |
| **Light Probe** | `light/probe` |
| **Point Light** | `light/point` |
| **Spot Light** | `light/spot` |

### List

| Node | Type |
| :--- | :--- |
| **Color Palette List** | `list/color-palette` |
| **Combine Lists Math** | `list/combine-math` |
| **Combine Vectors** | `list/combine-vectors` |
| **CSV Reader** | `io/csv-reader` |
| **Distance Gradient List** | `list/distance-gradient` |
| **Generate List** | `list/generate` |
| **Get List Item** | `list/get-item` |
| **List Group** | `list/group` |
| **List Length** | `list/length` |
| **List Map Range** | `list/map-range` |
| **List Math** | `list/math` |
| **List Statistics** | `list/statistics` |
| **Points Influence** | `list/points-influence` |
| **Points Selection** | `list/points-selection` |
| **Random Sample List** | `list/random-sample` |
| **Slice List** | `list/slice` |
| **Split Vector List** | `list/split-vectors` |
| **Stagger** | `list/stagger` |
| **Vertices to Points** | `list/points-from-geometry` |

### Logic

| Node | Type |
| :--- | :--- |
| **Boolean Logic** | `logic/boolean` |
| **Compare** | `logic/compare` |
| **Gate** | `logic/gate` |
| **Logic Bridge** | `logic/bridge` |
| **Toggle** | `logic/toggle` |
| **Trigger** | `logic/trigger` |

### Math

| Node | Type |
| :--- | :--- |
| **Clamp** | `value/clamp` |
| **Color** | `color/constant` |
| **Color Math** | `color/math` |
| **Distance** | `math/distance` |
| **Distances** | `math/distances` |
| **Map Range** | `value/map-range` |
| **Matrix Math** | `matrix/math` |
| **Proximity Object** | `object/proximity` |
| **Random List** | `list/random-list` |
| **Random Matrix** | `transform/random-matrix` |
| **Random Value** | `math/random-value` |
| **Random Vector** | `vector/random-vector` |
| **Spring** | `math/spring` |
| **Spring Vector** | `vector/spring` |
| **Value** | `value/constant` |
| **Value Math** | `value/math` |
| **Vector Math** | `vector/math` |
| **Velocity** | `math/velocity` |
| **Wiggle Number** | `math/wiggle-number` |
| **Wiggle Vector** | `vector/wiggle-vector` |

### Object

| Node | Type |
| :--- | :--- |
| **Bar Graph** | `object/bar_graph` |
| **Box** | `object/box` |
| **Chart Axis** | `object/chart_axis` |
| **Cone** | `object/cone` |
| **Cylinder** | `object/cylinder` |
| **Disc** | `object/disc` |
| **Edit Mesh Points** | `object/edit_points` |
| **Empty** | `object/empty` |
| **Frozen Geometry** | `object/frozen` |
| **glTF Model** | `object/gltf` |
| **Line Graph** | `object/line_graph` |
| **Mesh Shape Key** | `object/shape_key` |
| **OBJ Model** | `object/obj` |
| **Pie / Donut Chart** | `object/pie_chart` |
| **Plane** | `object/plane` |
| **PLY Point Cloud** | `object/ply_point_cloud` |
| **Point Cloud** | `object/point_cloud` |
| **Polygon** | `object/polygon` |
| **Raccoon** | `object/raccoon` |
| **Scatter Plot** | `object/scatter_plot` |
| **Sphere** | `object/sphere` |
| **Text** | `object/text` |

### Particles

| Node | Type |
| :--- | :--- |
| **Capture Trails** | `particles/capture-trails` |
| **Connect Nearby** | `particles/connect-nearby` |
| **Force Field** | `particles/force-field` |
| **Ground** | `particles/ground` |
| **Particle Emitter** | `particles/emitter` |
| **Particle Instances** | `particles/render-instances` |
| **Particle Render** | `particles/render` |
| **Particle Simulate** | `particles/simulate` |
| **Particles to Points** | `particles/to-points` |
| **Point Emitter** | `particles/emitter-from-points` |
| **Points to Particles** | `particles/points-to-particles` |
| **Surface Emitter** | `particles/emitter-from-surface` |

### Physics

| Node | Type |
| :--- | :--- |
| **Ray Burst** | `physics/ray-burst` |
| **Raycast** | `physics/raycast` |
| **Rolling** | `physics/rolling` |
| **Surface Scatter** | `physics/sample` |
| **Volume Scatter** | `physics/volume_scatter` |

### Post-Process & FX

| Node | Type |
| :--- | :--- |
| **Ambient Occlusion** | `postprocess/ambient-occlusion` |
| **Bloom** | `postprocess/bloom` |
| **Color Correction** | `postprocess/color-correction` |
| **Depth of Field** | `postprocess/dof` |
| **Digital Glitch** | `postprocess/glitch` |
| **Film Grain** | `postprocess/film-grain` |
| **Fog / Atmosphere** | `postprocess/fog` |
| **FXAA Antialiasing** | `postprocess/antialias` |
| **Kaleidoscope** | `postprocess/kaleidoscope` |
| **Outline** | `postprocess/outline` |
| **Pixelate / Mosaic** | `postprocess/pixelate` |
| **RGB Shift** | `postprocess/rgb-shift` |
| **Vignette** | `postprocess/vignette` |

### Sound / Audio

| Node | Type |
| :--- | :--- |
| **Audio Peak Detector** | `sound/peak-detector` |
| **Audio Player** | `sound/player` |
| **Audio Spectrum** | `sound/spectrum` |
| **Audio Synth** | `sound/synth` |
| **Microphone Input** | `sound/microphone` |

### Structure

| Node | Type |
| :--- | :--- |
| **Merge** | `structure/merge` |
| **Render** | `render` |
| **Squash & Stretch** | `modifier/squash-stretch` |
| **Trail** | `structure/trail` |

### Text

| Node | Type |
| :--- | :--- |
| **Random Text** | `text/random` |
| **Text** | `text/constant` |
| **Text Case** | `text/case` |
| **Text Compare** | `text/compare` |
| **Text Concat** | `text/concat` |
| **Text Length** | `text/length` |
| **Text Replace** | `text/replace` |
| **Text Split** | `text/split` |
| **Text Substring** | `text/substring` |
| **Text Trim** | `text/trim` |

### Texture

| Node | Type |
| :--- | :--- |
| **Decal** | `object/decal` |
| **Image Texture** | `texture/image` |
| **Material** | `material/standard` |
| **Mix Texture** | `texture/mix` |
| **Procedural Texture** | `texture/procedural` |
| **Texture to Normal** | `texture/to_normal` |
| **Texture to Plane** | `texture/plane` |
| **Texture to Roughness** | `texture/to_roughness` |
| **Texture Transform** | `texture/transform` |

### Time / Animation

| Node | Type |
| :--- | :--- |
| **Envelope** | `animation/envelope` |
| **Frame** | `time/frame` |
| **Marker** | `time/marker` |
| **Oscillator** | `animation/oscillator` |
| **Pulse** | `time/pulse` |
| **Time** | `time` |
| **Time Remap** | `time/remap` |
| **Wiggle** | `animation/wiggle` |

### Transform

| Node | Type |
| :--- | :--- |
| **Boolean** | `modifier/boolean` |
| **Clip Box** | `modifier/clip-box` |
| **Delete Geometry** | `modifier/delete-geometry` |
| **Extrude Mesh** | `modifier/extrude` |
| **Face Selection** | `modifier/face-selection` |
| **Invert Normals** | `modifier/invert-normals` |
| **Lattice Deform** | `modifier/lattice` |
| **Look At** | `transform/look-at` |
| **Matrix Delay** | `transform/delay` |
| **Matrix Transform** | `transform/matrix-transform` |
| **Orbit** | `transform/orbit` |
| **Parent** | `transform/parent` |
| **Pivot Transform** | `transform/pivot` |
| **Shade** | `modifier/shade` |
| **Subdivide** | `modifier/subdivide` |
| **Transform Vector** | `transform/transform-vector` |
| **Visual Slice** | `modifier/visual-slice` |

### Utility

| Node | Type |
| :--- | :--- |
| **Go To Canvas** | `canvas/goto` |
| **Reroute** | `utility/reroute` |
<!-- nodes:end -->
---

## Moteur d'Animation Paramétrique et Studio 3D

Tsuji intègre un studio complet avec timeline et gizmos interactifs :

- **Timeline & Keyframing** : Pressez la touche `K` sur n'importe quel paramètre pour créer une image-clé.
- **Gizmos 3D** : Manipulez la position (`T`), la rotation (`R`) ou l'échelle (`S`) directement dans la vue 3D.
- **Marquee Selection** : `Cmd` (ou `Ctrl`) + Clic gauche & Glisser pour sélectionner plusieurs points de contrôle de courbe ou de cage Lattice.

---

## Raccourcis Clavier

| Raccourci | Action |
| :--- | :--- |
| `Espace` | Lancer / Mettre en pause la lecture de la timeline |
| `Cmd` + `Espace` / `Ctrl` + `Espace` | Recherche rapide de nœuds au curseur |
| `T` / `R` / `S` | Gizmos de Translation / Rotation / Échelle |
| `X` / `Y` / `Z` | Verrouiller le Gizmo sur l'axe X, Y ou Z |
| `Cmd` + Clic & Glisser | Sélection rectangulaire 2D de points 3D (Courbes, Lattice) |
| `K` | Enregistrer / Supprimer une image-clé sur le paramètre survolé |
| `Tab` | Masquer / Afficher les aides visuelles de la scène 3D |
| `Shift` + `Tab` | Basculer entre vue scindée et vue pleine |
| `Cmd` + `C` / `Cmd` + `V` | Copier / Coller les nœuds sélectionnés |
| `Cmd` + `Z` / `Ctrl` + `Z` | Annuler la dernière action |

---

## Installation, Tests et Déploiement

### 1. Cloner le dépôt
```bash
git clone https://github.com/Nikos-Unilasalle/tsuji.git
cd tsuji
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Lancer en mode développement (Web)
```bash
npm run dev
```

### 4. Lancer en mode application Desktop (Tauri)
```bash
npm run tauri dev
```

### 5. Exécuter la suite de tests unitaires
```bash
npm test
```

### 6. Compiler pour la production
```bash
npm run build
```

---

## Licence

Ce projet est distribué sous licence MIT. Consultez le fichier `LICENSE` pour plus de détails.

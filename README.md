# OpenVMap

Moteur de Studio 3D et Node Graph Temps Reel pour le Video-Mapping, la Data-Visualisation et les Arts Numeriques.

Disponible directement en ligne sur le Web et en application Desktop haute performance (Tauri 2, React 18, Three.js, TypeScript).

* **Version en ligne (Web App)** : [https://nikos-unilasalle.github.io/openVMap3D/](https://nikos-unilasalle.github.io/openVMap3D/)
* **Version Desktop** : macOS, Windows, Linux via Tauri 2.

---

## Sommaire

1. [Presentation du Logiciel](#presentation-du-logiciel)
2. [Architecture et Moteur d'Evaluation](#architecture-et-moteur-devaluation)
3. [Types de Sockets et Donnees](#types-de-sockets-et-donnees)
4. [Catalogue Exhaustif des Nodes](#catalogue-exhaustif-des-nodes)
   - [Structure et Primitives 3D](#structure-et-primitives-3d)
   - [Courbes et Trajectoires (Three.js Curves)](#courbes-et-trajectoires-threejs-curves)
   - [Camera, Calibration DLT et Transitions](#camera-calibration-dlt-et-transitions)
   - [Eclairage et Environnement](#eclairage-et-environnement)
   - [Materiaux et Textures](#materiaux-et-textures)
   - [Instanciation et Matrices (Array)](#instanciation-et-matrices-array)
   - [Systeme de Particules](#systeme-de-particules)
   - [Data-Visualisation et Graphiques](#data-visualisation-et-graphiques)
   - [Post-Traitement et Effets GPU](#post-traitement-et-effets-gpu)
   - [Mathematiques, Vecteurs et Logique](#mathematiques-vecteurs-et-logique)
   - [Audio et Analyse Spectrale](#audio-et-analyse-spectrale)
   - [Entrees et I/O](#entrees-et-io)
   - [Temps, Animation et Oscillateurs](#temps-animation-et-oscillateurs)
   - [Listes et Manipulation de Donnees](#listes-et-manipulation-de-donnees)
   - [Texte et Typographie](#texte-et-typographie)
   - [Organisation et Multi-Canevas](#organisation-et-multi-canevas)
5. [Moteur d'Animation Paramétrique et Studio 3D](#moteur-danimation-paramétrique-et-studio-3d)
   - [Animation Nodal-Paramétrique et Modulations en Continu](#animation-nodal-paramétrique-et-modulations-en-continu)
   - [Timeline, Interpolation et Keyframing Hybride](#timeline-interpolation-et-keyframing-hybride)
   - [Gizmos 3D et Manipulation Interactive](#gizmos-3d-et-manipulation-interactive)
   - [Calibration Video-Mapping (Direct Linear Transformation)](#calibration-video-mapping-direct-linear-transformation)
6. [Raccourcis Clavier](#raccourcis-clavier)
7. [Installation et Deploiement](#installation-et-deploiement)
8. [Licence](#licence)

---

## Presentation du Logiciel

OpenVMap est un environnement de creation nodale temps reel dedie a la scenographie numerique, au video-mapping architectural, a la data-visualisation 3D et aux installations interactives.

Accessible instantanement depuis un navigateur web moderne ou compile en application desktop native avec Tauri v2, OpenVMap combine la puissance de rendu Three.js avec la reactivite d'un graphe de flux de donnees acyclique (DAG). Chaque element visuel, transformation spatiale, comportement physique, modulation sonore et passe de post-traitement est pilote de maniere declarative par les interconnexions de nodes.

---

## Architecture et Moteur d'Evaluation

Le graphe d'OpenVMap fonctionne selon un pipeline d'evaluation topologically sorted execute a chaque rafraichissement d'image (60 FPS) :

1. **Resolution des Dependances** : Le graphe trie les nodes de la source vers les puits. Les cycles sont detectes et traites sans bloquer l'execution.
2. **Propagations et Fallbacks** : Si une prise d'entree n'est pas connectee, la valeur provient du parametre local du node ou de sa valeur par defaut.
3. **Caches de Geometrie et GPU Hygiene** : Les geometries, textures, frames de Frenet, shaders et simulateurs de particules sont mis en cache par identifiant de node (`nodeId`) et recycles intelligemment pour eviter les allocations memoire inutiles.
4. **Isolation Live-Edit** : Pendant la manipulation d'un gizmo dans la vue 3D, la matrice de l'objet manipule est preservee temporairement pour permettre l'ecriture inverse sans ecrasement par le graphe.

---

## Types de Sockets et Donnees

Les prises de connexion (sockets) sont identifiees par des codes couleur normalises :

| Type de Socket | Identifiant | Description | Format de Donnee |
| :--- | :--- | :--- | :--- |
| Scalaire | `value` | Nombre flottant ou entier, booleen normalise (0/1) | `number` |
| Vecteur | `vector` | Coordonnees 3D (X, Y, Z) | `THREE.Vector3` |
| Matrice | `matrix` | Matrice de transformation 4x4 | `THREE.Matrix4` |
| Couleur | `color` | Valeur chromatique RGB/RGBA | `THREE.Color` |
| Geometrie | `geometry` | Objet 3D, Mesh, Group ou Line Three.js | `THREE.Object3D` |
| Texture | `texture` | Texture bitmap, carte de normale ou canvas | `THREE.Texture` |
| Courbe | `curve` | Trajectoire 3D continue parametrable | `THREE.Curve<THREE.Vector3>` |
| Liste | `list` | Tableau ordonne d'elements de tout type | `Array<unknown>` |
| Texte | `text` | Chaine de caracteres | `string` |
| Polymorphe | `any` | Socket adaptatif acceptant tout format | `unknown` |

---

## Catalogue Exhaustif des Nodes

### Structure et Primitives 3D

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Box | `object/box` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Pavé 3D paramétrable (largeur, hauteur, profondeur) avec matériaux PBR et textures. |
| Plane | `object/plane` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Plan 2D dans l'espace 3D avec plaquage UV et options double face. |
| Sphere | `object/sphere` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Sphère 3D avec contrôle du rayon et des segments de résolution. |
| Cylinder | `object/cylinder` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Cylindre 3D avec rayons haut/bas configurables et facettes radiales. |
| Cone | `object/cone` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Cône 3D avec ajustement du rayon de base et de la hauteur. |
| Disc | `object/disc` | matrix, texture, normal, color, emissive, uvScale, uvOffset... | geometry, matrix | Disque circulaire 2D avec rayon et nombre de segments. |
| Text 3D | `object/text` | matrix, text, size, height, color, emissive... | geometry, matrix | Typographie vectorielle extrudée en 3D avec biseau configurable. |
| Empty | `object/empty` | matrix | geometry, matrix | Objet cible invisible servant de repère spatial, de pivot ou de cible d'éclairage. |
| OBJ Model | `object/obj` | matrix, file | geometry, matrix | Importateur de fichiers 3D au format Wavefront `.obj` avec gestion des sous-objets. |
| 3D Grid | `calibration/grid` | matrix | geometry, matrix | Grille de repère spatial 3D manipulable au gizmo, avec dimensions et subdivisions configurables. |
| Merge | `structure/merge` | item1..item8 (dynamique) | geometry | Fusionne jusqu'à 8 flux géométriques en une seule hiérarchie de scène. |
| Render | `render` | geometry, environment, postprocess, motionBlur | geometry, environment, postprocess | Sortie terminale et configuration de rendu (résolution, framerate, motion blur). |

### Courbes et Trajectoires (Three.js Curves)

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Curve from Points | `curve/from_points` | pointsList | curve | Génère une courbe 3D à partir d'une liste de points de contrôle (Catmull-Rom, Bézier, Linéaire). |
| Curve Primitive | `curve/primitive` | - | curve | Génère des courbes géométriques prédéfinies : Hélice (Helix), Cercle, Ligne, Rectangle. |
| Curve to Mesh | `curve/to_mesh` | curve, thickness, startProgress, endProgress, texture, normal, color, emissive... | geometry, matrix | Génère un tube 3D balayé avec début/fin paramétrables (0-100%), profil d'épaisseur variable et matériaux PBR. |
| Follow Path | `curve/sample` | curve, progress (0-1), up | position, tangent, matrix, rotation | Échantillonne la position, le vecteur tangentiel et la matrice d'orientation le long d'une courbe. |
| Curve Deform | `curve/deform` | geometry, curve, progress, stretch | geometry, matrix | Modificateur de déformation courbant un maillage 3D le long d'une trajectoire selon les repères de Frenet. |
| Lattice Deform | `modifier/lattice` | geometry, matrix, strength, points, bulge, twist, taper, bend, shearX, shearZ | geometry, matrix, cage | Cage de déformation 3D volumétrique (Free-Form Deformation type Blender) avec cage filaire et modulateurs. |

### Camera, Calibration DLT et Transitions

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Camera | `calibration/camera` | matrix, location, rotation, target, fov, active, refPoints | geometry, matrix, fov, projection, error, active | Caméra de rendu avec modes Manuel (Euler/Target Look-At) et Calibré (DLT pour vidéo-mapping). |
| Fly To | `camera/fly_to` | cameraA, cameraB, progress, trigger, duration, arcHeight | geometry, matrix, fov, active, progress, isFinished | Transition cinématique fluide entre deux caméras avec arc parabolique de vol et assouplissement. |
| Room Corner | `calibration/room_corner` | - | refPoints, geometry | Modèle géométrique 3D de la pièce physique (Mur A, Mur B, Hauteur) générant 6 repères de calage. |

### Eclairage et Environnement

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Directional Light | `light/directional` | matrix, target, color, intensity, castShadow | geometry, light | Source lumineuse directionnelle (type soleil) avec ombres portées et cible Empty. |
| Point Light | `light/point` | matrix, color, intensity, distance, decay, castShadow | geometry, light | Source lumineuse omnidirectionnelle ponctuelle avec atténuation physique. |
| Spot Light | `light/spot` | matrix, target, color, intensity, angle, penumbra, castShadow | geometry, light | Projecteur conique orientable avec angle de diffusion et adoucissement des bords. |
| Ambient Light | `light/ambient` | color, intensity | geometry, light | Lumière d'ambiance globale uniforme sans ombres portées. |
| Environment & HDRI | `environment/hdri` | - | environment | Carte d'environnement 32 bits flottants (.hdr / .exr) pour l'illumination globale PBR et reflets. |

### Materiaux et Textures

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Image Texture | `texture/image` | - | texture | Chargeur d'images bitmap (PNG, JPEG, WebP) pour textures diffuses et normales. |
| Texture Plane | `texture/plane` | matrix, texture | geometry, matrix | Générateur rapide de plan 2D texturé avec transparence alpha. |
| Texture Transform | `texture/transform` | texture, scale, offset, rotation | texture | Manipulation des coordonnées UV d'une texture (mise à l'échelle, décalage, rotation). |

### Instanciation et Matrices (Array)

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Array | `instance/array` | geometry, matrix, count | geometry | Duplication géométrique en modes Linear (1D), Circular (2D), Grid (2D) ou 3D Grid (Volume). |
| Set Instance Transform | `instance/set_transform` | geometry, matrices, index | geometry | Modifie les matrices de transformation d'un groupe d'instances ou d'une instance ciblée. |
| Set Instance Color | `instance/set_color` | geometry, colors, index | geometry | Modifie les couleurs d'un groupe d'instances via une liste de couleurs. |
| Get Instance | `instance/get` | geometry, index | geometry, matrix | Extrait la géométrie et la matrice d'une instance spécifique par son index. |
| Instances to List | `instance/to_list` | geometry | list | Convertit les matrices de toutes les instances d'un objet en une liste de matrices. |
| Geometry Transform | `instance/geom_transform` | geometry, matrix | geometry | Applique une transformation matricielle directement sur les sommets (baking géométrique). |
| Spawner | `structure/spawn` | support, items | geometry | Distribue et instancie des objets 3D de manière aléatoire sur la surface triangulée d'un maillage. |

### Systeme de Particules

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Particle Emitter | `particles/emitter` | matrix, rate, speed, spread, lifetime, size | emitterConfig | Définit les paramètres d'émission d'un flux de particules (débit, vitesse, dispersion). |
| Particle Simulate | `particles/simulate` | emitterConfig, gravity, wind, turbulence | particleState | Moteur physique GPGPU calculant la trajectoire, la gravité, le vent et la durée de vie. |
| Particle Render | `particles/render` | particleState, texture, color, size, blendMode | geometry | Rendu graphique des particules avec textures de sprites et modes de fusion additive/normale. |

### Data-Visualisation et Graphiques

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Bar Graph | `chart/bar` | values, labels, matrix, spacing, width, color | geometry, matrix | Histogramme 3D paramétrique généré à partir d'une liste de nombres scalaires. |
| Line Graph | `chart/line` | values, matrix, thickness, color | geometry, matrix | Graphique linéaire continu en tube ou ruban 3D. |
| Scatter Plot | `chart/scatter` | points, matrix, size, color | geometry, matrix | Nuage de points 3D avec marqueurs volumétriques à coordonnées (X, Y, Z). |
| Pie Chart | `chart/pie` | values, matrix, radius, thickness, innerRadius | geometry, matrix | Camembert ou anneau 3D extrudé avec secteurs colorés proportionnels. |
| Point Cloud | `chart/point_cloud` | positions, colors, size | geometry, matrix | Rendu optimisé de nuages de points massifs par particules fixes. |
| Chart Axis | `chart/axis` | matrix, size, ticks, labels | geometry, matrix | Axes de repère orthogonaux 3D gradués avec étiquettes de valeurs. |

### Post-Traitement et Effets GPU

| Node | Type | Description |
| :--- | :--- | :--- |
| Bloom | `postprocess/bloom` | Effet d'émanation lumineuse et de halo sur les surfaces brillantes et émissives. |
| Depth of Field | `postprocess/dof` | Flou de profondeur de champ optique avec distance de focus et ouverture réglables. |
| Film Grain | `postprocess/film_grain` | Simulation de bruit et grain de pellicule argentique analogique. |
| Vignette | `postprocess/vignette` | Assombrissement progressif des bords de l'image. |
| Outline | `postprocess/outline` | Détection de contours géométriques pour rendu de style cel-shading ou dessin technique. |
| Pixelate | `postprocess/pixelate` | Réduction de résolution par blocs pour esthétique pixel-art. |
| Glitch | `postprocess/glitch` | Décalages horizontaux aléatoires et artefacts de synchronisation vidéo. |
| Kaleidoscope | `postprocess/kaleidoscope` | Répétition radiale en miroir de l'image projetée. |
| RGB Shift | `postprocess/rgb_shift` | Aberration chromatique séparant les composantes rouge, verte et bleue. |
| Antialias | `postprocess/antialias` | Lissage spatial anti-crénelage (FXAA / SMAA). |
| Color Correction | `postprocess/color_correction` | Étalonnage des couleurs (luminosité, contraste, saturation, teinte). |
| Fog | `postprocess/fog` | Brume volumétrique basée sur le tampon de profondeur de la scène. |

### Animation, Temps et Bruit Procédural (Wiggle)

| Node | Type | Entrees | Sorties | Description |
| :--- | :--- | :--- | :--- | :--- |
| Wiggle | `animation/wiggle` | evolution, speed, amplitude, amplitudeVector, rotationAmplitude, scaleAmplitude, seed, octaves, persistance, lacunarity, offset, baseVector, matrix | value, vector, rotation, scale, matrix | Générateur de bruit fractal (fBm) type Blender Animation Nodes produisant simultanément des oscillations scalaires, vectorielles 3D, de rotation Euler et de matrices de transformation complètes. |
| Wiggle Number | `math/wiggle-number` | evolution, speed, amplitude, seed, octaves, persistance, lacunarity, offset | value | Générateur d'oscillations scalaires continues et cohérentes basées sur du bruit de gradient. |
| Wiggle Vector | `vector/wiggle-vector` | evolution, speed, amplitude, seed, octaves, persistance, lacunarity, baseVector | vector | Générateur de bruit 3D vectoriel (X, Y, Z) décorrélé pour déplacements procéduraux. |
| Oscillator | `animation/oscillator` | frequency, phase, amplitude, offset | out | Générateur de formes d'ondes périodiques continues (Sinus, Dent de scie, Carré, Triangle). |
| Envelope | `animation/envelope` | trigger, attack, release | out | Générateur d'enveloppe Attack / Release réagissant aux triggers et fronts montants. |
| Time | `time/time` | - | time, step | Horloge temps réel déterministe fournissant le temps écoulé en secondes et le numéro de frame. |

### Mathematiques, Vecteurs et Logique

| Node | Type | Description |
| :--- | :--- | :--- |
| Value Math | `math/value_math` | Opérations scalaires : addition, soustraction, multiplication, division, modulo, puissance, sinus, cosinus, etc. |
| Value Constant | `math/value_constant` | Émetteur d'une valeur numérique constante. |
| Clamp | `math/clamp` | Restreint une valeur dans un intervalle borné [min, max]. |
| Map Range | `math/map_range` | Remappe une valeur d'une plage source [inMin, inMax] vers une plage cible [outMin, outMax]. |
| Vector Math | `math/vector_math` | Opérations vectorielles 3D : addition, soustraction, produit scalaire, produit vectoriel, normalisation, longueur. |
| Vector Compose | `math/vector_compose` | Assemble trois scalaires X, Y, Z en un vecteur 3D. |
| Vector Decompose | `math/vector_decompose` | Sépare un vecteur 3D en trois composantes scalaires X, Y, Z. |
| Distance | `math/distance` | Calcule la distance euclidienne entre deux vecteurs, matrices ou objets 3D. |
| Proximity Object | `math/proximity_object` | Identifie l'objet ou l'instance la plus proche d'une cible parmi une collection. |
| Color Math | `math/color_math` | Opérations chromatiques : mélange (blend), addition, multiplication, inversion de couleurs. |
| Color Compose | `math/color_compose` | Assemble des canaux R, G, B, A en une couleur. |
| Color Decompose | `math/color_decompose` | Extrait les composantes scalaires R, G, B, A d'une couleur. |
| Color Constant | `math/color_constant` | Émetteur d'une valeur de couleur fixe. |
| Random Value | `math/random-value` | Génère des nombres aléatoires selon divers algorithmes (uniforme, gaussien, bruit 1D, exponentiel). |
| Random Vector | `vector/random-vector` | Génère des vecteurs 3D aléatoires ou répartis sur/dans une sphère. |
| Random Matrix | `transform/random-matrix` | Génère des matrices de transformation aléatoires (position, rotation, échelle). |
| Random List | `list/random-list` | Génère une liste de valeurs pseudo-aléatoires continues ou discrètes. |
| Boolean Logic | `logic/boolean` | Portes logiques booléennes : AND, OR, NOT, XOR. |
| Compare | `logic/compare` | Comparateurs de valeurs : égal, différent, supérieur, inférieur. |
| Gate | `logic/gate` | Laisse passer ou bloque un signal en fonction d'un contrôle booléen. |
| Toggle | `logic/toggle` | Bascule bistable inversant son état à chaque front montant du trigger. |
| Trigger | `logic/trigger` | Détecte les fronts montants (transition 0 vers 1) et émet une impulsion d'une frame. |
| Logic Bridge | `logic/bridge` | Pont de conversion et conditionnement logique. |

### Audio et Analyse Spectrale

| Node | Type | Description |
| :--- | :--- | :--- |
| Microphone Input | `sound/microphone` | Capture le flux audio du microphone ou de la carte son en temps réel. |
| Audio Spectrum | `sound/spectrum` | Analyseur de spectre FFT extrayant les bandes de fréquences (Basses, Médiums, Aigus). |
| Audio Peak Detector | `sound/peak_detector` | Détecteur d'attaques et de transitoires percussives (beats, kicks) avec seuil ajustable. |
| Audio Player | `sound/player` | Lecteur de fichiers audio (.mp3, .wav) avec contrôle de lecture, vitesse et volume. |
| Audio Synth | `sound/synth` | Synthétiseur sonore générant des formes d'onde audio pures (sinus, carré, scie). |

### Entrees et I/O

| Node | Type | Description |
| :--- | :--- | :--- |
| Keyboard | `io/keyboard` | Détecte les appuis sur le clavier en temps réel (`isDown` continu et `pressed` sur front montant). |
| CSV Reader | `io/csv` | Charge et analyse des fichiers de données tabulaires CSV pour alimenter le graphe. |
| Inspector | `io/inspector` | Moniteur de débogage affichant en temps réel la valeur circulant dans un fil. |

### Temps, Animation et Oscillateurs

| Node | Type | Description |
| :--- | :--- | :--- |
| Time | `time/time` | Émet le temps absolu en secondes, le delta-time et l'index de pas de simulation. |
| Frame | `time/frame` | Émet le numéro de frame courant de la timeline. |
| Oscillator | `time/oscillator` | Générateur d'oscillations périodiques (Sinusoïde, Carré, Dent de scie, Triangle) avec phase et fréquence. |
| Envelope | `time/envelope` | Générateur d'enveloppe temporelle d'Attaque et de Relâchement (Attack / Release). |
| Random Value | `time/random_value` | Générateur de nombres pseudo-aléatoires uniformes ou gaussiens avec graine (seed). |
| Random Vector | `time/random_vector` | Générateur de vecteurs 3D aléatoires distribués dans un cube ou une sphère. |
| Random Matrix | `time/random_matrix` | Générateur de matrices de transformation 3D aléatoires. |
| Random List | `time/random_list` | Génère une liste de valeurs ou vecteurs aléatoires. |

### Listes et Manipulation de Donnees

| Node | Type | Description |
| :--- | :--- | :--- |
| Generate List | `list/generate` | Génère une liste arithmétique de nombres de début à fin avec un pas donné. |
| Get List Item | `list/get_item` | Extrait l'élément situé à un index spécifique dans une liste. |
| List Length | `list/length` | Retourne le nombre total d'éléments contenus dans une liste. |
| Slice List | `list/slice` | Découpe et extrait une sous-section d'une liste entre deux index. |
| List Math | `list/math` | Applique une opération mathématique sur tous les éléments d'une liste (somme, moyenne, min, max). |
| List Statistics | `list/statistics` | Calcule les indicateurs statistiques d'une liste (médiane, variance, écart-type). |
| List Combine Math | `list/combine_math` | Combine deux listes terme à terme selon une opération arithmétique. |
| Combine Vector Lists | `list/combine_vectors`| Fusionne trois listes scalaires X, Y et Z en une liste de vecteurs 3D. |
| Split Vector List | `list/split_vectors` | Sépare une liste de vecteurs 3D en trois listes scalaires distinctes X, Y et Z. |
| Color Palette List | `list/palette` | Fournit des collections de palettes chromatiques harmonieuses sous forme de listes de couleurs. |
| List Group | `list/group` | Regroupe ou partitionne des éléments de liste. |

### Texte et Typographie

| Node | Type | Description |
| :--- | :--- | :--- |
| Text Constant | `text/constant` | Émetteur d'une chaîne de caractères textuelle fixe. |
| Text Concat | `text/concat` | Concatène plusieurs chaînes de caractères avec un séparateur optionnel. |
| Text Substring | `text/substring` | Extrait une portion de texte entre deux positions. |
| Text Length | `text/length` | Retourne la longueur en caractères d'un texte. |
| Text Case | `text/case` | Convertit le texte en majuscules (uppercase) ou minuscules (lowercase). |
| Text Replace | `text/replace` | Remplace les occurrences d'une sous-chaîne par une autre. |
| Text Split | `text/split` | Découpe une chaîne en liste de textes selon un délimiteur. |
| Text Trim | `text/trim` | Supprime les espaces superflus en début et fin de chaîne. |
| Text Compare | `text/compare` | Compare l'égalité de deux chaînes de caractères. |

### Utilitaires et Organisation de Graphe

| Node | Type | Description |
| :--- | :--- | :--- |
| Reroute | `utility/reroute` | Point de dérivation compact pour organiser et clarifier le câblage du graphe. |
| Canvas Go To | `canvas/goto`| Bascule automatiquement l'affichage vers l'un des canevas du projet lors d'un trigger. |

---

## Moteur d'Animation Paramétrique et Studio 3D

OpenVMap est avant tout un **moteur d'animation paramétrique et nodale** en temps réel. Contrairement aux outils d'animation 3D traditionnels à flux figé, chaque transformation, dimension, couleur, déformation de courbe, émission de particules, éclairage ou trajectoire de caméra est calculée et modulée dynamiquement par le graphe :

### Animation Nodal-Paramétrique et Modulations en Continu

* **Génération Procédurale** : Combinaison de fonctions mathématiques (`Value Math`, `Map Range`, `Vector Math`, `Clamp`) et d'oscillateurs périodiques (`Oscillator`, `Envelope`, `Time`) pour animer la position, la rotation, l'échelle, les couleurs et l'opacité sans poser une seule image-clé fixe.
* **Réactivité Audio et Entrées en Direct** : Les flux du microphone (`Microphone Input`), l'analyse FFT (`Audio Spectrum`), la détection de rythme (`Audio Peak Detector`) et le clavier (`Keyboard`) modulent instantanément la scène à 60 FPS.
* **Trajectoires de Courbes et Déformations Dynamiques** : Pilotage continu d'objets le long de trajectoires 3D via `Follow Path` et déformation de maillages complexes par `Curve Deform` selon les repères de Frenet.

### Timeline, Interpolation et Keyframing Hybride

Le studio intègre également un système d'images-clés (keyframes) granulaire fonctionnant en synergie avec les modulations nodales :

* **Pose d'Image-Clé Ciblée** : Survoler n'importe quel champ de saisie ou composante d'axe (X, Y ou Z) dans le panneau latéral et presser la touche `K` pour enregistrer une image-clé sur la frame courante.
* **Interpolation Temporelle** : Les valeurs entre images-clés sont interpolées automatiquement. Les champs affichent un repère visuel vert sur les frames exactes et orange sur les frames interpolées.
* **Marqueurs Neutres** : La touche `M` permet de poser des marqueurs visuels déplaçables à la souris sur la réglette de la timeline.
* **Priorité Absolue du Câblage** : Toute prise reliée par un câble prévaut systématiquement sur l'interpolation des keyframes locales, garantissant le contrôle procédural continu.

### Gizmos 3D et Manipulation Interactive

Tous les objets géométriques 3D, caméras, lumières et grilles disposent d'un contrôle direct par Gizmo dans la vue 3D :

* **Modes de Transformation** :
  - `T` : Translation (déplacement spatial).
  - `R` : Rotation (orientation Euler en degrés).
  - `S` : Mise à l'échelle (Scale).
* **Contrainte d'Axe** : Les touches `X`, `Y` et `Z` permettent de restreindre la manipulation le long d'un axe unique.
* **Édition Interactive des Courbes et de la Lattice** :
  - Les poignées de contrôle 3D s'affichent sous forme de sphères interactives vertes.
  - Sélectionner une poignée (clic) la passe en cyan et y attache le Gizmo.
  - `Shift` + Clic permet d'ajouter ou retirer des points de contrôle de la sélection.
  - `Cmd` (ou `Ctrl`) + Clic gauche & Glisser trace un **rectangle de sélection 2D (Marquee)** dans la vue 3D pour capturer instantanément plusieurs points de contrôle.
  - Lorsqu'un groupe de points est sélectionné, un **Gizmo au barycentre (centroïde)** apparaît pour translater, pivoter ou mettre à l'échelle tous les points sélectionnés simultanément.
  - Pour les courbes, les touches `A` et `D` permettent d'insérer ou supprimer des points de contrôle.

### Calibration Video-Mapping (Direct Linear Transformation)

OpenVMap intègre un solveur géométrique DLT pour l'alignement physique des vidéo-projecteurs :

1. Renseigner les dimensions physiques de la pièce (largeur du mur A, mur B, hauteur de plafond) dans le nœud `Room Corner`.
2. Connecter la sortie `Ref Points` de `Room Corner` à l'entrée `Ref Points` du nœud `Camera`.
3. Activer le mode calibré et ajuster les 6 poignées colorées sur les coins réels de l'espace projeté.
4. Le solveur calcule analytiquement la position exacte du projecteur dans l'espace 3D, sa rotation, son champ de vision vertical (FOV) et son décalage d'optique asymétrique (lens shift).

---

## Raccourcis Clavier

| Raccourci | Action |
| :--- | :--- |
| `Espace` | Lancer / Mettre en pause la lecture de la timeline |
| `Cmd` + `Espace` / `Ctrl` + `Espace` | Ouvrir la recherche rapide de nœuds au curseur |
| `T` | Activer le Gizmo de Translation sur l'objet ou les points sélectionnés |
| `R` | Activer le Gizmo de Rotation sur l'objet ou les points sélectionnés |
| `S` | Activer le Gizmo d'Échelle (Scale) sur l'objet ou les points sélectionnés |
| `X` / `Y` / `Z` | Verrouiller la manipulation du Gizmo sur l'axe X, Y ou Z |
| `Cmd` + Clic gauche & Glisser | Sélection rectangulaire 2D (Marquee) de points de contrôle (Courbes, Lattice) |
| `Shift` + Clic | Ajouter / retirer des points de contrôle ou nœuds de la sélection |
| `A` | Insérer un nouveau point de contrôle après la poignée de courbe active |
| `D` | Supprimer la poignée de courbe active |
| `K` | Poser ou supprimer une image-clé sur le paramètre ou l'axe survolé |
| `M` | Poser ou supprimer un marqueur de repère sur la timeline |
| `Tab` | Masquer ou afficher les aides visuelles de l'éditeur 3D |
| `Shift` + `Tab` | Basculer la vue scindée (Split View) Graphe / Vue 3D |
| `Shift` + Clic / Glisser | Sélection multiple de nœuds ou tracé de rectangle de sélection dans le graphe |
| `Cmd` + `C` / `Cmd` + `V` | Copier / Coller les nœuds sélectionnés avec leurs connexions |
| `Cmd` + `D` | Dupliquer les nœuds sélectionnés |
| `Suppr` / `Backspace` | Supprimer les nœuds ou câbles sélectionnés |
| `Cmd` + `Z` / `Ctrl` + `Z` | Annuler la dernière action (historique jusqu'à 50 étapes) |
| `Cmd` + `Shift` + `Z` / `Ctrl` + `Y` | Rétablir l'action annulée |

---

## Installation et Deploiement

### Prérequis

* Node.js version 18 ou supérieure
* Rust et Cargo (pour la compilation du backend natif Tauri 2)
* Gestionnaire de paquets `npm` ou `pnpm`

### 1. Cloner le dépôt

```bash
git clone https://github.com/Nikos-Unilasalle/openVMap3D.git
cd openVMap3D
```

### 2. Installer les dépendances

```bash
npm install
```

### 3. Exécution en mode développement web

```bash
npm run dev
```

### 4. Exécution de l'application desktop Tauri

```bash
npm run tauri dev
```

### 5. Lancer la suite de tests automatisés

```bash
npx vitest run
```

### 6. Compiler l'application pour la production

```bash
npm run build
npm run tauri build
```

---

## Licence

Ce projet est sous licence MIT. Consultez le fichier `LICENSE` pour plus d'informations.

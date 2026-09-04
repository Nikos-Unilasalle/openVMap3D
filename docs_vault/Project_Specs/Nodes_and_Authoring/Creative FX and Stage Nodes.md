# Creative FX and Stage Nodes

*Domaine : Shaders Procéduraux, Déformateurs Paramétriques, Chaos & Scénographie*

Ce document détaille l'architecture, les paramètres et les modèles mathématiques des nœuds créatifs ajoutés à Tsuji.

---

## 1. Modificateurs de Géométrie (`geometry/*`)

Tous les modificateurs géométriques de Tsuji intègrent désormais le contrat matriciel universel :
* **Préservation de la matrice d'objet** : Le maillage déformé hérite automatiquement de la pose complète (`matrixWorld` / `matrix`) de l'objet source (translation, rotation, échelle).
* **Prises d'entrée & sortie `matrix`** : Chaque nœud accepte une matrice câblée externe (`inputs.matrix`) et réémet la matrice résultante (`outputs.matrix`).
* **Gizmo Viewport** : Le maillage déformé est sélectionnable et manipulable directement dans le Viewport 3D.

### 1.1 `geometry/twist-bend-taper`
* **Objectif** : Déformer un maillage le long d'un axe local ($X, Y$ ou $Z$) de façon non-destructive en préservant son repère spatial.
* **Mathématiques** :
  * Soit $H = h_{\max} - h_{\min}$ la hauteur axiale du maillage et $\tilde{h} = \frac{h - h_{\min}}{H} \in [0, 1]$.
  * **Taper** : $S(\tilde{h}) = \max(0.001, 1.0 + \text{taper} \cdot \tilde{h})$. Les coordonnées transverses $(u, v)$ sont dilatées : $u' = u \cdot S, v' = v \cdot S$.
  * **Twist** : rotation d'angle $\theta = \theta_{\text{rad}} \cdot \tilde{h}$.
    $$u' = u \cos\theta - v \sin\theta, \quad v' = u \sin\theta + v \cos\theta$$
  * **Bend** : flexion le long d'un arc circulaire de rayon $R = \frac{H}{\beta_{\text{rad}}}$ :
    $$h' = h_{\min} + R \sin(\beta_{\text{rad}} \cdot \tilde{h}), \quad u' = u + R(1 - \cos(\beta_{\text{rad}} \cdot \tilde{h}))$$
* **Normales** : recalcul automatique via `computeVertexNormals()`.

### 1.2 `geometry/wave-ripple`
* **Objectif** : Générer des ondulations de surface dynamiques à 60 FPS avec prise en compte de la matrice locale ou monde.
* **Espaces d'évaluation (`space`)** :
  * **`local`** : L'onde est attachée à l'objet, mais prend en compte les facteurs d'échelle matriciels $(s_x, s_z)$ afin de préserver l'isotropie circulaire du ripple même sous mise à l'échelle non-uniforme.
  * **`world`** : L'onde est calculée en coordonnées absolues de la scène 3D ($P_{\text{world}} = M_{\text{object}} \cdot P_{\text{local}}$). L'objet ondule dynamiquement en fonction de sa traversée spatiale du champ d'ondes.
* **Modes** :
  * **Ripple (Concentrique)** : simule une onde de choc ou goutte d'eau avec centre déplaçable $(c_x, c_z)$ et amortissement exponentiel :
    $$\Delta y = A \cdot \sin(r \cdot \omega - t \cdot v) \cdot e^{-r \cdot \gamma}, \quad r = \sqrt{(x - c_x)^2 + (z - c_z)^2}$$
  * **Linear (Planaire)** : onde progressive $\Delta y = A \cdot \sin(x \cdot \omega - t \cdot v)$.

### 1.3 `geometry/facet-explode`
* **Objectif** : Disloquer les triangles le long de leurs normales de face respectives tout en maintenant la transformation globale de l'objet.
* **Principe** : Convertit le maillage en géométrie non-indexée (*triangle soup*), calcule le barycentre $C$ et la normale $\vec{N}$ de chaque triangle, applique une dispersion pseudo-aléatoire et contracte/dilate les sommets autour de $C$.

---

## 2. Particules & Chaos (`particles/*`)

### 2.1 `particles/curl-noise`
* **Objectif** : Produire un écoulement de fluide laminaire et turbulent sans compression.
* **Formulation** : Soit $\vec{\Psi}(x, y, z)$ un potentiel vectoriel de bruit Simplex tridimensionnel :
  $$\vec{F}_{\text{curl}} = \nabla \times \vec{\Psi} = \left(\frac{\partial \Psi_z}{\partial y} - \frac{\partial \Psi_y}{\partial z}, \, \frac{\partial \Psi_x}{\partial z} - \frac{\partial \Psi_z}{\partial x}, \, \frac{\partial \Psi_y}{\partial x} - \frac{\partial \Psi_x}{\partial y}\right)$$
  Par identité vectorielle, $\nabla \cdot (\nabla \times \vec{\Psi}) \equiv 0$, ce qui garantit une divergence strictement nulle (incompressibilité physique).
* **Intégration Tsuji** : Câblé sur les prises `Force Field` de `particles/simulate` et visualisé en 3D via le proxy Gizmo interactif du Viewport.

### 2.2 `particles/strange-attractor`
* **Objectif** : Générer des sculptures de trajectoires déterministes issues de la théorie du chaos avec intégrateur **Runge-Kutta 4 (RK4)** haute fidélité.
* **Systèmes intégrés (Presets)** :
  * **Lorenz (Effet Papillon)** : $\dot{x} = 10(y-x), \; \dot{y} = x(28-z)-y, \; \dot{z} = xy - \frac{8}{3}z$.
  * **Aizawa (Torus)** : $\dot{x} = (z - 0.7)x - 3.5y, \; \dot{y} = 3.5x + (z-0.7)y, \; \dot{z} = 0.6 + 0.95z - z^3/3 - (x^2+y^2)(1+0.25z) + 0.1z x^3$.
  * **Thomas (Labyrinthe cyclique)** : $\dot{x} = \sin(y) - bx, \; \dot{y} = \sin(z) - by, \; \dot{z} = \sin(x) - bz$ ($b = 0.208186$).
  * **Rössler (Spirale repliée)** : $\dot{x} = -y - z, \; \dot{y} = x + ay, \; \dot{z} = b + z(x - c)$ ($a = 0.2, b = 0.2, c = 5.7$).
  * **Halvorsen (Symétrie cyclique 3D)** : $\dot{x} = -ax - 4y - 4z - y^2, \; \dot{y} = -ay - 4z - 4x - z^2, \; \dot{z} = -az - 4x - 4y - x^2$ ($a = 1.89$).
  * **Chen (Double vortex)** : $\dot{x} = a(y - x), \; \dot{y} = (c - a)x - xz + cy, \; \dot{z} = xy - bz$ ($a = 35, b = 3, c = 28$).
  * **Chua (Double Scroll)** : Circuit non-linéaire avec fonction par morceaux $h(x)$.
  * **Sprott (Sprott B)** : Modèle polynomial minimaliste $\dot{x} = yz, \; \dot{y} = x - y, \; \dot{z} = 1 - xy$.
  * **Four-Wing (Quadruple lobe)** : $\dot{x} = ax + yz, \; \dot{y} = bx + cy - xz, \; \dot{z} = -z - xy$.
* **Mode Custom (Formule Utilisateur)** :
  * Permet d'écrire directement ses équations différentielles sous forme d'expressions mathématiques compilées JIT à 60 FPS :
    * `dx / dt` : ex. `a * (y - x)`
    * `dy / dt` : ex. `x * (b - z) - y`
    * `dz / dt` : ex. `x * y - c * z`
  * **Variables accessibles** : `x`, `y`, `z`, `t` (temps), `a`, `b`, `c` (paramètres numériques modulables ou câblables).
  * **Fonctions mathématiques autorisées** : `sin`, `cos`, `tan`, `abs`, `sqrt`, `exp`, `pow`, `min`, `max`, `sign`, et opérateur puissance `^` ou `**`.
* **Sortie** : Objet 3D (`geometry` Points ou Line) compatible Gizmo/Transform + liste de vecteurs (`points`) réinjectable dans `particles/emitter-from-points`.

---

## 3. Shaders FX Procéduraux (`material/*`)

Tous les shaders créatifs intègrent des uniformes de contrôle fin (sockets modulables dans le graphe et curseurs/toggles dans le panneau inspecteur `ParamPanel`) :

| Nœud | Modèle Visuel & Mathématique | Paramètres Clés & Nouveaux Toggles |
| :--- | :--- | :--- |
| **`material/hologram`** | Émission néon + scanlines 3D monde + glitchs slicés | `color`, `rimColor`, `scanlinesFrequency`, `scanlinesSpeed`, `fresnelPower`, `glitchStrength`, `glitchFrequency`, `flickerIntensity`, `stripeSharpness`, `noiseIntensity`, `opacity`. **Toggles** : `enableScanlines`, `enableGlitch`, `enableNoise`, `enableFlicker`. |
| **`material/liquid-metal`** | Domain warping 3D FBM + réflexion chrome d'environnement | `baseColor`, `reflectionColor`, `specularColor`, `warpScale`, `warpIntensity`, `speed`, `viscosity`, `roughness`, `metalness`, `iridescence`, `fresnelPower`. **Toggle** : `enableDisplacement`. |
| **`material/cel-shade`** | Quantification discrète en bandes + trame demi-teinte comics | `color`, `shadowColor`, `halftoneDotColor`, `bands`, `bandSoftness`, `halftoneScale`, `rimColor`, `rimPower`, `specularHardness`, `specularStrength`. **Toggles** : `enableHalftone`, `enableRim`, `enableSpecular`. |
| **`material/iridescent`** | Interférence en couches minces (*thin-film*) optique exacte | `baseColor`, `specularColor`, `filmThickness` (nm), `refractiveIndex`, `boost`, `roughness`, `rippleSpeed`, `rippleFrequency`, `rainbowMix`. |
| **`material/wireframe-pulse`** | Arêtes vectorielles dérivées + onde de choc travelling | `fillColor`, `fillOpacity`, `edgeColor`, `edgeWidth`, `pulseColor`, `pulseSpeed`, `pulseLength`, `pulseFrequency`, `glowIntensity`. **Toggles** : `enableFill`, `enablePulse`. |
| **`material/thermal`** | Caméra FLIR infrarouge + gradient spectral d'incandescence | `coldColor`, `hotColor`, `heatScale`, `minTemp`, `maxTemp`, `distortion`, `shimmerSpeed`, `invert` (White/Black Hot). **Toggle** : `enableDistortion`. |
| **`material/xray`** | Inversion de densité radiologique + transparence tangentielle | `color`, `coreColor`, `edgeIntensity`, `interiorOpacity`, `rimPower`, `noiseIntensity`. **Toggle** : `enableGrain`. |
| **`material/energy-shield`** | Pavage hexagonal dynamique + onde sphérique d'impact | `shieldColor`, `gridColor`, `hexScale`, `edgeSharpness`, `fresnelPower`, `pulseSpeed`, `pulseIntensity`. **Toggles** : `enableGrid`, `enablePulse`. |
| **`material/stylized_fire`** | Flamme cartoon SDF + soustraction booléenne douce ($k$) | `smoothness` ($k$), `colorSoftness`, `flameWidth`, `flameHeight`, `baseCurvature`, `waveSpeed`, `waveFrequency`, `waveAmplitude`, `bubbleSpeed`, `bubbleScale`, `internalHoles`, `coreSize`, `coreOffsetY`, `coreBaseMask`, `outlineWidth`, palettes (`coreColor`, `innerColor`, `bodyColor`, `darkColor`, `outlineColor`). **Toggles** : `enableCore`, `enableInner`, `enableDark`, `enableOutline`. |
| **`material/miyazaki_cloud`** | Cumulus Ghibli SDF + festonnage Voronoi + éclairage solaire 3D | `seed`, `cumulusHeight`, `cloudWidth`, `baseFlatness`, `puffiness`, `detail`, `sunAngle`, `sunElevation`, `shadowIntensity`, `bandSoftness`, `edgeSharpness`, `outlineWidth`, palettes (`highlightColor`, `bodyColor`, `shadowColor`, `deepShadowColor`, `outlineColor`). **Toggles** : `enableHighlight`, `enableDeepShadow`, `enablePuffs`, `enableOutline`. |

### 3.9 `material/stylized_fire` (Flamme Stylisée Ivan Boyko)
* **Objectif** : Générer une animation de flamme 2D en temps réel à 60 FPS sans textures pré-calculées, avec comportement élastique des détachements de matière.
* **Modèle Mathématique** :
  1. **Silhouette porteuse en goutte** :
     $$d_{\text{body}} = \sqrt{p_x^2 + (p_y \cdot 0.85 + 0.15)^2} - \text{flameWidth} \cdot (1.0 - 0.75 \cdot p_y)$$
  2. **Harmoniques ondulatoires en S** :
     $$\Delta x = \sin(p_y \cdot \omega_{\text{wave}} - t \cdot v_{\text{wave}}) \cdot A_{\text{wave}} \cdot \max(0, p_y + 0.4) + \sin(p_y \cdot 2.2 \omega_{\text{wave}} - t \cdot 1.4 v_{\text{wave}}) \cdot 0.35 A_{\text{wave}}$$
  3. **Opérateur de soustraction booléenne douce ($\text{opSmoothSubtraction}$)** :
     $$h = \text{clamp}\left(0.5 - 0.5 \cdot \frac{d_2 + d_1}{k}, \, 0.0, \, 1.0\right)$$
     $$d_{\text{sub}} = \text{mix}(d_2, -d_1, h) + k \cdot h \cdot (1.0 - h)$$
     où $k$ (`smoothness`) contrôle la viscosité et la courbure des ponts de matière lors de l'expulsion des flammèches.
  4. **Perforations internes & cavités latérales** :
     - Évidement d'aspiration d'air froid à la base ($p_y < -0.3$).
     - Bulles négatives latérales remontant le long du bord gauche et droit.
     - Bulle négative centrale créant la perforation caractéristique de la flamme.
  5. **Ancrage & Masquage du Cœur Blanc** :
     - `coreOffsetY` permet de descendre le cœur incandescent au point d'émission.
     - `coreBaseMask` creuse la sous-face du cœur blanc pour l'ancrer naturellement au-dessus de l'arche d'air froid.
  6. **Contour Vectoriel Anti-aliasé** :
     Calcul de l'épaisseur du trait d'encrage avec les dérivées d'écran matérielles `fwidth(d)` pour une netteté vectorielle parfaite sans crénelage.

### 3.10 `material/miyazaki_cloud` (Nuage Cumulus Studio Ghibli)
* **Objectif** : Créer des nuages estivaux massifs (*nyuudougumo*) fidèles aux toiles de fond de Kazuo Oga et Hayao Miyazaki, sur fond transparent pour intégration directe dans n'importe quel décor 3D.
* **Modèle Mathématique** :
  1. **Macro-SDF hiérarchique (12 Dômes)** :
     Empilement étagé de 12 sphères d'ancrage (base large, tour centrale montante, couronne sommitale) combinées par minimum lissé polynomial `smin(a, b, k)` avec décalages pseudo-aléatoires déterminés par `seed`.
  2. **Méplat de condensation (`baseFlatness`)** :
     Découpe horizontale de la sous-face du nuage par demi-plan lissé avec micro-ondulations atmosphériques :
     $$d_{\text{base}} = \text{smax}(d, \, -(p_y - y_{\text{base}} + \sin(5.5 p_x) \cdot 0.025), \, k_{\text{cut}})$$
  3. **Festonnage par Voronoi Cellulaire Inversé** :
     Bruit cellulaire branchless à 2 échelles ($f_1 = 3.8, f_2 = 8.2$) converti en boursouflures convexes :
     $$d \leftarrow d - \left[(1.0 - w_1) \cdot 0.08 + (1.0 - w_2) \cdot 0.035\right] \cdot \text{detail}$$
  4. **Normales Pseudo-3D & Éclairage Solaire** :
     Reconstruction de la normale $\vec{N}$ via les différences finies du champ de hauteur $h(p)$ :
     $$\vec{N} = \text{normalize}\left(-\frac{\partial h}{\partial x} \cdot \text{puffiness}, \, -\frac{\partial h}{\partial y} \cdot \text{puffiness}, \, 0.70\right)$$
     Éclairage solaire orientable $\vec{L} = (\cos\theta_{\text{sun}}, \sin\theta_{\text{sun}}, \text{elev}_{\text{sun}})$ avec calcul d'occlusion ambiante dans les sillons inter-lobes.
  5. **Palette Aquarelle Ghibli 4 Tons** :
     Zones de transition adoucies (`bandSoftness`) :
     - `highlightColor` : Crête solaire chaude et rehausse de bordure (*sunlit rim*).
     - `bodyColor` : Volume principal éclairé ivoire.
     - `shadowColor` : Ombre diffuse céladon / lavande grisée.
     - `deepShadowColor` : Crevasses et sous-faces d'ardoise.
  6. **Découpe Alpha Nette** :
     Silhouette découpée par `smoothstep(-aa, aa, d)` avec `discard` hors du nuage (`transparent: true`), garantissant une transparence totale du ciel.

---

## 4. Scénographie & Lasers (`object/laser-beam`)

* **Architecture du Projecteur** :
  * Embase fixe cylindrique avec matériaux PBR métalliques.
  * Tête motorisée suspendue avec rotations locales indépendantes : **Pan** ($\theta_Y$) et **Tilt** ($\theta_X$).
  * Faisceau cylindrique volumétrique calculé dynamiquement selon la longueur `length` et la divergence conique `coneAngle`.
  * Point d'impact lumineux (`hitMesh`) synchronisé avec le vecteur de visée.
* **Fonctionnalités Scéniques** :
  * Clignotement stroboscopique / pulsation BPM via `pulseFrequency`.
  * Calcul en temps réel du vecteur unitaire de tir (`direction`) et des coordonnées monde du point d'impact (`hitPosition`).
  * Support complet du Gizmo de déplacement/rotation et protection contre les conflits de frames (`liveEditNodeId`).

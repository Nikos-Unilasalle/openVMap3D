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

| Nœud | Modèle Visuel | Paramètres Clés |
| :--- | :--- | :--- |
| **`material/hologram`** | Émission néon + scanlines 3D monde + glitchs slicés | `color`, `scanlinesFrequency`, `scanlinesSpeed`, `fresnelPower`, `glitchStrength`, `flickerIntensity`, `stripeSharpness`, `noiseIntensity`, `opacity`. |
| **`material/liquid-metal`** | Domain warping 3D FBM + réflexion chrome d'environnement | `baseColor`, `reflectionColor`, `warpScale`, `warpIntensity`, `speed`, `viscosity`, `roughness`, `metalness`, `iridescence`. |
| **`material/cel-shade`** | Quantification discrète en bandes + trame demi-teinte comics | `color`, `shadowColor`, `bands`, `halftone`, `halftoneScale`, `rimColor`, `rimPower`, `specularHardness`, `specularStrength`. |
| **`material/iridescent`** | Interférence en couches minces (*thin-film*) optique exacte | `baseColor`, `filmThickness` (nm), `refractiveIndex`, `boost`, `roughness`. |
| **`material/wireframe-pulse`** | Arêtes vectorielles dérivées + onde de choc travelling | `fillColor`, `fillOpacity`, `edgeColor`, `edgeWidth`, `pulseColor`, `pulseSpeed`, `pulseLength`. |
| **`material/thermal`** | Caméra FLIR infrarouge + gradient spectral d'incandescence | `heatScale`, `minTemp`, `maxTemp`, `distortion`, `invert` (White/Black Hot). |
| **`material/xray`** | Inversion de densité radiologique + transparence tangentielle | `color`, `edgeIntensity`, `interiorOpacity`, `rimPower`. |
| **`material/energy-shield`** | Pavage hexagonal dynamique + onde sphérique d'impact | `shieldColor`, `gridColor`, `hexScale`, `pulseSpeed`, `pulseIntensity`. |

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

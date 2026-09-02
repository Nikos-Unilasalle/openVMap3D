# Creative WebGL Shaders and Distortion Techniques

*Domaine : Shaders GLSL, Distorsions d'Images, Effets Visuels Créatifs & Transitions Temps Réel*

Ce document synthétise les techniques de shaders GLSL et de manipulation de pixels issues des expérimentations Three.js les plus marquantes (notamment issues du catalogue FreeFrontend Three.js), adaptées aux exigences de performance et d'interactivité du moteur nodal **Tsuji**.

---

## 1. Familles de Distorsions & Traitements d'Images

Dans les installations de vidéo-mapping, de scénographie numérique et d'interfaces immersives, la déformation dynamique de textures et de maillages constitue un levier visuel majeur :

```
[Texture Source A] ──┐
                     ├──▶ [Vertex / Fragment Shader de Distorsion] ──▶ [Rendu Déformé]
[Texture Source B] ──┤         ▲                 ▲
                     │   [Champ de Bruit]   [Trigger / Onde]
[Masque de Transition]
```

---

## 2. Déformation par Onde Sinusoïdale & Aberration Chromatique

### 2.1 Formulation Mathématique

La séparation chromatique simule la dispersion de la lumière à travers une lentille imparfaite en décalant les coordonnées UV d'échantillonnage pour chaque canal couleur $R, G, B$ selon un vecteur de déplacement $\vec{D}(u, v)$ modulé par le rayon $r = \|\vec{uv} - 0.5\|$ ou une onde de phase $\phi$ :

$$\vec{uv}_R = \vec{uv} + \vec{D}(u, v) \cdot (1.0 + \delta)$$
$$\vec{uv}_G = \vec{uv} + \vec{D}(u, v)$$
$$\vec{uv}_B = \vec{uv} + \vec{D}(u, v) \cdot (1.0 - \delta)$$

où $\delta$ représente le facteur de dispersion chromatique (ex: $0.015$).

### 2.2 Fragment Shader GLSL Optimisé (Branchless)

```glsl
uniform sampler2D uTexture;
uniform float uTime;
uniform float uDistortionStrength;
uniform float uChromaticOffset;
varying vec2 vUv;

void main() {
    vec2 center = vec2(0.5);
    vec2 dir = vUv - center;
    float dist = length(dir);
    
    // Onde sinusoïdale radiale progressive
    float wave = sin(dist * 20.0 - uTime * 3.0) * uDistortionStrength;
    vec2 distortedUv = vUv + normalize(dir) * wave;
    
    // Échantillonnage décorrélé RGB
    float r = texture2D(uTexture, distortedUv + dir * uChromaticOffset).r;
    float g = texture2D(uTexture, distortedUv).g;
    float b = texture2D(uTexture, distortedUv - dir * uChromaticOffset).b;
    float a = texture2D(uTexture, distortedUv).a;
    
    gl_FragColor = vec4(r, g, b, a);
}
```

---

## 3. Morphologie Liquide et Déplacement par Bruit Simplex / Voronoi

### 3.1 Bruit Simplex 3D (`snoise3`) pour Déformations Organiques

Le morphing fluide entre deux textures ou géométries exploite un champ de bruit spatial $3\text{D}$ continu :

$$\text{offset} = \text{snoise}(\vec{p} \cdot f + t) \cdot A$$

En utilisant la valeur du bruit comme seuil de transition lissé via `smoothstep()`, on obtient une frontière de transition vivante et organique sans artefacts de coupure :

```glsl
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uProgress; // 0.0 -> 1.0
uniform float uNoiseScale;
varying vec2 vUv;

float snoise(vec2 v);

void main() {
    vec2 uv = vUv;
    float noise = snoise(uv * uNoiseScale);
    
    // Déplacement dynamique des UVs proportionnel à la vitesse de transition
    float transitionMask = smoothstep(0.0, 1.0, (uProgress - 0.5) * 2.0 + noise * 0.4);
    
    vec2 uvA = uv + vec2(noise * (1.0 - uProgress) * 0.1);
    vec2 uvB = uv - vec2(noise * uProgress * 0.1);
    
    vec4 colA = texture2D(uTexA, uvA);
    vec4 colB = texture2D(uTexB, uvB);
    
    gl_FragColor = mix(colA, colB, transitionMask);
}
```

### 3.2 Cellules de Voronoi pour Transitions Cristallines et Particulaires

Les diagrammes de Voronoi fragmentent l'espace en cellules de Delaunay. En appliquant une impulsion d'accélération particulaire par cellule, l'image explose en facettes géométriques avant de se reformer en nouvelle image.

---

## 4. Onde de Choc (Shockwave / Ripple Pass)

### 4.1 Modèle d'Impulsion Analytique

Une onde de choc créée par un événement (clic, impact audio FFT, pulsation) se propage de manière circulaire avec une onde de réfraction :

$$w(r, t) = \sin\left(\frac{r - v \cdot t}{\lambda} \cdot \pi\right) \cdot e^{-\alpha (r - v \cdot t)^2} \cdot e^{-\beta t}$$

où :
- $v$ est la vitesse de propagation.
- $\lambda$ est la longueur d'onde de l'impulsion.
- $\alpha$ est la finesse de l'anneau.
- $\beta$ est l'amortissement temporel exponentiel.

```glsl
uniform sampler2D tDiffuse;
uniform vec2 uCenter;       // Centre de l'onde [0,1]
uniform float uTime;        // Temps écoulé depuis le trigger
uniform float uWaveSpeed;   // Vitesse de propagation
uniform float uWaveWidth;   // Épaisseur de l'anneau
uniform float uMaxRadius;   // Rayon maximal avant extinction
uniform float uAmplitude;   // Force de réfraction
varying vec2 vUv;

void main() {
    vec2 texCoord = vUv;
    float dist = distance(texCoord, uCenter);
    float currentRadius = uTime * uWaveSpeed;
    
    if (dist <= currentRadius + uWaveWidth && dist >= currentRadius - uWaveWidth) {
        float diff = (dist - currentRadius);
        float powDiff = 1.0 - pow(abs(diff * (1.0 / uWaveWidth)), 0.8);
        float diffTime = diff * powDiff;
        vec2 diffUV = normalize(texCoord - uCenter);
        texCoord += (diffUV * diffTime) * (uAmplitude * exp(-uTime * 2.5));
    }
    
    gl_FragColor = texture2D(tDiffuse, texCoord);
}
```

---

## 5. Metaballs en Shader Écran (Screen-Space SDF)

Les métaballes fluides (gouttes de mercure, cellules organiques) sont rendues sans géométrie polygonale lourde via une fonction de distance signée (SDF) évaluée par pixel :

$$F(x, y) = \sum_{i=1}^{N} \frac{R_i^2}{(x - x_i)^2 + (y - y_i)^2}$$

En appliquant un seuil $F(x, y) \ge T$ avec un seuillage anti-aliasé `smoothstep()`, on obtient une fusion fluide parfaite à 60 FPS sur GPU même pour des dizaines de sphères en interaction.

---

## 6. Halo Lumineux sans Bloom (Glow Effect Without Post-Processing)

Dans les scènes de vidéo-mapping où la bande passante GPU est critique (multi-sorties $4\text{K}$), la chaîne `UnrealBloomPass` (multiples downsamplings pyramidaux) peut être évitée grâce à des techniques d'ombrage direct :

1. **Inverted Hull Fresnel** : Une coque de géométrie dupliquée avec normales inversées et matériau émissif additif transparent dont l'opacité est pondérée par $(1 - \vec{N} \cdot \vec{V})^p$.
2. **Sprite Billboarding Multi-Couches** : Particules billboard à texture de gradient gaussien pré-calculée en mode `THREE.AdditiveBlending`.

---

## 7. Shaders FX Avancés du Moteur Tsuji

Les shaders procéduraux de Tsuji reposent sur des principes physiques et artistiques branchless optimisés pour WebGL2 :

### 7.1 Métal Liquide par Domain Warping FBM
Le déplacement de surface imbrique plusieurs couches d'échantillonnage de bruit Simplex :
$$p' = p + \vec{\alpha} \cdot \text{FBM}(p \cdot s_1 + t \cdot v_1)$$
$$p'' = p' + \vec{\beta} \cdot \text{FBM}(p' \cdot s_2 - t \cdot v_2)$$
La normale de surface et la position des sommets sont perturbées simultanément, créant une tension superficielle de mercure en fusion sans simulation hydrodynamique lourde.

### 7.2 Interférence Optique en Couches Minces (Thin-Film Iridescence)
Le déphasage lumineux $\Delta \phi$ dépend de l'épaisseur nanométrique $d$, de l'indice de réfraction $\eta$ et de l'angle d'incidence $\theta_i$ :
$$\text{OPD} = 2 \eta d \cos(\theta_t)$$
Les franges spectrales arc-en-ciel sont calculées par déphasage direct sur chaque composante RVB avec $\lambda_R = 650\text{ nm}, \lambda_G = 510\text{ nm}, \lambda_B = 440\text{ nm}$ :
$$I_c = \cos\left(\frac{2\pi \cdot \text{OPD}}{\lambda_c}\right) \cdot 0.5 + 0.5$$

### 7.3 Caméra Thermique & Infrarouge (FLIR / White Hot)
L'émissivité thermique est projetée sur une rampe de température continue (Noir $\rightarrow$ Violet $\rightarrow$ Rouge $\rightarrow$ Jaune $\rightarrow$ Blanc incandescence), avec possibilité d'inversion instantanée (polarité militaire White Hot / Black Hot).

---

## 🔗 Notes Associées
- [[Creative FX and Stage Nodes]]
- [[Node Catalog]]
- [[Post-Processing Uber-Shader Passes]]
- [[GPGPU Simulation and Particle Dynamics]]
- [[Audio Reactive Signal Processing]]


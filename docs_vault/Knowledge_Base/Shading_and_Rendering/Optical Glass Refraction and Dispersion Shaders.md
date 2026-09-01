# Optical Glass Refraction and Dispersion Shaders

*Domaine : Optique Physique, Transmission, Dispersion Chromatique & Matériaux Diélectriques*

Ce document formalise les techniques de rendu de verre, lentilles optiques et réfraction chromatique temps réel sous Three.js, inspirées des meilleures démos interactives (*3D Glass Photo Lens*, *Text Refraction*) et adaptées aux matériaux PBR et passes de rendu de **Tsuji**.

---

## 1. Principes Physiques : Lois de Snell-Descartes et Dispersion de Cauchy

### 1.1 Loi de Snell-Descartes de la Réfraction

Lorsqu'un rayon lumineux traverse l'interface entre l'air ($n_1 \approx 1.0003$) et un milieu diélectrique dense ($n_2 \approx 1.52$ pour le verre borosilicate) :

$$n_1 \sin(\theta_1) = n_2 \sin(\theta_2)$$

Le vecteur de réfraction $\vec{T}$ est calculé à partir du vecteur incident $\vec{I}$ et de la normale de surface $\vec{N}$ par :

$$\vec{T} = \eta \vec{I} + \left(\eta \cos(\theta_1) - \sqrt{1 - \eta^2 (1 - \cos^2(\theta_1))}\right) \vec{N}$$

avec $\eta = \frac{n_1}{n_2}$.

### 1.2 Équation de Dispersion de Cauchy

L'indice de réfraction $n(\lambda)$ varie en fonction de la longueur d'onde $\lambda$, provoquant la décomposition chromatique (effets prismatiques arc-en-ciel sur les chanfreins) :

$$n(\lambda) = A + \frac{B}{\lambda^2}$$

Pour le calcul temps réel sur GPU, on échantillonne 3 indices distincts :
- $n_R \approx 1.50$ (Rouge, $\lambda \approx 650\text{ nm}$)
- $n_G \approx 1.52$ (Vert, $\lambda \approx 530\text{ nm}$)
- $n_B \approx 1.55$ (Bleu, $\lambda \approx 450\text{ nm}$)

---

## 2. Architecture de Rendu Multi-Passes (FBO Back-Buffer)

Pour réfracter la scène 3D ou les couches de vidéo-mapping situées derrière l'objet en verre :

```
[Scène d'Arrière-Plan] ──▶ [FBO Render Target (Texture Arrière)]
                                   │
                                   ▼
[Objet Lentille/Verre] ──▶ [Custom ShaderMaterial / MeshPhysicalMaterial] ──▶ [Écran Final]
                                   ▲
                             [Carte Normale]
```

### 2.1 Capture de la Texture d'Arrière-Plan
1. L'objet réfractant est rendu invisible (`lensMesh.visible = false`).
2. La caméra effectue un rendu de la scène dans une `THREE.WebGLRenderTarget` dédiée.
3. L'objet est rendu visible (`lensMesh.visible = true`).
4. Le shader de la lentille projette les coordonnées écran (`gl_FragCoord.xy / uResolution`) et applique un décalage proportionnel à la normale de surface et à l'épaisseur de l'objet.

---

## 3. Shader GLSL de Transmission & Dispersion Chromatique

```glsl
uniform sampler2D uSceneTexture;
uniform vec2 uResolution;
uniform float uIor;             // Indice de réfraction de base (ex: 1.52)
uniform float uDispersion;      // Amplitude de dispersion chromatique (ex: 0.04)
uniform float uRoughness;       // Flou interne (diffusion)
uniform float uThickness;       // Épaisseur optique du bloc
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);
    
    // Décalage vectoriel projeté sur l'écran
    vec2 refractOffset = normal.xy * (1.0 / uIor - 1.0) * uThickness;
    
    // Échantillonnage avec dispersion chromatique séparée
    vec2 uvR = screenUv + refractOffset * (1.0 + uDispersion);
    vec2 uvG = screenUv + refractOffset;
    vec2 uvB = screenUv + refractOffset * (1.0 - uDispersion);
    
    float r = texture2D(uSceneTexture, uvR).r;
    float g = texture2D(uSceneTexture, uvG).g;
    float b = texture2D(uSceneTexture, uvB).b;
    
    // Réflexion spéculaire de Fresnel
    float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 4.0);
    vec3 glassColor = vec3(r, g, b);
    vec3 finalColor = mix(glassColor, vec3(1.0), fresnel * 0.4);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
```

---

## 4. Intégration dans le Graphe de Nœuds Tsuji

- Nouveau nœud de matériau : `material/glass_refraction` avec entrées :
  - `ior` (Float : 1.0 -> 2.5)
  - `dispersion` (Float : 0.0 -> 0.1)
  - `thickness` (Float : 0.0 -> 10.0)
  - `normalMap` (Texture)
  - `roughness` (Float)
- Ce nœud permet d'insérer des loupes anamorphiques, des prismes de vidéo-mapping et des lentilles de réfraction dynamique directement dans le pipeline de composition de Tsuji.

---

## 🔗 Notes Associées
- [[PBR Shading and Material Models]]
- [[Cook-Torrance BRDF and Metallic-Roughness Model]]
- [[ShaderFX Nodes and Transition Pipeline]]

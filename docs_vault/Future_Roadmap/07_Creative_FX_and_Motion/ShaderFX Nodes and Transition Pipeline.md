# ShaderFX Nodes and Transition Pipeline

*Pôle Roadmap : 07 - Creative FX & Dynamic Transitions*

Ce document spécifie l'architecture technique des nœuds de distorsion créative, de simulation optique et de transition d'images pour le moteur **Tsuji**.

---

## 1. Spécifications des Nœuds ShaderFX

### 1.1 `postprocess/shockwave`
- **Description** : Génère une onde de choc réactive (déformation circulaire d'UVs) à partir d'un point d'impact.
- **Sockets d'Entrée** :
  - `trigger` (`value` : front montant 0 -> 1)
  - `center` (`vector` : coordonnées normalisées [X, Y])
  - `speed` (`value` : vitesse de propagation, défaut 1.5)
  - `width` (`value` : épaisseur de l'onde, défaut 0.1)
  - `amplitude` (`value` : force de distorsion, défaut 0.05)
  - `decay` (`value` : amortissement exponentiel, défaut 2.0)
- **Sockets de Sortie** :
  - `geometry` (`geometry` : passe post-process chaînable)

### 1.2 `postprocess/liquid_displacement`
- **Description** : Applique un morphing et une distorsion fluide entre textures ou sur l'écran global.
- **Sockets d'Entrée** :
  - `textureA` (`texture`)
  - `textureB` (`texture`)
  - `progress` (`value` : 0.0 à 1.0)
  - `noiseScale` (`value` : fréquence du bruit Simplex)
  - `turbulence` (`value` : intensité de distorsion)
- **Sockets de Sortie** :
  - `texture` (`texture` : texture mélangée résultante)

### 1.3 `material/glass_refraction`
- **Description** : Matériau diélectrique avancé simulant verre, cristal, loupe et blocs optiques avec dispersion de Cauchy.
- **Sockets d'Entrée** :
  - `ior` (`value` : 1.0 à 2.5, défaut 1.52)
  - `dispersion` (`value` : aberration chromatique 0.0 à 0.1, défaut 0.03)
  - `thickness` (`value` : épaisseur perçue, défaut 1.0)
  - `roughness` (`value` : dépoli / flou interne, défaut 0.0)
  - `tintColor` (`color` : teinte du verre)
- **Sockets de Sortie** :
  - `geometry` (`geometry` : matériau prêt à l'application)

---

## 2. Pipeline d'Exécution & Gestion des Buffers

Pour préserver le budget de $16.6\text{ ms}$ (60 FPS) :
1. **Passes Fusionnées** : Toutes les distorsions 2D sont fusionnées dans un Uber-Shader de composition.
2. **Buffer Pooling** : Réutilisation des `WebGLRenderTarget` pour la capture d'arrière-plan sans réallocation dynamique.

---

## 🔗 Notes Associées
- [[Creative WebGL Shaders and Distortion Techniques]]
- [[Optical Glass Refraction and Dispersion Shaders]]
- [[RenderTarget and Buffer Pooling System]]

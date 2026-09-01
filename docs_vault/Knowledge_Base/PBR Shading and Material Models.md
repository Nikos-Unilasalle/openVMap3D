# PBR Shading and Material Models

*Domaine : Modèles d'Éclairage Physique, BRDF & Matériaux Réalistes*

Ce document synthétise les principes du rendu fondé sur la physique (PBR - *Physically Based Rendering*) et les modèles de matériaux standardisés.

---

## 1. La BRDF de Cook-Torrance

Le comportement optique des surfaces est modélisé par la fonction de distribution de réflectance bidirectionnelle (BRDF) :
$$f(\mathbf{l}, \mathbf{v}) = k_d f_{\text{Lambert}} + k_s \frac{D(\mathbf{h}) F(\mathbf{v}, \mathbf{h}) G(\mathbf{l}, \mathbf{v}, \mathbf{h})}{4 (\mathbf{n} \cdot \mathbf{l}) (\mathbf{n} \cdot \mathbf{v})}$$

- **$D$ (Distribution des microfacettes - GGX)** : Probabilité statistique que les microfacettes soient orientées selon le vecteur médian $\mathbf{h}$.
- **$F$ (Équation de Fresnel - Schlick)** : Fraction de lumière réfléchie spéculairement en fonction de l'angle d'incidence.
- **$G$ (Fonction Géométrique d'Ombrage - Smith)** : Atténuation due à l'auto-masquage et l'auto-ombrage des microfacettes.

---

## 2. Le Modèle Métallique-Rugosité (*Metallic-Roughness*)

Le workflow moderne PBR repose sur des paramètres physiques intuitifs :
1. **Couleur de Base (*Albedo*)** : Réflectance diffuse pour les diélectriques (non-métaux) ou couleur spéculaire $F_0$ pour les conducteurs (métaux).
2. **Rugosité (*Roughness*)** : Variance angulaire des microfacettes (0 = miroir parfait, 1 = surface totalement diffuse).
3. **Métallicité (*Metalness*)** : Interrupteur diélectrique (0) vs conducteur pur (1).
4. **Transmission & Réfraction** : Modélisation des milieux transparents (verre, liquides) avec indice de réfraction ($IOR$) et atténuation volumique.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Parametric Geometry and Modifiers]]

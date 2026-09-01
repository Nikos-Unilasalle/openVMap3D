# Modèle PBR : BRDF de Cook-Torrance & Paramètres Métallique-Rugosité

*Domaine : Rendu Physique Réaliste (PBR) & Équations Optiques*

---

## 1. La Formulation de Cook-Torrance
La fraction de lumière réfléchie spéculairement et diffusément par une surface est formulée par :
$$f(\mathbf{l}, \mathbf{v}) = k_d \frac{c}{\pi} + k_s \frac{D(\mathbf{h}) F(\mathbf{v}, \mathbf{h}) G(\mathbf{l}, \mathbf{v}, \mathbf{h})}{4 (\mathbf{n} \cdot \mathbf{l}) (\mathbf{n} \cdot \mathbf{v})}$$

- **$D$ (Distribution GGX / Trowbridge-Reitz)** : Orientation statistique des microfacettes.
- **$F$ (Fresnel-Schlick)** : Variation de la réflectance selon l'angle d'incidence de la vue.
- **$G$ (Smith Geometrical Shadowing)** : Masquage mutuel des aspérités de la surface.

---

## 2. Paramètres Physiques Principaux
1. **Albedo / BaseColor** : Réflectance diffuse ou couleur spéculaire des métaux.
2. **Roughness (Rugosité)** : Étendue de diffusion du lobe spéculaire ($0 = \text{miroir}$, $1 = \text{craie}$).
3. **Metalness (Métallicité)** : Transition entre matériau diélectrique ($0$) et conducteur pur ($1$).

---

## 🔗 Notes Associées
- [[GLSL Branchless Programming and Optimization]]
- [[WebGPU Architecture and TSL Shaders]]

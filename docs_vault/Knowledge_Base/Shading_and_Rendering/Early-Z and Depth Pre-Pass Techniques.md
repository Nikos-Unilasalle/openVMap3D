# Techniques d'Early-Z & Depth Pre-Pass

*Domaine : Optimisation Rasterizer & Élimination de l'Overdraw*

---

## 1. Principe du Depth Pre-Pass
Dans une scène 3D dense comportant des shaders fragment coûteux (PBR, réfraction, bruit procédural), l'exécution du fragment shader sur des pixels qui seront ensuite recouverts par d'autres objets (*overdraw*) gaspille massivement la puissance de calcul GPU.

### Le Pipeline en 2 Passes :
1. **Passe 1 (Z-Prepass)** :
   - Rendu de la scène avec un shader de profondeur basique (`MeshDepthMaterial`).
   - `colorWrite = false`, `depthWrite = true`.
   - Remplit le tampon de profondeur (*Z-Buffer*) au coût géométrique minimal.
2. **Passe 2 (Passe Principale)** :
   - Rendu avec les matériaux et éclairages complets.
   - `depthFunc = THREE.EqualDepth` (ou `LEQUAL`), `depthWrite = false`.
   - **Gain** : Le GPU teste la profondeur matériellement (*Early-Z*) avant d'exécuter le fragment shader. Tous les pixels cachés sont ignorés sans calcul de lumière.

---

## 🔗 Notes Associées
- [[Overdraw Reduction and Pixel Ratio Capping]]
- [[GLSL Branchless Programming and Optimization]]
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]

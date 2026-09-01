# GPGPU Simulation and Particle Dynamics

*Domaine : Calcul Parallèle sur GPU, Systèmes de Particules & Shaders de Simulation*

Ce document détaille les architectures de calcul intensif sur processeur graphique (GPGPU) appliquées à l'animation de très grands volumes de particules et à la simulation de fluides.

---

## 1. Limitation des Tableaux CPU vs Architecture GPU

Dans une simulation sur CPU, animer $100\,000$ particules nécessite une boucle séquentielle mettant à jour la position et la vitesse de chaque élément en mémoire JavaScript :
- Goulot d'étranglement : Synchronisation du cache CPU et bande passante de transfert des buffers vers le GPU ($\mathcal{O}(N)$ transferts par frame).

---

## 2. Le Modèle Ping-Pong par Textures Flottantes

L'approche classique GPGPU encode l'état des particules dans des textures 2D à virgule flottante (`RGBAFloatType` ou `HalfFloatType`) :
- **Texture Position** : canaux $(R, G, B, A) = (x, y, z, \text{âge})$.
- **Texture Vitesse** : canaux $(R, G, B, A) = (v_x, v_y, v_z, \text{durée de vie})$.

```
[Texture Vitesse (Lecture)]  ──▶ [Fragment Shader de Simulation] ──▶ [Texture Vitesse (Écriture)]
                                              ▲
[Texture Position (Lecture)] ──▶ [Champs de Force / Bruit Curl]   ──▶ [Texture Position (Écriture)]
```

### Double Tamponnage (Ping-Pong) :
À chaque pas de temps $\Delta t$ :
1. Le shader lit la texture d'état précédente $T_{\text{read}}$.
2. Il applique l'intégration numérique d'Euler ou de Verlet et écrit dans $T_{\text{write}}$.
3. À la frame suivante, $T_{\text{read}}$ et $T_{\text{write}}$ sont inversés.

---

## 3. Rendu par Instances (`InstancedMesh`) ou Points

Le shader de vertex du matériau de rendu des particules utilise une texture lookup (`texelFetch` ou `texture2D`) pour lire la position calculée directement depuis la texture de simulation, éliminant tout transfert de géométrie depuis le CPU.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Parametric Geometry and Modifiers]]

# Simulation GPGPU par Textures Flottantes en Ping-Pong

*Domaine : Calcul Parallèle & Simulation de Particules sur GPU*

---

## 1. Principe du Ping-Pong Buffer
Pour simuler $N$ particules sur GPU avec WebGL 2.0 :
- Les positions $(x, y, z, \text{âge})$ et vitesses $(v_x, v_y, v_z, \text{vie})$ sont stockées dans deux textures 2D flottantes (`RGBAFloatType`).
- À chaque pas $\Delta t$, le fragment shader lit la texture d'état à l'étape $k$ et écrit la nouvelle position à l'étape $k+1$ dans un framebuffer cible.
- Les rôles de lecture et d'écriture sont inversés à la trame suivante (*ping-pong*).

---

## 2. Rendu sans Transit CPU
Le shader de sommets du maillage de rendu utilise `texelFetch()` pour positionner chaque particule directement à partir de la texture GPU sans aucun transfert de données vers le CPU.

---

## 🔗 Notes Associées
- [[WebGPU Architecture and TSL Shaders]]
- [[Parametric Geometry and Modifiers]]

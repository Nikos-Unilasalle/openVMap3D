# Kinetic Audio and Path Dynamics

*Pôle Roadmap : 07 - Creative FX & Dynamic Transitions*

Ce document formalise les spécifications des composants cinétiques réactifs à l'audio, des trajectoires continues (rubans néon) et du morphing de formes pour **Tsuji**.

---

## 1. Nœud `motion/ribbon_trail` (Rubans 3D & Traînées Lumineuses)

Inspiré des effets de néon interactifs (*Neon 3D Tubes Cursor Trail*) :
- **Architecture** : File circulaire de points 3D (`RingBuffer<THREE.Vector3>`) mise à jour à chaque frame.
- **Génération Géométrique** : Construction d'un tube ou ruban orienté caméra (`Camera-Facing Ribbon Plane`) ou cylindrique via `TubeGeometry` avec un profil de rayon décroissant :

$$R(s) = R_0 \cdot (1.0 - s)^p$$

où $s \in [0, 1]$ est l'abscisse curviligne normalisée le long de la traînée.

- **Sockets** :
  - `inputPosition` (`vector` : point à suivre)
  - `length` (`value` : nombre de segments mémorisés)
  - `startRadius` (`value` : largeur de tête)
  - `endRadius` (`value` : largeur de queue)
  - `emissiveColor` (`color` : couleur émissive)

---

## 2. Nœud `sound/ripple_plane` (Surface d'Eau Audio-Réactive)

- **Fonctionnement** : Plan maillé déformé dynamiquement par les transitoires et spectres audio FFT.
- **Équation d'Onde Discrète sur Grille 2D** :

$$h_{i,j}^{t+1} = 2 h_{i,j}^t - h_{i,j}^{t-1} + c^2 rac{\Delta t^2}{\Delta x^2} \left(h_{i+1,j}^t + h_{i-1,j}^t + h_{i,j+1}^t + h_{i,j-1}^t - 4h_{i,j}^tight) - \gamma \Delta t (h_{i,j}^t - h_{i,j}^{t-1})$$

L'énergie des basses fréquences (Kicks) injecte une impulsion $h_{c_x, c_y} += E_{\text{bass}}$ au centre de la grille.

---

## 3. Nœud `curve/marquee_loop` (Animation Continue sur Tracé SVG)

Permet de faire défiler du texte, des objets ou des particules le long d'une courbe 3D fermée avec boucle sans fin et décalage d'espacement continu.

---

## 🔗 Notes Associées
- [[Audio Reactive Signal Processing]]
- [[Motion Design and Easing Mathematics]]
- [[ThreeJS Creative Showcase Synthesis and Node Ideas]]

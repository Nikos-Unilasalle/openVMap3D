# Évolution : Vidéo-Mapping Avancé, Soft-Edge Blending & Multi-Projecteurs

*Domaine : Ingénierie Scénographique, Calibration Multi-Surfaces & Projections Géantes*

---

## 1. Contexte & Enjeux

Tsuji intègre déjà le nœud de calibration `Room Corner` et le solveur DLT (`dlt.ts`) pour calibrer un vidéoprojecteur unique sur un coin de pièce tridimensionnel.
Pour adresser des scénographies plus ambitieuses (fresques monumentales, dômes, façades de bâtiments, mapping 360°), une installation nécessite **plusieurs vidéoprojecteurs synchronisés** dont les zones de projection se chevauchent.

---

## 2. Architecture de Soft-Edge Blending (Fusion de Bords)

Lorsque deux projecteurs se superposent sur une zone d'environ $10\%$ à $20\%$ de leur largeur, la double intensité lumineuse crée une bande blanche aveuglante.

```
                  Zone de Recouvrement (Overlap)
                           ┌─────────┐
    Projecteur 1 (Gauche)  │ ░░░░░░░ │  Projecteur 2 (Droit)
    ══════════════════════▶│ ░░░░░░░ │◀══════════════════════
                           └─────────┘
    Atténuation 1 : 1.0 ──▶ 0.0 (Cos² / Bezier)
    Atténuation 2 : 0.0 ──▶ 1.0 (Cos² / Bezier)
```

### 2.1 Le Nœud `calibration/edge-blend`
Ce nouveau nœud de post-traitement applique une fonction de transfert gamma-corrigée sur les bords d'un projecteur :
$$I(x) = \begin{cases}
\sin^2\left(\frac{\pi x}{2 w}\right)^\gamma & \text{si } x \in [0, w] \\
1.0 & \text{au-delà}
\end{cases}$$
où $w$ est la largeur de la zone de recouvrement et $\gamma$ le coefficient de réponse de la lampe du projecteur.

---

## 3. Grille de Déformation Non Linéaire (*Mesh Warping 3D*)

Pour projeter sur des surfaces courbes (colonnes, sphères, voûtes) :
- Ajout d'une grille de déformation par splines bicubiques ($8 \times 8$ ou $16 \times 16$ points de contrôle).
- Les poignées de warping sont manipulables directement dans `CalibrationOverlay.tsx` avec persistance des déformations par sortie vidéo.

---

## 4. Multi-Fenêtres & Multi-GPU sous Tauri

- Exploitation des capacités multi-fenêtres de Tauri 2.0 pour ouvrir des fenêtres `OutputWindow` distinctes assignées à chaque port HDMI / DisplayPort physique.
- Synchronisation d'affichage via un bus IPC local haute fréquence sans déchirure d'image (*tearing*).

---

## 🔗 Notes Associées
- [[Projective Geometry and DLT Calibration]]
- [[ThreeJS Viewport and Calibration Pipeline]]

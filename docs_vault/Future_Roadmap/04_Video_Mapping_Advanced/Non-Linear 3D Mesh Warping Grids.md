# Évolution : Grilles de Déformation Non-Linéaires (Mesh Warping 3D)

*Domaine : Correction Géométrique sur Surfaces Complexes*

---

## 1. Objectif
Permettre la déformation élastique fine de l'image projetée sur des surfaces courbes (dômes, colonnes, sphères, reliefs) via une grille de points de contrôle Bézier bicubique ajustable à la souris ($4 \times 4$, $8 \times 8$, $16 \times 16$).

---

## 2. Intégration UI dans `CalibrationOverlay.tsx`
- Affichage des lignes de contrôle et poignées tangentielles en superposition directe sur la vue projetée.
- Sauvegarde des matrices de déformation géométrique par identifiant d'écran physique.

---

## 🔗 Notes Associées
- [[Soft-Edge Blending Shader Specification]]
- [[Multi-Screen Native Windowing in Tauri]]

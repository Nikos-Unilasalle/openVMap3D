# Param Panel and Inspector

*Emplacement dans le code : `src/windows/ParamPanel.tsx`*

Ce document décrit le panneau d'inspection des paramètres de nœud et ses widgets interactifs.

---

## 1. Description Déclarative (`ParamFieldDef`)

Les champs de réglage sont décrits par des types unions dans `types.ts` :
- `number` (avec support de l'affichage en degrés ou en pourcentages)
- `vector`
- `color` (avec palette HSV/Hex)
- `color_ramp` (dégradé multi-points)
- `curve_profile` (courbe Bézier interactive)
- `file` (avec callback `onLoaded`)

---

## 2. Raccourci d'Animation Clé ("K")
- Le survol d'une propriété avec la touche `K` crée une image-clé dans `KeyframeStore` à la frame actuelle de la timeline.

---

## 🔗 Notes Associées
- [[Keyframe Store and Timeline]]
- [[Graph Editor and Canvas]]
- [[Node Creation Guide]]

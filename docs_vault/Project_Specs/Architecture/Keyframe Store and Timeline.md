# Keyframe Store and Timeline

*Emplacement dans le code : `src/shared/graph/evaluate.ts`, `src/windows/TimelineDrawer.tsx`, `src/windows/MotionGraph.tsx`*

Ce document présente l'architecture de la timeline d'animation et du graphe de mouvement dans Tsuji.

---

## 1. Structure de Stockage (`KeyframeStore`)

```typescript
export interface Keyframe {
  frame: number;
  value: any;                          // Scalaire, Vector3, Color ou tableau
  easeIn?: EasingType;                 // Atténuation d'arrivée sur cette clé
  easeStrength?: number;               // Contraste / Force
  easeBezier?: [number, number, number, number]; // Points de contrôle Bézier
}

export type KeyframeStore = Record<string, Record<string, Keyframe[]>>;
```

---

## 2. Interpolation Multi-Types (`interpolateValue`)

La fonction d'interpolation prend en charge nativement :
- Les nombres flottants et entiers.
- Les vecteurs `THREE.Vector3` (interpolation `lerpVectors`).
- Les couleurs `THREE.Color` (interpolation `lerpColors`).
- Les listes de points de contrôle de courbes 3D.

---

## 3. Règle Fondamentale de Priorité

- **Le câblage filaire l'emporte toujours sur les images-clés.**
- Si un port est relié par un fil, la valeur de l'image-clé est ignorée au profit de la valeur amont dynamique.

---

## 🔗 Notes Associées
- [[Motion Design and Easing Mathematics]]
- [[Graph Evaluation Runtime]]
- [[Param Panel and Inspector]]

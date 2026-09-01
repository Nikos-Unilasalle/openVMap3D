# FLAW-05 : Rétention Orpheline de Session dans `previousFrameOutputsBySession`

*Gravité : 🟡 MOYENNE*  
*Fichiers Concernés : `src/shared/graph/evaluate.ts`, `src/shared/three/Viewport.tsx`, `src/shared/three/SplitViewport.tsx`*

---

## 1. Description de la Faille

Pour isoler les résultats d'évaluation temporelle entre différents viewports (éditeur, split preview, fenêtre de sortie et export hors-ligne), `src/shared/graph/evaluate.ts:401` stocke les sorties de la frame précédente dans une table globale :

```typescript
const previousFrameOutputsBySession = new Map<string, EvalResult>();
```

### Mécanisme de la Fuite :
- Chaque session (`sessionId`) alloue une entrée contenant l'intégralité des sorties de nœuds (`EvalResult`), incluant des références directes vers des maillages 3D, des géométries Three.js et des tableaux de données.
- Si une fenêtre de prévisualisation ou un composant de split viewport est monté puis démonté sans invoquer explicitement `disposeEvalSession(sessionId)`, la clé et tout le graphe d'objets associé demeurent attachés à la `Map` globale de manière permanente.

---

## 2. Conséquences

- Fuite de mémoire insidieuse lors des ouvertures/fermetures répétées de fenêtres secondaires ou de modes de vue partagée (`SplitViewport`).
- Empêche la libération des géométries Three.js par le Garbage Collector car `EvalResult` maintient des références directes vers `outputs.geometry`.

---

## 3. Recommandation Corrective

1. **Intégration d'un Hook de Nettoyage Automatique** :
   - Dans tous les composants React gérant un `sessionId` (`Viewport.tsx`, `SplitViewport.tsx`), ajouter un hook `useEffect` de démontage :
     ```typescript
     useEffect(() => {
       return () => {
         disposeEvalSession(sessionId);
       };
     }, [sessionId]);
     ```
2. **Utilisation d'une structure à expiration automatique (TTL / WeakRef)** pour les sessions temporaires d'exportation.

---

## 🔗 Notes Associées
- [[Graph Evaluation Runtime]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[ThreeJS Viewport and Calibration Pipeline]]

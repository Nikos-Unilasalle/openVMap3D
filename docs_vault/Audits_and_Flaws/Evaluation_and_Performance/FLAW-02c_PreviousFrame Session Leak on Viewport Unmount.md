# FLAW-02c : Fuite de Session `previousFrameOutputsBySession` au Démontage

*Gravité : 🟡 MOYENNE*  
*Fichiers : `src/shared/graph/evaluate.ts:401`, `src/shared/three/Viewport.tsx`*

---

## 1. Description du Code Vulnérable
```typescript
// evaluate.ts:401
const previousFrameOutputsBySession = new Map<string, EvalResult>();
```
Cette table conserve l'intégralité des sorties de maillages et de calculs de la frame précédente pour chaque identifiant de session de rendu.

---

## 2. Défaut & Solution
Si un composant React de vue secondaire (`SplitViewport`, fenêtre de sortie) est démonté sans invoquer explicitement `disposeEvalSession(sessionId)`, toute la hiérarchie de résultats 3D reste bloquée en mémoire.  
**Correctif** : Ajouter un hook `useEffect` de nettoyage dans tous les composants React hébergeant un viewport.

---

## 🔗 Notes Associées
- [[FLAW-05_Session Cache Memory Leaks and Multi-Viewport Cleanup]]
- [[Graph Evaluation Runtime]]

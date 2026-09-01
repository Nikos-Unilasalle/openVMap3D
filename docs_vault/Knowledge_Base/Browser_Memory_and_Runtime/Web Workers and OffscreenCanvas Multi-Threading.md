# Multi-Threading WebGL : Web Workers & `OffscreenCanvas`

*Domaine : Concurrence Web, Isolation du Rendu & Fluidité UI*

---

## 1. Découplage Thread Principal vs Thread de Rendu
Par défaut, JavaScript est mono-thread. Si le thread principal effectue des calculs lourds (parsing JSON, décompression de géométrie, évaluation de graphe), l'affichage 3D se fige.

- **`OffscreenCanvas`** permet de transférer le contexte de dessin WebGL à un **Web Worker** dédié :
```typescript
const offscreen = canvas.transferControlToOffscreen();
worker.postMessage({ canvas: offscreen }, [offscreen]);
```

---

## 2. Bénéfices Architecturaux
1. **Isolation des Pauses GC** : Les nettoyages de mémoire du thread UI React n'ont aucun impact sur le framerate du worker WebGL.
2. **Fluidité UI 60/120 FPS Garantie** : Même en cas d'ouverture de fenêtres modales ou de traitements DOM lourds, la scène 3D continue de tourner à pleine cadence.

---

## 🔗 Notes Associées
- [[Zero-Copy Data Transfer via Transferables]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[WebGPU Architecture and TSL Shaders]]

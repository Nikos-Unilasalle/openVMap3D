# Cycle de Vie : Perte et Restauration de Contexte WebGL

*Domaine : Résilience & Gestion des Exceptions WebGL*

---

## 1. Déclencheurs de la Perte de Contexte
Une perte de contexte (`webglcontextlost`) survient lors de :
1. Mise en veille prolongée de la machine.
2. Basculement dynamique de GPU (carte intégrée Intel $\leftrightarrow$ carte dédiée Nvidia).
3. Timeout de shader (TDR Windows).
4. Pression mémoire critique imposée par le système d'exploitation.

---

## 2. Protocole de Récupération
```typescript
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault(); // Indique qu'on gère la restauration
  stopRenderLoop();
}, false);

canvas.addEventListener("webglcontextrestored", () => {
  rebuildThreeResources(); // Réinstancie buffers et textures depuis le cache
  restartRenderLoop();
}, false);
```

---

## 🔗 Notes Associées
- [[Chromium ANGLE and TDR Timeouts]]
- [[Safari and iOS WebKit Memory Limits]]
- [[GPU Memory and VRAM Leak Prevention]]

# Limites Mémoire & Spécificités WebKit (Safari & iOS)

*Domaine : Contraintes Mobiles & Robustesse WebKit*

---

## 1. Plafond Mémoire Strict sur iOS
Sur iPhone et iPad, WebKit impose un budget mémoire par onglet particulièrement restreint ($300\text{ Mo}$ à $1\text{ Go}$ selon les modèles).
- Si l'application dépasse ce seuil, le système d'exploitation termine le processus immédiatement (*Jetsam event*), provoquant un rechargement blanc de la page.

---

## 2. Limite de Surface de Canvas
Un élément `<canvas>` sur iOS Safari ne peut excéder $\approx 16.7\text{ millions de pixels}$ (ex: $4096 \times 4096$). Tout dépassement entraîne une erreur WebGL silencieuse ou un crash.

---

## 3. Le Bug de Rétention de Canvas (*Canvas Hoarding*)
WebKit ne libère pas la mémoire d'un canvas supprimé du DOM s'il n'est pas réinitialisé manuellement.
```typescript
export function releaseCanvasMemory(canvas: HTMLCanvasElement): void {
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (gl) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
```

---

## 🔗 Notes Associées
- [[Chromium ANGLE and TDR Timeouts]]
- [[WebGL Context Loss and Restoration Lifecycle]]
- [[GPU Memory and VRAM Leak Prevention]]

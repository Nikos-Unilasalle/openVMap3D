# Réduction de l'Overdraw & Plafonnement du Device Pixel Ratio

*Domaine : Charge de Remplissage GPU (Fillrate)*

---

## 1. Le Piège des Écrans Retina / 4K
Un écran mobile ou ordinateur avec un `window.devicePixelRatio` de $3.0$ calcule **$9 \times$ plus de pixels** qu'un écran standard ($1.0$).
- À $60\text{ fps}$, calculer un fragment shader lourd sur $9\times$ de pixels sature instantanément la bande passante du processeur graphique.

---

## 2. Règle de Production : Plafonner le DPR
Toujours limiter le ratio de pixels à un maximum de $2.0$ :
```typescript
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
```
Pour les configurations très chargées, implémenter un ajustement dynamique de résolution (*Dynamic Resolution Scaling - DRS*).

---

## 🔗 Notes Associées
- [[Early-Z and Depth Pre-Pass Techniques]]
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]

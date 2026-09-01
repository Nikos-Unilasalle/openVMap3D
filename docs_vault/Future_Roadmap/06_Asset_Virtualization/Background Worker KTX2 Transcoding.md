# Évolution : Transcodage KTX2 Asynchrone dans un Web Worker

*Domaine : Chargement d'Assets Non-Bloquant*

---

## 1. Objectif
Effectuer le transcodage Basis Universal des textures importées dans un Web Worker en arrière-plan afin d'éviter tout blocage de l'interface graphique utilisateur pendant l'importation de textures lourdes.

---

## 2. Pipeline de Données
```
[Drop d'image PNG/JPG/KTX2] ──▶ [Worker Basis WASM] ──▶ [Transferable Buffer BC7/ASTC] ──▶ [Texture GPU]
```

---

## 🔗 Notes Associées
- [[KTX2 and Basis Universal Texture Compression]]
- [[Zero-Copy Data Transfer via Transferables]]

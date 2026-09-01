# KTX2 & Compression Universelle de Textures GPU (Basis Universal)

*Domaine : Pipeline d'Assets, Compression Matérielle & Économie VRAM*

---

## 1. Pourquoi les Formats JPG/PNG sont Toxiques pour la VRAM
Une image JPG/PNG de 2048×2048 px pèse peut-être 1 Mo sur le disque, mais une fois envoyée au GPU, WebGL la décompresse en un tableau brut non compressé de **16.7 Mo de VRAM** ($2048 \times 2048 \times 4\text{ octets} \times 1.33$).
- 10 textures de 2K consument déjà $\approx 170\text{ Mo}$ de VRAM.

---

## 2. Le Standard KTX2 / Basis Universal
Le format **KTX2** stocke les textures sous forme compressée universelle (Basis Universal).
- **Transcodage instantané** : Au chargement, le CPU transcode en quelques millisecondes le format Basis vers le format natif du GPU cible (**BC7** sur PC/Nvidia/AMD, **ASTC** sur iOS/Android/Apple Silicon, **ETC2** sur Android).
- **Empreinte VRAM réduite de $6\times$ à $8\times$** : La texture **reste compressée directement dans la VRAM** du GPU et est décompressée matériellement à la volée par les unités de texture du silicium.

```
Texture KTX2 (Fichier 1 Mo) ──▶ [Transcodeur WASM] ──▶ Texture VRAM BC7/ASTC (2.7 Mo en mémoire GPU)
```

---

## 🔗 Notes Associées
- [[Meshopt Geometry Compression and gltfpack]]
- [[GLTF Asset Ingestion Pipeline]]
- [[GPU Memory and VRAM Leak Prevention]]

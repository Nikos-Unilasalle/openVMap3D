# Comparatif : Draco vs. Meshopt pour GLTF

*Domaine : Compression 3D & Compromis Débit Réseau vs Temps de Décompression CPU*

---

## 1. Tableau Comparatif

| Critère | Google Draco | Meshoptimizer (Meshopt) |
| :--- | :--- | :--- |
| **Taille Fichier Réseau** | Extrêmement compressé (Ratio maximal) | Très compressé ($\approx 5-10\%$ plus grand que Draco) |
| **Vitesse de Décompression** | Lente ($50-300\text{ ms}$ par modèle sur CPU) | **Ultra-rapide** ($1-5\text{ ms}$ via WebAssembly SIMD) |
| **Impact sur l'UI** | Saccades et blocages du thread principal | Imperceptible / Fluide |
| **Accès Mémoire GPU** | Nécessite une réallocation complète | Données prêtes à être envoyées directement au GPU |
| **Recommandation 2026** | Modèles archivés statiques très lourds | **Standard recommandé en production interactive** |

---

## 2. Synthèse
Bien que Draco produise des fichiers légèrement plus compacts à télécharger, son surcoût de décodage CPU fige l'application lors de l'instanciation de modèles en direct. **Meshopt est le choix privilégié pour Tsuji**.

---

## 🔗 Notes Associées
- [[Meshopt Geometry Compression and gltfpack]]
- [[KTX2 and Basis Universal Texture Compression]]
- [[GLTF Asset Ingestion Pipeline]]

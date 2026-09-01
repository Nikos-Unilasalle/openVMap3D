# Évolution : Pipeline Web Worker & `OffscreenCanvas`

*Domaine : Concurrence & Architecture Multi-Threads*

---

## 1. Objectif
Déporter entièrement l'évaluation du graphe de nœuds et le pipeline de rendu Three.js dans un Web Worker dédié pour immuniser le rendu 3D contre les ralentissements de l'interface React.

---

## 2. Découpage en 3 Threads
1. **Thread UI (Principal)** : Gestion du DOM, éditeur React Flow, modal de raccourcis et timeline.
2. **Thread Graph Worker** : Calculs d'évaluation topologique et interpolation des images-clés.
3. **Thread Render Worker** : Contexte WebGPU / WebGL via `OffscreenCanvas` et transmission de commandes GPU.

---

## 🔗 Notes Associées
- [[Web Workers and OffscreenCanvas Multi-Threading]]
- [[Zero-Copy Data Transfer via Transferables]]
- [[Graph Evaluation Runtime]]

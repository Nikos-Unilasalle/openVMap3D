# Roadmap & Évolutions Futures de Tsuji — Vision Stratégique

*Domaine : Ingénierie Produit, Architecture Logicielle & Roadmap Technique*

Ce dossier consigne l'analyse approfondie de la base de code existante de Tsuji et formalise les axes prioritaires d'évolution technique, architecturale et fonctionnelle pour les futures versions du moteur.

---

## 🧭 Axes Majeurs de Développement

```
                                  ┌─────────────────────────────────────────┐
                                  │      Piliers d'Évolution Tsuji          │
                                  └────────────────────┬────────────────────┘
                                                       │
        ┌──────────────────┬───────────────────────────┼───────────────────────────┬──────────────────┐
        ▼                  ▼                           ▼                           ▼                  ▼
[1. Moteur & GPU]   [2. Cycle de Vie]          [3. Modularité]            [4. Vidéo-Mapping]   [5. Protocoles & E/S]
- WebGPU (r171+)    - Garbage Collector GPU    - Sous-graphes (Groupes)   - Multi-projecteurs  - MIDI 2.0 / OSC
- Compute Shaders   - Ref-counting mémoires    - Nœuds composés           - Soft-Edge Blending - Spout / Syphon
- Offscreen Worker  - RenderTarget Pooling     - Encapsulation macro      - Warping 3D avancé  - WebCodecs 4K/60
```

---

## 🗺️ Index des Documents d'Évolution

1. [[Engine and WebGPU Migration]] — Transition vers `WebGPURenderer`, shaders TSL (Three.js Shading Language), compute shaders natifs pour particules et déport du graphe sur Web Workers.
2. [[Resource Lifecycle and Cache Garbage Collection]] — Résolution de la fuite de suppression de nœuds, comptage de références (`Ref-Counting`), `FinalizationRegistry` et pooling de textures/géométries.
3. [[Subgraphs and Compound Nodes Architecture]] — Implémentation des nœuds `Group` (macro-nœuds réutilisables, entrées/sorties exposées, instanciation de sous-arbres).
4. [[Advanced Video-Mapping and Multi-Projector Blending]] — Raccord multi-surfaces (*Edge Blending* progressif), grilles de déformation non-linéaires et gestion multi-écrans physiques sous Tauri.
5. [[I_O Expansion and Protocol Ecosystem]] — Intégration MIDI 2.0 / WebMIDI, passerelle OSC, partages de textures GPU inter-applications (Spout sous Windows / Syphon sous macOS), et export vidéo matériel ultra-rapide via WebCodecs.
6. [[Asset Virtualization and KTX2 Pipeline]] — Streaming dynamique d'assets, transcodage KTX2/Basis en arrière-plan, et stockage persistant IndexedDB.

---

## 🔗 Notes Associées
- [[Graph Evaluation Runtime]]
- [[ThreeJS GPU Optimization Synthesis and Production Playbook]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[System Invariants and Coding Rules]]

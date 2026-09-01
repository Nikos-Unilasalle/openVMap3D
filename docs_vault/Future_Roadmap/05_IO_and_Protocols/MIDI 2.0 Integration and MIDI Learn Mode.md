# Évolution : Intégration MIDI 2.0 / WebMIDI & Mode MIDI Learn

*Domaine : Contrôle Scénique & Interactivité Matérielle*

---

## 1. Objectif
Permettre le contrôle en temps réel des paramètres du graphe à l'aide de contrôleurs MIDI physiques (Korg nanoKONTROL, Akai APC, Novation Launchpad) via l'API WebMIDI standard.

---

## 2. Le Nœud `io/midi-in` & Mode MIDI Learn
- **Haute Résolution 16-bit (MIDI 2.0)** : Réglage d'angles et d'intensités sans effet d'escalier (*zipper noise*).
- **Mode MIDI Learn** : Clic droit sur un paramètre dans `ParamPanel.tsx` $\rightarrow$ "Associer au contrôleur MIDI", puis action sur un fader physique pour créer la liaison automatiquement.

---

## 🔗 Notes Associées
- [[OSC Network Ingestion and Dispatch]]
- [[Param Panel and Inspector]]

# Évolution : Protocoles d'E/S, MIDI 2.0, OSC & Flux Vidéo Inter-Apps

*Domaine : Interconnectivité Scénique, Protocoles Événementiels & Intégration Audiovisuelle*

---

## 1. Contexte

Tsuji supporte actuellement les flux de données via WebSocket/MQTT, les fichiers CSV et les événements clavier/souris.
Pour s'insérer dans des écosystèmes professionnels de spectacle vivant (Ableton Live, TouchDesigner, Resolume, consoles lumière DMX/Art-Net), plusieurs extensions de connectivité sont prévues.

---

## 2. Nouveaux Nœuds & Protocoles Prioritaires

### 2.1 MIDI 2.0 / WebMIDI (`io/midi-in`)
- **Support Universel** : Contrôleurs à potentiomètres motorisés, claviers maîtres, pads MIDI (Akai APC, Korg nanoKONTROL, Launchpad).
- **Mappage Haute Résolution** : Exploitation de la résolution 16-bit du protocole MIDI 2.0 pour les réglages de paramètres fins sans effet d'escalier (*zipper noise*).
- **Mode MIDI Learn** : Possibilité de faire un clic-droit sur n'importe quel paramètre dans `ParamPanel.tsx` puis de tourner un bouton physique pour créer l'association instantanément.

### 2.2 Protocole OSC (Open Sound Control) (`io/osc-in`, `io/osc-out`)
- Réception et émission de messages réseau UDP typés (flottants, chaînes, vecteurs).
- Intégration avec des applications mobiles de télécommande (TouchOSC, Lemur) et des logiciels audio (Max/MSP, PureData).

### 2.3 Partage de Textures GPU en Mémoire Partagée (Spout / Syphon)
- **Spout (Windows / DirectX)** et **Syphon (macOS / Metal)** : Permettent de transmettre le flux vidéo calculé par Tsuji directement en mémoire VRAM (zéro copie CPU, 60fps 4K sans latence) vers d'autres logiciels comme Resolume, OBS Studio ou MadMapper.
- Implémenté sous forme d'extension native Rust via le backend Tauri.

### 2.4 Export Vidéo Matériel Accéléré via WebCodecs (`videoExport.ts`)
- Utilisation de l'API `VideoEncoder` de WebCodecs pour encoder des flux 4K 60fps MP4/AV1/H.265 de manière matérielle directement depuis des buffers GPU, divisant par $10\times$ la durée d'exportation de vidéos par rapport aux solutions WebM basées sur `MediaRecorder`.

---

## 🔗 Notes Associées
- [[Audio Reactive Signal Processing]]
- [[Socket Type System and Ownership]]
- [[Param Panel and Inspector]]

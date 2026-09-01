# Évolution : Ingestion Réseau & Passerelle OSC (Open Sound Control)

*Domaine : Télécommande Réseau & Protocoles Audiovisuels*

---

## 1. Objectif
Supporter le protocole réseau OSC (UDP) pour communiquer avec des applications de télécommande sur tablettes (TouchOSC, Lemur) et des logiciels de création sonore (Max/MSP, PureData, Ableton Live).

---

## 2. Nœuds `io/osc-in` et `io/osc-out`
- Écoute sur un port UDP local via le backend Tauri en Rust.
- Décodage des messages d'adresses (ex: `/fader/speed 0.75`) et injection directe dans les sockets de type `value` ou `vector`.

---

## 🔗 Notes Associées
- [[MIDI 2.0 Integration and MIDI Learn Mode]]
- [[Socket Type System and Ownership]]

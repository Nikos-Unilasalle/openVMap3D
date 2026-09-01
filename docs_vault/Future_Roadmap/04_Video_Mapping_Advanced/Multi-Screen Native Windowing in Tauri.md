# Évolution : Fenêtrage Multi-Écrans Natif sous Tauri 2.0

*Domaine : Déploiement Multi-Projecteurs & Synchronisation*

---

## 1. Objectif
Exploiter les API multi-fenêtres natives de Tauri 2.0 pour ouvrir des fenêtres de sortie `OutputWindow` plein écran sans bordures distinctes pour chaque sortie vidéo connectée au PC (DisplayPort 1, HDMI 1, HDMI 2).

---

## 2. Synchronisation Frame-Lock
- Utilisation d'un bus de synchronisation IPC natif en Rust pour synchroniser le swap de buffers de toutes les fenêtres de projection afin d'éliminer les décalages de trame (*tearing* inter-écrans).

---

## 🔗 Notes Associées
- [[Soft-Edge Blending Shader Specification]]
- [[State Management and Multi-Canvas]]

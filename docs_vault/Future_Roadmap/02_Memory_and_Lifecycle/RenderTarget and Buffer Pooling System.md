# Évolution : Système de Pooling pour RenderTargets & Buffers

*Domaine : Réutilisation de Ressources & Performance*

---

## 1. Objectif
Éviter l'instanciation et la destruction répétées de `THREE.WebGLRenderTarget` lors des opérations de post-traitement, des ombres ou des passes d'effet vidéo.

---

## 2. Spécification du Pool de RenderTargets
- **Attribution par Signature** : Récupérer un render target selon ses dimensions (largeur, hauteur), son type (`FloatType`, `UnsignedByteType`) et ses options (profondeur, pochoir, filtrage).
- **Libération Automatique** : Restitution du render target dans le pool à la fin de la passe de rendu de la trame.

---

## 🔗 Notes Associées
- [[Centralized ResourceLifecycleManager Design]]
- [[Post-Processing Uber-Shader Passes]]

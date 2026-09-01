# Patrons de Stockage d'Assets 3D : IndexedDB vs. Cache API

*Domaine : Stockage Persistant Hors-Ligne & Caching d'Assets Lourds*

---

## 1. Comparatif des Deux Mécanismes de Stockage

| Critère | Cache Storage API (Service Workers) | IndexedDB (Binaire) |
| :--- | :--- | :--- |
| **Type de Données** | Réponses HTTP (`Response` / `Request`) | Objets binaires directs (`Blob`, `ArrayBuffer`) |
| **Cas d'Usage Idéal** | Assets statiques hébergés sur URL (`.glb`, `.wasm`, `.ktx2`) | Projets utilisateurs locaux, géométries procédurales cuites |
| **Accès Asynchrone** | Très rapide via `caches.open()` | Asynchrone transactionnel via `IDBDatabase` |
| **Proscription** | Ne jamais stocker de Base64 | Ne jamais stocker de Base64 |

---

## 2. Le Danger de l'Encodage Base64
Convertir un asset 3D binaire en chaîne `Base64` dans `localStorage` ou `IndexedDB` :
- Gonfle la taille des données de $+33\%$.
- Oblige le moteur JS à décoder une chaîne gigantesque en mémoire, provoquant des pics d'allocation de plusieurs centaines de Mo et des plantages de page (*Out of Memory*).

---

## 🔗 Notes Associées
- [[GLTF Asset Ingestion Pipeline]]
- [[Browser Memory Management, Caching and WebGL Performance]]

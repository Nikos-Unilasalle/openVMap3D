# Évolution : Cache IndexedDB pour Gros Nuages de Points PLY

*Domaine : Persistance Locale & Performances de Chargement*

---

## 1. Problématique Actuelle
L'importation de fichiers PLY / LiDAR comportant des millions de points recalcule les buffers d'attributs de sommets à chaque rechargement de projet.

---

## 2. Solution par Mise en Cache IndexedDB
- Stockage du buffer binaire direct pré-traité (`Float32Array`) dans IndexedDB avec clé de hachage de fichier.
- **Résultat** : Chargement instantané ($<10\text{ ms}$) lors des ouvertures ultérieures du projet sans ré-analyser le fichier texte PLY.

---

## 🔗 Notes Associées
- [[IndexedDB and Cache API Storage Patterns]]
- [[Parametric Geometry and Modifiers]]

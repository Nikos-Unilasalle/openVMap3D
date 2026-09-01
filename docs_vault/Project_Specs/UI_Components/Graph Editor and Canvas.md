# Graph Editor and Canvas

*Emplacement dans le code : `src/windows/GraphEditor.tsx`, `src/windows/GraphNode.tsx`*

Ce document détaille l'implémentation de l'interface utilisateur de l'éditeur de graphe.

---

## 1. Génération Dynamique des Nœuds
- Le composant `GraphNode.tsx` affiche l'en-tête, les poignées d'entrée/sortie et les libellés en se basant uniquement sur la `NodeDefinition`.
- Aucun code React spécifique n'est requis par nœud.

---

## 2. Câblage et Interaction
- **Câbles SVG Bézier** : Câblage interactif coloré selon le type de socket.
- **Validation à la Connexion** : Empêche le branchement entre types incompatibles.
- **Insertion sur Câble (`insertOnWire.ts`)** : Déposer un nœud sur un fil compatible l'intercale automatiquement.

---

## 🔗 Notes Associées
- [[Socket Type System and Ownership]]
- [[Param Panel and Inspector]]
- [[State Management and Multi-Canvas]]

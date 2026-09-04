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

## 3. Barre Supérieure d'Actions (`TopBar.tsx`) & Menus Déroulants

- **Épuration Visuelle (Boutons Icon-Only)** :
  - Les commandes standards (`New`, `Load`, `Save`, `Demos`, `Undo`, `Redo`) utilisent une interface ultra-compacte sans étiquette textuelle (`.top-bar-button-icon-only`) avec infobulle native (`title`), libérant un maximum d'espace pour la visualisation et le panneau de canevas.
- **Unification du Dialogue de Sauvegarde** :
  - L'action `Save` déclenche nativement la boîte de dialogue de fichiers de l'OS (`showSaveFilePicker` ou sélecteur local). Les doublons d'interface "Save As..." et "Incremental Save" ont été retirés pour simplifier le flux utilisateur.
- **Positionnement du Menu Démo (`DemosMenu.tsx`)** :
  - Le panneau déroulant est ancré à gauche (`left: 0`) du bouton déclencheur, garantissant un déploiement complet vers la droite sans risque de rognage par le bord de l'écran.

---

## 🔗 Notes Associées
- [[Socket Type System and Ownership]]
- [[Param Panel and Inspector]]
- [[State Management and Multi-Canvas]]
- [[ThreeJS Viewport and Calibration Pipeline]]


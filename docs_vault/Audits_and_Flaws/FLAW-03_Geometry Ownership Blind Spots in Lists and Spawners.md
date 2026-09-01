# FLAW-03 : Angles Morts d'Appropriation Géométrique sur les Listes & Générateurs

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P2)**  
> Corrigé dans [`src/shared/graph/sceneRoots.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/sceneRoots.ts).  
> `isOwnedDownstream()` propage désormais l'appropriation récursivement à travers les nœuds conteneurs et routeurs (`List Group`, `Reroute`).  
> 🔗 *Plan de remédiation :* [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]].

*Gravité initiale : 🟡 MOYENNE*  
*Fichiers Concernés : `src/shared/graph/sceneRoots.ts`*

---

## 1. Description de la Faille Initiale
Dans le moteur de rendu de Tsuji, un objet géométrique est considéré comme "racine de scène" et dessiné directement sauf si un nœud en aval en prend l'appropriation (`owns: true`).
Initialement, la vérification ne s'effectuait que sur un saut direct (1-hop). Lorsqu'un maillage passait par un `List Group` avant d'atteindre un `Merge`, `Spawner` ou `Render`, l'objet source restait dessiné en double sur la scène 3D.

---

## 2. Correctif Appliqué
Ajout d'une traversée récursive protégée contre les cycles (`visited = new Set<string>()`) pour suivre les flux de listes et de reroutes jusqu'au consommateur final.

---

## 🔗 Notes Associées
- [[P2_Geometry_Ownership_and_Clone_Integrity_Plan]]
- [[Socket Type System and Ownership]]
- [[Scene Graph and Hierarchical Transformations]]

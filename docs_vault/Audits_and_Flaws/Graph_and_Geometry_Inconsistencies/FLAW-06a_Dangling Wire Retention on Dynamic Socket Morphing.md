# FLAW-06a : Fils Orphelins lors de la Réduction de Sockets Dynamiques

*Gravité : 🟢 MINEURE*  
*Fichiers : `src/shared/graph/pruneConnections.ts`, `src/shared/graph/nodes/merge.ts`*

---

## 1. Description du Défaut
Lorsqu'un nœud à entrées dynamiques (comme `Merge`) réduit son nombre de prises (par exemple de 4 à 2 après suppression de composants amont), des fils reliant des nœuds vers `in3` peuvent subsister dans `Graph.connections` sans être automatiquement purgés.

---

## 2. Solution
Renforcer `pruneConnections.ts` pour qu'il compare les connexions non seulement à la liste des identifiants de nœuds, mais aussi aux `socket.id` retournés dynamiquement par `dynamicInputs()` et `dynamicOutputs()`.

---

## 🔗 Notes Associées
- [[FLAW-06_Dynamic Socket Morphing and Dangling Connection Inconsistencies]]
- [[Socket Type System and Ownership]]

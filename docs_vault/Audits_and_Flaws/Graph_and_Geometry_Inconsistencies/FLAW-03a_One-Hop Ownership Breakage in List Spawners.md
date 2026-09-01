# FLAW-03a : Rupture de l'Appropriation Géométrique lors du Passage par une Liste

*Gravité : 🟡 MOYENNE*  
*Fichier : `src/shared/graph/sceneRoots.ts:25-29`*

---

## 1. Description du Défaut
Dans `sceneRoots.ts`, la fonction `isOwnedDownstream()` vérifie si une géométrie est consommée par un nœud aval déclarant `owns: true`.
- Comme cette vérification ne s'effectue qu'à un seul saut de connexion direct (*1-hop*), lorsqu'une géométrie entre dans un nœud `List Group` (qui sort un type `list`), l'appropriation est perdue.

---

## 2. Conséquence
Le nœud générateur source (ex. `Object Box`) continue d'être dessiné à la position $(0, 0, 0)$ en parallèle des copies générées par le spawner aval (`Spawn` ou `Array`), nécessitant de masquer manuellement l'original.

---

## 🔗 Notes Associées
- [[FLAW-03_Geometry Ownership Blind Spots in Lists and Spawners]]
- [[Socket Type System and Ownership]]

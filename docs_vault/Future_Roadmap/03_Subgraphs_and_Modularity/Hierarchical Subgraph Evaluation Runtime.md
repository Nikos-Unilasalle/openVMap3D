# Évolution : Évaluateur Récursif de Sous-Graphes

*Domaine : Runtime & Évaluation Hiérarchique*

---

## 1. Principe d'Exécution
Lors du parcours topologique de `evaluateGraph()` dans le graphe parent :
1. Rencontre d'un nœud `structure/group`.
2. Injection des valeurs des sockets parents dans les nœuds d'entrée internes (`GroupInput`).
3. Évaluation du sous-graphe avec son propre tri topologique et son `EvalContext` propagé.
4. Récupération des sorties du nœud `GroupOutput` pour alimenter les nœuds avals du graphe parent.

---

## 🔗 Notes Associées
- [[GroupNodeDefinition and Exposed Ports Schema]]
- [[Graph Evaluation Runtime]]

# Détection de Cycles & Résolution des Boucles de Rétroaction

*Domaine : Théorie des Graphes & Robustesse Temps Réel*

---

## 1. Détection des Cycles via Kahn
Si après exécution de l'algorithme de Kahn, le nombre de sommets ordonnés est strictement inférieur au nombre total de sommets dans le graphe, les sommets restants font partie d'un **cycle de dépendance**.

---

## 2. Résolution Non-Bloquante par Délai Temporel ($t - 1$)
Plutôt que de faire planter l'application par récursion infinie :
- Les nœuds cycliques sont placés en fin de file d'évaluation.
- Lorsqu'une dépendance cyclique non résolue est lue, elle renvoie **la valeur calculée à la trame précédente** ($t - \Delta t$).
- Ce mécanisme transforme une dépendance circulaire synchrone impossible en une boucle de rétroaction temporelle stable.

---

## 🔗 Notes Associées
- [[Kahn Algorithm and DAG Topological Sorting]]
- [[Graph Evaluation Runtime]]

# Node Graph Theory and Evaluation Models

*Domaine : Théorie des Systèmes à Flux de Données & Moteurs de Graphes*

Ce document formalise les concepts fondamentaux régissant les architectures d'évaluation des graphes de nœuds dans les logiciels de création numérique (DCC, moteurs temps réel, outils de compositing).

---

## 1. Modèles d'Évaluation : Push vs. Pull

Il existe deux paradigmes majeurs pour évaluer un graphe orienté :

| Critère | Modèle Pull (À la demande / Paresseux) | Modèle Push (En avant / Eager) |
| :--- | :--- | :--- |
| **Principe** | La sortie terminale demande les valeurs à ses entrées récursivement. | Les sources (temps, capteurs) poussent leurs données vers l'aval. |
| **Outils de référence** | Blender (Geometry Nodes), Houdini, Nuke | TouchDesigner, Cables.gl, Max/MSP, Tsuji |
| **Avantages** | N'évalue que ce qui est strictement nécessaire pour le rendu final. | Parfait pour le temps réel 60fps où la majorité du graphe dépend du temps. |
| **Inconvénients** | Complexité de l'invalidation de cache et des flags *dirty*. | Évalue tous les nœuds même s'ils ne sont pas visibles (sauf culling). |

---

## 2. Tri Topologique et Algorithme de Kahn

Pour exécuter un graphe orienté acyclique (DAG) de manière ordonnée et déterministe, les nœuds doivent être ordonnancés de telle sorte que chaque nœud soit évalué **après** tous ses prédécesseurs.

### Algorithme de Kahn :
1. Calculer le degré entrant (*in-degree*) de chaque sommet (nombre de connexions arrivant sur le nœud).
2. Placer tous les sommets de degré entrant nul dans une file d'attente $Q$ (nœuds racines, générateurs de temps, constantes).
3. Tant que $Q$ n'est pas vide :
   - Défiler un sommet $u$.
   - L'ajouter à l'ordre linéaire d'évaluation.
   - Pour chaque voisin $v$ connecté en sortie de $u$, décrémenter le degré entrant de $v$. Si le degré entrant de $v$ devient nul, ajouter $v$ à $Q$.
4. Si le nombre d'éléments ordonnés est inférieur au nombre total de nœuds, le graphe contient au moins un **cycle**.

---

## 3. Gestion des Cycles et Rétroaction Temporelle

Dans les systèmes physiques ou les oscillateurs interactifs, les utilisateurs créent parfois des boucles de rétroaction ($A \rightarrow B \rightarrow A$).
- **Approche Naive (DFS)** : Boucle récursive infinie provoquant un dépassement de pile (*Stack Overflow*).
- **Approche Résiliente Temps Réel** :
  - Détecter les nœuds cycliques via le reliquat de l'algorithme de Kahn.
  - Planifier l'évaluation des nœuds cycliques en fin de passe.
  - Injecter la valeur calculée à la **frame précédente** ($t - \Delta t$) pour résoudre la dépendance circulaire sans bloquer le moteur.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Motion Design and Easing Mathematics]]
- [[Graph Evaluation Runtime]]

# Algorithme de Kahn & Tri Topologique de DAG

*Domaine : Algorithmique des Graphes Orientés Acycliques*

---

## 1. Principe de l'Algorithme de Kahn
Permet d'obtenir un ordre d'évaluation séquentiel linéaire où chaque nœud est garanti d'être calculé **après** tous ses nœuds parents :

1. Calculer le degré entrant (*in-degree*) de chaque sommet.
2. Enfiler tous les sommets de degré entrant nul ($in=0$).
3. Défiler un sommet $u$, l'ajouter à la liste d'ordonnancement, et décrémenter le degré entrant de tous ses voisins sortants.
4. Si un voisin atteint $in=0$, l'enfiler.
5. Répéter jusqu'à ce que la file soit vide.
6. **Complexité** : $\mathcal{O}(V + E)$ linéaire en temps et mémoire.

---

## 🔗 Notes Associées
- [[Node Graph Evaluation Models Push vs Pull]]
- [[Cycle Detection and Feedback Resolution]]
- [[Graph Evaluation Runtime]]

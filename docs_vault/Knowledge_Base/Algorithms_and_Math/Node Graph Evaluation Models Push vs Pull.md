# Modèles d'Évaluation de Graphes : Push vs. Pull

*Domaine : Théorie des Graphes de Flux de Données*

---

## 1. Modèle Pull (Paresseux / À la demande)
- La sortie finale demande les données à ses entrées récursivement.
- **Avantage** : N'évalue que les sous-graphes connectés et actifs.
- **Inconvénient** : Gestion complexe des drapeaux *dirty* et des caches d'invalidation.
- **Exemples** : Blender, Houdini, Unreal Material Editor.

---

## 2. Modèle Push (En avant / Eager)
- Les générateurs sources (temps, entrées utilisateur) poussent leurs valeurs en aval dans l'ordre topologique.
- **Avantage** : Idéal pour les moteurs interactifs 60fps où le temps avance à chaque frame et fait muter l'ensemble du graphe.
- **Inconvénient** : Évalue tous les nœuds même s'ils ne sont pas visibles (nécessite un culling explicite).
- **Exemples** : Tsuji, TouchDesigner, Cables.gl.

---

## 🔗 Notes Associées
- [[Kahn Algorithm and DAG Topological Sorting]]
- [[Cycle Detection and Feedback Resolution]]
- [[Graph Evaluation Runtime]]

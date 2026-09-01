# Évolution : Sous-graphes, Groupes & Nœuds Composés

*Domaine : Modularité du Graphe, Réutilisabilité & Ergonomie UI*

---

## 1. Contexte & Vision

Dans `BIBLE.md` (section *Structure*), le nœud `Group (reusable sub-tree, instanced)` était listé dans la vision initiale.
Au fur et à mesure que les projets Tsuji grandissent en complexité (passant de 20 nœuds à plus de 200 nœuds par scène), l'espace de travail devient saturé de câbles, rendant la maintenance et la lisibilité difficiles (*spaghetti graph*).

---

## 2. Architecture des Nœuds Composés (`GroupNodeDefinition`)

Un sous-graphe est un graphe indépendant encapsulé à l'intérieur d'un seul nœud visible dans le graphe parent.

```
[Graphe Principal]
  ┌───────────────┐
  │  Time Node    │───┐
  └───────────────┘   │ (value)
                      ▼
              ┌───────────────────────────┐
              │   NŒUD GROUPE : "Vague"   │
              │  ┌─────────────────────┐  │
              │  │ GroupInput [time]   │  │
              │  │         │           │  │
              │  │         ▼           │  │
              │  │ [Math / Sin / Array]│  │
              │  │         │           │  │
              │  │         ▼           │  │
              │  │ GroupOutput [geom]  │  │
              │  └─────────────────────┘  │
              └─────────────┬─────────────┘
                            │ (geometry)
                            ▼
              ┌───────────────────────────┐
              │      Render Node          │
              └───────────────────────────┘
```

### 2.1 Spécification des Nouveaux Types
```typescript
export interface SubgraphDefinition {
  id: string;
  name: string;
  graph: Graph; // Graphe interne
  exposedInputs: { internalNodeId: string; internalSocketId: string; label: string; type: SocketType }[];
  exposedOutputs: { internalNodeId: string; internalSocketId: string; label: string; type: SocketType }[];
}
```

### 2.2 Évaluation Hiérarchique
Lors de l'évaluation topologique dans `evaluateGraph()` :
- Lorsqu'un nœud de type `structure/group` est rencontré, l'évaluateur injecte les entrées externes dans le sous-graphe, exécute un `evaluateGraph` récursif isolé avec son propre `EvalContext`, et propage les sorties du sous-graphe vers le graphe parent.

---

## 3. Fonctionnalités Associées
1. **Bibliothèque de Préréglages Utilisateur (*User Presets / Assets Library*)** : Possibilité d'exporter un groupe sous forme de fichier `.tsujigroup` réutilisable d'un projet à l'autre.
2. **Double-clic pour Plonger (*Dive into Subgraph*)** : L'interface de `GraphEditor.tsx` s'ouvre sur le sous-graphe avec un fil d'Ariane (*Breadcrumb*) de navigation.

---

## 🔗 Notes Associées
- [[Node Graph Theory and Evaluation Models]]
- [[Graph Editor and Canvas]]
- [[Node Creation Guide]]

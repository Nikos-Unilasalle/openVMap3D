# Évolution : Schéma de Définition des Groupes & Ports Exposés

*Domaine : Modularité du Graphe de Nœuds*

---

## 1. Objectif
Permettre l'encapsulation d'un sous-arbre de nœuds au sein d'un nœud unique (`structure/group`) dont les prises d'entrée et de sortie sont sélectionnées et renommées par l'utilisateur.

---

## 2. Spécification des Structures de Données
```typescript
export interface ExposedPort {
  id: string;
  label: string;
  type: SocketType;
  internalNodeId: string;
  internalSocketId: string;
}

export interface GroupNodeInstance extends NodeInstance {
  type: "structure/group";
  subgraph: Graph;
  exposedInputs: ExposedPort[];
  exposedOutputs: ExposedPort[];
}
```

---

## 🔗 Notes Associées
- [[Hierarchical Subgraph Evaluation Runtime]]
- [[User Preset Export and .tsujigroup Library]]

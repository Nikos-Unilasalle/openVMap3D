# FLAW-02 : Pression GC & Surcoût d'Allocations dans la Boucle d'Évaluation 60 FPS

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU (Priorité P1)**  
> Ce problème a été intégralement corrigé dans [`src/shared/graph/evaluate.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/evaluate.ts).  
> La boucle d'évaluation opère désormais en mode Zéro-Allocation via `GraphStructuralCache`, indexation $\mathcal{O}(1)$ des sockets, `WeakMap` de paramètres et **Object Pooling** de `connectedInputs` / `inputSources`.  
> 🔗 *Plan de remédiation & détails :* [[P1_Evaluation_Loop_GC_Remediation_Plan]].

*Gravité initiale : 🟠 MAJEURE*  
*Fichiers Concernés : `src/shared/graph/evaluate.ts`*

---

## 1. Description de la Faille Initiale

La fonction `evaluateGraph()` est invoquée à chaque trame de rendu (soit 60 à 120 fois par seconde).  
L'analyse de la boucle d'exécution montrait la création répétée de milliers de structures d'objets temporaires éphémères (`new Map()`, `new Set()`, filtres de connexions $\mathcal{O}(E)$, inspections `instanceof` répétées).

---

## 2. Conséquences Initiales

- Pour un graphe de 50 nœuds à 60 fps :
  - Plus de **15\,000 objets JavaScript éphémères** étaient créés chaque seconde dans la *Young Space* du moteur V8.
  - Cela déclenchait des cycles fréquents de Garbage Collection (GC Scavenge et Major Mark-Sweep) provoquant des micro-saccades (*jank* / micro-stutters) de 15 à 45 ms.

---

## 3. Correctif Appliqué (Résolution P1)

1. **`GraphStructuralCache` & Indexation $\mathcal{O}(1)$** :
   - Mise en cache de l'ordre topologique, de `nodesById`, de `connectionsByToNode` et de `connectionByToNodeSocket` sur la référence du graphe.
   - Les recherches de connexions par port se font en temps constant $\mathcal{O}(1)$.
2. **Object Pooling pour `connectedInputs` & `inputSources`** :
   - Réutilisation d'instances persistantes vidées avec `.clear()` pour chaque nœud, éliminant 6 000 instanciations / seconde.
3. **WeakMap pour les Clés Mutables de `defaultParams`** :
   - Caching de la liste des clés `Vector3`, `Color`, `Euler` à cloner par définition de nœud.

---

## 🔗 Notes Associées
- [[P1_Evaluation_Loop_GC_Remediation_Plan]]
- [[Object Pooling in 60 FPS Render Loops]]
- [[Graph Evaluation Runtime]]
- [[Browser Memory Management, Caching and WebGL Performance]]

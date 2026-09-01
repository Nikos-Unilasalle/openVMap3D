# Plan d'Action & Spécification Corrective : P2 — Intégrité d'Appropriation Géométrique & Robustesse du Clonage

*Domaine : Rendu de Scène 3D (`sceneRoots.ts`), Undo/Redo & Clonage de Graphe (`cloneGraph.ts`)*  
*Priorité : 🟡 P2 (Moyenne à Haute)*

---

## 1. Contexte & Diagnostic des Failles

### 1.1 FLAW-03 : Angle Mort d'Appropriation sur les Listes (`sceneRoots.ts`)
Dans `src/shared/graph/sceneRoots.ts`, la fonction `isOwnedDownstream()` vérifie l'appropriation (`owns: true`) uniquement sur un saut direct (1-hop).  
Lorsqu'un maillage source (ex: `Box`) est branché dans un `List Group`, puis que la sortie `list` est envoyée à un générateur (`Spawn`, `Spawn Points`, `Array`), le `List Group` ne réclame pas d'appropriation directe de la géométrie mais agit comme un conteneur/passe-plat. En conséquence, l'objet source reste considéré comme racine de scène et est dessiné en double sur la scène 3D.

### 1.2 FLAW-04 : Vulnérabilité du Fast-Path dans `cloneGraph.ts`
Dans `src/shared/graph/cloneGraph.ts:37-40`, le fast-path de clonage des tableaux vérifie uniquement le type du premier élément (`typeof value[0] !== "object"`).  
Si un tableau débute par un `null` ou un nombre mais contient ensuite des instances `THREE.Vector3` ou des objets de configuration, l'ensemble du tableau subit une copie superficielle (`value.slice()`), partageant des références mutables en mémoire lors des snapshots Undo/Redo.

---

## 2. Spécification Technique des Correctifs

### 2.1 Propagation Multi-Hop de l'Appropriation dans `sceneRoots.ts`
```typescript
function isOwnedDownstream(
  graph: Graph,
  registry: NodeRegistry,
  nodeId: string,
  visited = new Set<string>()
): boolean {
  if (visited.has(nodeId)) return false;
  visited.add(nodeId);

  return graph.connections.some((connection) => {
    if (connection.fromNode !== nodeId) return false;
    const consumer = graph.nodes.find((n) => n.id === connection.toNode);
    const consumerDef = consumer ? registry.get(consumer.type) : undefined;
    if (!consumerDef) return false;
    const socket = inputSocketsOf(consumerDef, graph, connection.toNode).find((s) => s.id === connection.toSocket);
    if (!socket) return false;

    // Prise en charge directe :
    if (socket.owns) return true;

    // Propagation à travers les nœuds de regroupement/routage (List Group, Reroute) :
    if (consumerDef.category === "list" || consumerDef.type === "utility/reroute") {
      return isOwnedDownstream(graph, registry, consumer.id, visited);
    }

    return false;
  });
}
```

### 2.2 Sécurisation du Clonage de Tableaux dans `cloneGraph.ts`
Remplacement de l'inspection partielle `value[0]` par :
1. Support natif des typed arrays (`ArrayBuffer.isView(value)` $\rightarrow$ `value.slice()`).
2. Parcours rapide linéaire vérifiant l'absence totale d'objets (`hasObjects`) avant d'opter pour `value.slice()` ou `value.map(cloneParamValue)`.

---

## 3. Plan de Test & Validation

1. **Nouveaux Tests Unitaires `sceneRoots.test.ts`** :
   - Valider qu'un `Box` connecté à un `List Group` connecté à un `Merge` ou `Spawner` n'est plus racine de scène.
2. **Nouveaux Tests Unitaires `cloneGraph.test.ts`** :
   - Valider le clonage profond d'un tableau mixte `[null, new THREE.Vector3(1, 2, 3)]` et de tableaux typés `Float32Array`.
3. **Suite Complète Vitest & TypeScript** :
   - `npm test` & `npx tsc --noEmit`.

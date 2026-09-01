# Évolution : Cycle de Vie des Ressources & Garbage Collector GPU

*Domaine : Gestion Mémoire, Robustesse & Prévention des Fuites VRAM*

---

## 1. Diagnostic de la Dette Technique Actuelle

Dans le code source actuel (`src/shared/graph/nodes/object.ts`, `nodeCaches.ts`, `NODE_AUTHORING.md`), les nœuds qui génèrent des maillages ou des textures utilisent des caches globaux de module :

```typescript
// Exemple dans object.ts / NODE_AUTHORING.md :
const myCache = new Map<string, THREE.Mesh>();
// Note du code source : "the cache has no delete-node cleanup yet"
```

### Problème Identifié :
- Lorsqu'un utilisateur supprime un nœud dans l'éditeur de graphe (`GraphEditor.tsx`), l'instance `NodeInstance` disparaît de la structure de données `Graph.nodes`.
- Cependant, l'objet `THREE.Mesh`, sa géométrie `THREE.BufferGeometry` et ses matériaux restent référencés dans la `Map` interne du module.
- **Conséquence** : Dans une longue session de création où l'utilisateur ajoute et supprime des dizaines de nœuds, la mémoire VRAM s'accumule indéfiniment jusqu'au crash du navigateur ou de l'application.

---

## 2. Solution Architecturale : Le Registre de Cycle de Vie Centralisé

```
┌────────────────────────────────────────────────────────┐
│             ResourceLifecycleManager                   │
├────────────────────────────────────────────────────────┤
│ - activeNodeIds: Set<string>                           │
│ - registry: Map<nodeId, DisposableResource[]>          │
│ - gcInterval: Nettoyage automatique au diff de graphe │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
[Nœud Présent dans le Graphe]   [Nœud Supprimé du Graphe]
- Maintien du cache GPU         - Appel récursif resource.dispose()
                                - Libération immédiate de la VRAM
```

### 2.1 Implémentation du Gestionnaire de Ressources (`src/shared/graph/resourceManager.ts`)

```typescript
export interface DisposableResource {
  dispose: () => void;
}

class ResourceLifecycleManager {
  private resources = new Map<string, DisposableResource[]>();

  public register(nodeId: string, resource: DisposableResource): void {
    const list = this.resources.get(nodeId) || [];
    list.push(resource);
    this.resources.set(nodeId, list);
  }

  /** Exécuté automatiquement par App.tsx après chaque modification du graphe */
  public sweep(currentGraphNodes: NodeInstance[]): void {
    const activeIds = new Set(currentGraphNodes.map((n) => n.id));
    for (const [nodeId, list] of this.resources.entries()) {
      if (!activeIds.has(nodeId)) {
        // Le nœud a été supprimé : libérer toutes ses ressources GPU
        for (const res of list) {
          try {
            res.dispose();
          } catch (e) {
            console.error(`Erreur lors de la libération du nœud ${nodeId}:`, e);
          }
        }
        this.resources.delete(nodeId);
      }
    }
  }
}

export const globalResourceManager = new ResourceLifecycleManager();
```

### 2.2 Utilisation par `FinalizationRegistry` et `WeakRef`
En complément du sweep explicite, l'intégration de l'API JavaScript standard `FinalizationRegistry` permet de détecter automatiquement les instances de graphes orphelines pour déclencher les appels `.dispose()` sur le contexte WebGL.

---

## 3. Bénéfices
- Élimination garantie à 100% des fuites de mémoire VRAM lors de l'édition.
- Stabilité exemplaire pour les installations permanentes fonctionnant 24h/24 et 7j/7.

---

## 🔗 Notes Associées
- [[ThreeJS Optimization and Performance Guide]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[State Management and Multi-Canvas]]

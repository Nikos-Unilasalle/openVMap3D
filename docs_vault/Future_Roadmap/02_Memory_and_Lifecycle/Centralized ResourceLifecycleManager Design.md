# Évolution : Gestionnaire Centralisé de Cycle de Vie (`ResourceLifecycleManager`)

*Domaine : Gestion Mémoire & Élimination des Fuites VRAM*

---

## 1. Objectif
Remplacer les caches locaux dispersés par un gestionnaire centralisé déclenchant la destruction des ressources GPU (`.dispose()`) au moment exact de la suppression d'un nœud dans l'éditeur.

> [!NOTE]
> **Jalon 1 Réalisé (P0) :** Tous les caches de nœuds 3D ont été migrés vers `createNodeCache(disposeObject3D)`. Le `ResourceLifecycleManager` représente l'étape d'unification avec `FinalizationRegistry`. $\rightarrow$ [[P0_VRAM_Leak_Remediation_Plan]].

---

## 2. Interface du Service
```typescript
export interface DisposableResource {
  dispose: () => void;
}

export class ResourceLifecycleManager {
  private resources = new Map<string, DisposableResource[]>();

  public register(nodeId: string, resource: DisposableResource): void;
  public sweep(activeNodeIds: Set<string>): void;
  public disposeAll(): void;
}
```

---

## 🔗 Notes Associées
- [[FLAW-01_GPU Memory Leaks and Unmanaged Node Caches]]
- [[FinalizationRegistry and WeakRef Tracking]]
- [[RenderTarget and Buffer Pooling System]]

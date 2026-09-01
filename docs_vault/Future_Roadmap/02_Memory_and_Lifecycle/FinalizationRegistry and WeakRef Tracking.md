# Évolution : Nettoyage Automatique via `FinalizationRegistry` & `WeakRef`

*Domaine : Sécurité Mémoire Automatisée*

---

## 1. Objectif
Utiliser l'API JavaScript `FinalizationRegistry` pour attacher un callback de nettoyage automatique lorsqu'une instance de nœud ou de graphe est détruite par le ramasse-miettes, en tant que filet de sécurité contre les oublis d'appels manuels à `.dispose()`.

---

## 2. Implémentation
```typescript
const gpuFinalizer = new FinalizationRegistry((cleanup: () => void) => {
  try {
    cleanup();
  } catch (err) {
    console.warn("Échec du nettoyage automatique de ressource GPU:", err);
  }
});

export function trackGPUObject(target: object, disposer: () => void): void {
  gpuFinalizer.register(target, disposer);
}
```

---

## 🔗 Notes Associées
- [[Centralized ResourceLifecycleManager Design]]
- [[RenderTarget and Buffer Pooling System]]

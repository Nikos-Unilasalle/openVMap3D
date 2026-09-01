# Stratégies de Réduction des Draw Calls

*Domaine : Optimisation Three.js & Performance CPU-GPU*

---

## 1. La Problématique du Draw Call
Un *draw call* est une commande émise par le processeur (CPU) vers le processeur graphique (GPU) pour dessiner un groupe de polygones partageant le même état (shaders, textures, buffers).
- **Le goulot d'étranglement** : Chaque appel induit un surcoût de validation de pilote et de synchronisation CPU/GPU.
- **Budget cible 60 fps** : Maintenir le nombre total d'appels sous le seuil critique de **$\le 100$ par frame** (`renderer.info.render.calls`).

---

## 2. Les 3 Voies de Réduction des Appels

```
                  ┌─────────────────────────────────────────┐
                  │ Type de Géométrie et Nature de l'Objet  │
                  └────────────────────┬────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
[Géométries Identiques]      [Géométries Hétérogènes]       [Objets Statiques Fixes]
         │                             │                             │
         ▼                             ▼                             ▼
[[InstancedMesh Usage and Best Practices]] [[BatchedMesh Usage and Tradeoffs]] `BufferGeometryUtils.merge`
```

1. **Objets Multiples Identiques** : Utiliser [[InstancedMesh Usage and Best Practices]] pour dessiner des milliers d'instances en un seul appel.
2. **Objets Multiples Distincts** : Utiliser [[BatchedMesh Usage and Tradeoffs]] lorsque les objets partagent un même matériau.
3. **Objets Statiques Non Animés** : Fusionner les géométries fixes via `BufferGeometryUtils.mergeGeometries()`.

---

## 🔗 Notes Associées
- [[InstancedMesh Usage and Best Practices]]
- [[BatchedMesh Usage and Tradeoffs]]
- [[Shader Prewarming and Async Compilation]]
- [[Matrix Auto-Update Optimization]]

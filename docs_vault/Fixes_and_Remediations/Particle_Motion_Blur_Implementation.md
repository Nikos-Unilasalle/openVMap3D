# Spécification Technique & Correctif : Motion Blur sur les Particules & Préservation de la Visibilité

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU & VALIDÉ**  
> • Support complet du Motion Blur pour `InstancedMesh` (cubes de particules), `THREE.Points` (particules simples & nuages de points) et `THREE.Mesh`.  
> • **Préservation stricte de la visibilité (`isEffectivelyVisible`)** : les objets masqués (case `Visible` décochée ou parent masqué) sont rigoureusement ignorés lors de la passe de vélocité et ne sont jamais réactivés ou forcés à `visible = true`.

*Domaine : Post-Processing (`motionBlur.ts`), Rendu 3D*  
*Auteur : Tsuji Core Engineering*

---

## 1. Diagnostic du Problème de Visibilité

Lors de l'isolation des passes de rendu dans `motionBlur.ts`, la boucle de balayage de la scène (`scene.traverse`) collectait les maillages sans vérifier si `object.visible` était `false`.
- Par la suite, lors de la restauration post-passe (`for (const m of meshes) m.visible = true;`), la propriété `visible` de tous les maillages collectés était réinitialisée à `true`, écrasant la désactivation de visibilité choisie par l'utilisateur (comme le cube ou la sphère masqués visibles sur la capture).

---

## 2. Correctif Appliqué

- **Fonction de garde `isEffectivelyVisible(object)`** : remonte la hiérarchie parentale de l'objet pour s'assurer que ni l'objet ni aucun de ses ancêtres n'a `visible: false`.
- **Filtrage amont immédiat** : tout objet masqué est instantanément ignoré au début de `scene.traverse`, n'est ajouté à aucune liste de passe et sa propriété `visible` n'est jamais altérée.

---

## 3. Validation & Tests

- **Tests Vitest** : 1740 tests validés sur 133 suites.
- **Typecheck TypeScript** : 0 erreur.

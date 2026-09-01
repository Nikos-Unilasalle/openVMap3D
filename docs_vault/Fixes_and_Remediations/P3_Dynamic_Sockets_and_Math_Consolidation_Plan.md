# Plan d'Action & Spécification Corrective : P3 — Sockets Dynamiques & Consolidation Mathématique

*Domaine : UI / Écran Graphe (`GraphEditor.tsx`), Purge de Connexions (`pruneConnections.ts`), Robustesse Mathématique*  
*Priorité : 🔵 P3 (Ergonomie, Robustesse & Nettoyage)*

---

## 1. Contexte & Diagnostic des Failles

### 1.1 FLAW-06 : Fils Fantômes Résiduels lors de la Rétractation de Sockets Dynamiques
Dans `src/windows/GraphEditor.tsx`, lorsqu'un socket dynamique se rétracte (ex: suppression d'une connexion intermédiaire sur un `Merge` ou `List Group`), les connexions pointant vers des ports devenus inexistants ne sont pas immédiatement épurées du tableau `edges`, ce qui peut laisser des références orphelines dans l'état du graphe.

### 1.2 FLAW-07 : Redondances de Calculs Mathématiques & Sécurisation des Sockets d'Angles
- Des solveurs de Bézier cubique et des fonctions d'atténuation sont disséminés.
- Les conventions d'angles (degrés $\leftrightarrow$ radians) bénéficient des tests stricts `angleUnits.test.ts` et `angleParams.test.ts` qui doivent être complétés pour tout nouveau nœud.

---

## 2. Spécification Technique des Correctifs

### 2.1 Nettoyage Automatique des Fils Orphelins dans `GraphEditor.tsx`
Dans `onEdgesDelete` et `commit()` de `GraphEditor.tsx`, après le rafraîchissement des sockets dynamiques (`refreshDynamicSockets`), filtrer automatiquement les arêtes dont le `sourceHandle` n'appartient plus aux sorties du nœud source ou dont le `targetHandle` n'appartient plus aux entrées du nœud cible.

### 2.2 Extension de `pruneDanglingConnections.ts`
Garantir que `pruneDanglingConnections(graph, registry)` est idempotente et préserve les métadonnées de graphe tout en journalisant les suppressions de fils obsolètes.

---

## 3. Plan de Test & Validation

1. **Tests Unitaires `pruneConnections.test.ts`** :
   - Tester l'élimination de connexions pointant vers des index dynamiques obsolètes.
2. **Suite Complète Vitest & TypeScript** :
   - `npm test` & `npx tsc --noEmit`.

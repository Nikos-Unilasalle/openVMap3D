# Spécification Technique & Plan d'Implémentation : Gizmo Force Field & Pivot Visuel ("Show Pivot")

> [!SUCCESS]
> **Statut : 🟢 RÉSOLU & VALIDÉ**  
> • Gizmo 3D interactif implémenté pour `particles/force-field` dans [`Viewport.tsx`](file:///Users/nikos/Desktop/tsuji/src/shared/three/Viewport.tsx) et [`gizmoWriteback.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/three/gizmoWriteback.ts).  
> • **Entrée `matrix` ajoutée aux Force Fields** ([`forceField.ts`](file:///Users/nikos/Desktop/tsuji/src/shared/graph/nodes/forceField.ts)) permettant d'animer, déplacer et parenter le champ de force à n'importe quel objet ou transformation amont.  
> • Option checkbox `showPivot: boolean` et décalage vectoriel `pivot: Vector3` keyframable ajoutés à toutes les primitives et chargeurs d'objets (`object.ts`, `curve.ts`, `objLoader.ts`, `gltfLoader.ts`, `transform.ts`).  
> • Helper visuel en croix jaune lumineuse (`0xffe600`) affiché avec `depthTest: false` et `renderOrder = 99999` pour être toujours visible au-dessus de la géométrie.

*Domaine : 3D Viewport (`Viewport.tsx`), Gizmos & Contrôles Interactifs (`gizmoWriteback.ts`), Paramètres Objets & Primitives (`object.ts`, `transform.ts`, `curve.ts`, `objLoader.ts`, `gltfLoader.ts`)*  
*Auteur : Tsuji Core Engineering*

---

## 1. Contexte & Besoins Utilisateur

### 1.1 Gizmo Interactif & Entrée Matrice pour les Nœuds Force Field (`particles/force-field`)
Les champs de force (`particles/force-field`) pilotent la vélocité et les mouvements des particules (attracteur, répulseur, vortex, vent, turbulence).
- **Entrée `matrix` :** Permet de câbler une transformation amont (ex: un objet mobile, un `Transform`, une caméra ou un `Empty`) pour déplacer et orienter dynamiquement le champ de force. La position est transformée par `applyMatrix4(matrix)` et l'axe par `transformDirection(matrix)`.
- **Gizmo Viewport :** Helper 3D visuel interactif dans le viewport (`forceFieldProxy`) avec anneaux et flèche directionnelle, raccordé à `TransformControls` pour déplacer la position (`position`) et orienter l'axe (`axis`) à la souris, avec enregistrement des keyframes.

### 1.2 Option "Show Pivot" & Vecteur de Position / Pivot pour Tous les Objets
Tous les objets de la scène (maillages, courbes, nuages de points, OBJ, GLTF, PLY, SVG, textes, primitives) disposent désormais de :
1. Une option checkbox `showPivot: boolean` ("Show Pivot").
2. Un paramètre vectoriel `pivot: Vector3` (décalage du centre de pivot), keyframable.
3. Un indicateur visuel dans le viewport : **une petite croix jaune (`0xffe600`)** rendue avec `depthTest: false` / `renderOrder: 99999` pour passer toujours **au-dessus** de la géométrie et rester visible en toutes circonstances.

---

## 2. Validation & Tests

- **Tests Unitaires Vitest** : 1739 tests réussis sur 133 suites.
- **Typecheck TypeScript** : 0 erreur (`tsc --noEmit`).

# Optimisation des Shadow Maps & Ombres Portées

*Domaine : Ombres Dynamiques, Passes de Profondeur & Frustums de Lumière*

---

## 1. Coût des Shadow Maps
Chaque lumière générant des ombres exécute une passe de rendu supplémentaire de toute la scène depuis son point de vue pour générer sa carte de profondeur.

---

## 2. Règles d'Optimisation

1. **Désactivation de la Mise à Jour Continue** :
   ```typescript
   renderer.shadowMap.autoUpdate = false;
   // Mettre à jour uniquement lorsque les objets bougent :
   renderer.shadowMap.needsUpdate = true;
   ```
2. **Frustum de Caméra d'Ombre Serré** :
   Ajuster `light.shadow.camera.left`, `right`, `top`, `bottom` strictement autour de la zone utile pour ne pas gaspiller la résolution des pixels d'ombre.
3. **Résolutions Adaptées** : $1024 \times 1024$ pour la lumière principale (Key Light), $512 \times 512$ pour les lumières secondaires (Fill Lights).

---

## 🔗 Notes Associées
- [[Draw Call Reduction Strategies]]
- [[Frustum Culling and Bounding Volumes]]

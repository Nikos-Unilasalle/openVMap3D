# Advanced Instancing and Attribute-Driven Shading

*Domaine : Rendu Massif, InstancedMesh, Attributs de Sommets Personnalisés & Interaction GPU*

Ce document détaille les architectures d'instanciation avancée sous Three.js issues des démonstrations les plus performantes (Matrices de particules 50k, Miroirs disco facettés sur normales, Chute de feuilles et végétation interactive) et leur application dans le moteur de composition **Tsuji**.

---

## 1. Au-Delà de la Matrice de Transformation Simple

Dans une utilisation basique de `THREE.InstancedMesh`, seules les matrices `instanceMatrix` et éventuellement `instanceColor` sont exploitées. Les démos modernes étendent ce principe avec des **InstancedBufferAttribute** personnalisés :

```
[BufferGeometry Unique]
   ├── Attributs Partagés : position, normal, uv
   └── Attributs par Instance :
         ├── aInstanceMatrix (mat4, standard)
         ├── aInstanceColor  (vec3, standard)
         ├── aPhaseOffset    (float, déphasage d'animation)
         ├── aTargetPosition (vec3, interpolation morphing)
         └── aLifeState      (vec2, âge / vitesse d'oscillation)
```

---

## 2. Instanciation Facettée sur Normales (Matcap Disco / Crystal)

Inspiré du composant *Matcap Instanced Disco Geometry*, cette technique remplace un maillage lourd à millions de facettes par :
1. Une géométrie de facette élémentaire (petit miroir carré ou hexagonal).
2. Un `InstancedMesh` dont chaque instance est orientée selon le repère de Frenet / normale de chaque sommet d'un maillage de référence.

### Calcul de la Matrice d'Orientation par Instance :

```typescript
const dummy = new THREE.Object3D();
const surfacePositions = baseGeometry.attributes.position;
const surfaceNormals = baseGeometry.attributes.normal;

for (let i = 0; i < count; i++) {
  const pos = new THREE.Vector3(
    surfacePositions.getX(i),
    surfacePositions.getY(i),
    surfacePositions.getZ(i)
  );
  const norm = new THREE.Vector3(
    surfaceNormals.getX(i),
    surfaceNormals.getY(i),
    surfaceNormals.getZ(i)
  );

  dummy.position.copy(pos);
  dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), norm);
  dummy.updateMatrix();
  instancedMesh.setMatrixAt(i, dummy.matrix);
}
instancedMesh.instanceMatrix.needsUpdate = true;
```

---

## 3. Matrice de Particules Conduite par Texture Canvas (Image-to-Instance)

Pour animer des nuages de $50\,000$ à $100\,000$ micro-cubes formant une image ou une vidéo (ex: *Scroll-Driven Particle Image Matrix*) :
1. Les pixels d'une image source sont lus via un `OffscreenCanvas` ou transmis comme `DataTexture` flottante.
2. Chaque instance lit sa couleur cible et son décalage spatial en fonction de ses coordonnées UV de grille $(i_x / W, i_y / H)$.
3. Le vertex shader calcule la trajectoire de dispersion vers la convergence finale sans aucune charge CPU par frame.

```glsl
// Vertex Shader Injection
attribute vec3 aTargetPosition;
attribute float aRandomDelay;
uniform float uScrollProgress; // 0.0 (dispersé) -> 1.0 (aligné)

void main() {
    float t = clamp((uScrollProgress - aRandomDelay) / 0.6, 0.0, 1.0);
    float easeT = smoothstep(0.0, 1.0, t);
    
    vec3 animatedPos = mix(position, aTargetPosition, easeT);
    vec4 worldPosition = instanceMatrix * vec4(animatedPos, 1.0);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
```

---

## 4. Végétation & Feuilles Interactives (Wind Sway & Raycast Impulse)

Pour les scènes d'environnements vivants (arbres aux feuilles tombantes, herbe ondulante) :
- **Vent Procédural** : Calculé dans le Vertex Shader via une onde sinusoïdale 3D déphasée par instance (`aPhaseOffset`).
- **Décrochage & Chute** : Un état binaire par instance active un mouvement balistique de chute avec rotation aléatoire (`aVelocity`, `aAngularVelocity`).

---

## 5. Intégration dans Tsuji

- Optimisation du nœud `instance/array` et `structure/spawn` avec support des attributs personnalisés.
- Nouveau nœud `instance/texture_sampler` : lit une texture ou vidéo et pilote la couleur, la position Z et l'échelle de milliers d'instances en temps réel.
- Nouveau nœud `instance/normal_orient` : aligne automatiquement des milliers d'instances sur les normales d'une géométrie hôte.

---

## 🔗 Notes Associées
- [[InstancedMesh Usage and Best Practices]]
- [[BatchedMesh Usage and Tradeoffs]]
- [[Draw Call Reduction Strategies]]
- [[ShaderFX Nodes and Transition Pipeline]]

# Protocole Récursif de Nettoyage Mémoire Three.js

*Domaine : Implémentation Pratique & Fonctions Utilitaires de Libération*

---

## 1. Fonction Standard de Nettoyage Récursif d'Arborescence

```typescript
export function disposeThreeHierarchy(root: THREE.Object3D): void {
  root.traverse((object) => {
    // 1. Libération de la géométrie du maillage
    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }

      // 2. Libération du matériau et de ses textures associées
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(disposeSingleMaterial);
        } else {
          disposeSingleMaterial(mesh.material);
        }
      }
    }
  });
}

function disposeSingleMaterial(material: THREE.Material): void {
  // Parcours dynamique de toutes les propriétés du matériau pour repérer les textures
  Object.keys(material).forEach((propName) => {
    const value = (material as any)[propName];
    if (value && typeof value === "object" && typeof value.dispose === "function") {
      value.dispose(); // Libère map, normalMap, roughnessMap, alphaMap, envMap...
      
      // Gestion spécifique des ImageBitmap (GLTF)
      if (value.source && value.source.data && typeof value.source.data.close === "function") {
        value.source.data.close();
      }
    }
  });
  material.dispose();
}
```

---

## 🔗 Notes Associées
- [[GPU Memory and VRAM Leak Prevention]]
- [[Browser Memory Management, Caching and WebGL Performance]]
- [[Resource Lifecycle and Cache Garbage Collection]]

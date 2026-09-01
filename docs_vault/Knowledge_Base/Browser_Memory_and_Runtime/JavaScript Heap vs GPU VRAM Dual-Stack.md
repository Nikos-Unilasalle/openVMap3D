# Dualité Mémoire : Heap JavaScript (CPU) vs. VRAM Pilote (GPU)

*Domaine : Architecture Navigateur & Modèle Mémoire WebGL*

---

## 1. Deux Espaces Mémoire Isolés
1. **Le Heap JavaScript (CPU)** :
   - Contient les structures de données JS, les instances de classes Three.js, les arbres DOM et l'état React.
   - Entièrement géré et nettoyé par le ramasse-miettes (Garbage Collector).
2. **La Mémoire Pilote GPU (VRAM)** :
   - Contient les textures matérielles, les tampons de sommets (VBO), les framebuffers et les shaders compilés.
   - **Totalement invisible et inaccessible au Garbage Collector**. Seul un appel explicite à `.dispose()` envoie la commande de destruction WebGL (`gl.deleteBuffer`, `gl.deleteTexture`).

---

## 2. Conséquence Fondamentale
Déréférencer un objet Three.js en JS (`mesh = null`) libère l'objet du Heap JS mais laisse la VRAM allouée sur le GPU. Le nettoyage manuel est impératif.

---

## 🔗 Notes Associées
- [[Garbage Collection Pauses and Mitigation]]
- [[Object Pooling in 60 FPS Render Loops]]
- [[GPU Memory and VRAM Leak Prevention]]

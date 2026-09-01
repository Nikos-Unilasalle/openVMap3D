# Programmation GLSL Branchless & Optimisation Shaders

*Domaine : Architecture SIMD GPU & Écriture de Shaders Performants*

---

## 1. Pourquoi Éviter les `if/else` Dynamiques en GLSL
Les cœurs de calcul GPU exécutent les threads par groupes (appelés *Warps* sur Nvidia ou *Wavefronts* sur AMD).
- Si au sein d'un même groupe de 32 threads, certains prennent la branche `if` et d'autres la branche `else` (*divergence de branchement*), **le GPU exécute les deux branches pour tous les threads**, en masquant les résultats inutiles.
- Le temps d'exécution devient égal à la somme de `if` + `else`.

---

## 2. Remplacement par Fonctions Mathématiques Vectorielles
Remplacer les conditions dynamiques par les fonctions intrinsèques matérielles :
- `step(edge, x)`
- `smoothstep(edge0, edge1, x)`
- `mix(a, b, t)`
- `clamp(x, minVal, maxVal)`

---

## 🔗 Notes Associées
- [[Early-Z and Depth Pre-Pass Techniques]]
- [[WebGPU Architecture and TSL Shaders]]

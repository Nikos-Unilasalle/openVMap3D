# Post-Processing : Fusion en Uber-Shader (`pmndrs/postprocessing`)

*Domaine : Passes de Traitement d'Image Plein Écran & Framebuffer Swaps*

---

## 1. La Surcharge du `EffectComposer` Standard
Avec `EffectComposer`, chaque effet (Bloom $\rightarrow$ Vignette $\rightarrow$ Film Grain $\rightarrow$ Tone Mapping) exécute une passe plein écran séparée :
- 4 effets = 4 lectures en mémoire et 4 écritures dans des framebuffers temporaires, saturant la bande passante VRAM.

---

## 2. La Solution par Compilation Fusionnée
La bibliothèque [`pmndrs/postprocessing`](https://github.com/pmndrs/postprocessing) fusionne l'ensemble des effets compatibles au sein d'un **unique shader de post-traitement** (*Uber-Shader*).
- **Gain** : Réduction drastique des changements de cibles de rendu ($4 \text{ passes} \rightarrow 1 \text{ passe}$).

---

## 🔗 Notes Associées
- [[Early-Z and Depth Pre-Pass Techniques]]
- [[Overdraw Reduction and Pixel Ratio Capping]]

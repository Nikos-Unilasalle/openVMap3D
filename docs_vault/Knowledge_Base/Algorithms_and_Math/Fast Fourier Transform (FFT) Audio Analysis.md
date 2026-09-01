# Analyse Audio Spectrale par Transformée de Fourier Rapide (FFT)

*Domaine : Traitement Numérique du Signal & Visualisation Audio-Réactive*

---

## 1. Principe de la FFT
La FFT transforme un signal temporel discret $x[n]$ en son spectre de fréquences $X[k]$ :
$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j 2\pi k n / N}$$

- **Taille de fenêtre ($N$)** : Typiquement 512, 1024 ou 2048 échantillons.
- **Extraction par Bandes** : Les composantes fréquentielles sont découpées en bandes logarithmiques (Sub-bass, Bass, Low-mid, High-mid, Treble) adaptées à l'oreille humaine pour animer des propriétés 3D (échelle, couleurs, forces).

---

## 🔗 Notes Associées
- [[Audio Transient and Onset Beat Detection]]
- [[Node Catalog]]

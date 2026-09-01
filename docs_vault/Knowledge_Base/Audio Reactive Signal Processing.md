# Audio Reactive Signal Processing

*Domaine : Traitement du Signal Numérique & Visualisation Audio Réactive*

Ce document détaille les algorithmes de traitement audio temps réel permettant de synchroniser des visualisations 3D avec un flux sonore direct ou pré-enregistré.

---

## 1. Transformée de Fourier Rapide (FFT)

La FFT décompose un signal audio temporel discret en ses composantes spectrales fréquentielles :
$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j 2\pi k n / N}$$

- **Taille de fenêtre ($N$)** : Typiquement $512$, $1024$ ou $2048$ échantillons.
- **Résolution Fréquentielle** : $\Delta f = \frac{f_s}{N}$ (où $f_s$ est la fréquence d'échantillonnage, ex: $44.1\text{ kHz}$).
- **Bandes d'Énergie** : Les bins sont groupés logarithmiquement (basses, médiums, aigus) pour correspondre à la perception auditive humaine (échelle de Bark ou de Mel).

---

## 2. Détection de Transitoires & Battements (*Beat / Onset Detection*)

Pour générer des impulsions rythmiques visuelles précises :
1. **Énergie Instantanée** : Calcul de la puissance du signal sur une courte fenêtre temporelle.
2. **Dérivée Spectrale / Flux Spectral** : Mesure de l'augmentation brutale de l'énergie dans les hautes fréquences ou les basses fréquences (kick drum).
3. **Seuil Adaptatif & Détecteur de Front Montant** : Si le flux spectral dépasse la moyenne glissante pondérée d'un facteur dynamique $\alpha$, un événement discret (impulsion booléenne $1$) est émis.

---

## 🔗 Notes Associées
- [[Motion Design and Easing Mathematics]]
- [[Node Catalog]]

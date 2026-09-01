# Détection de Transitoires & Battements Rythmiques (Onset Detection)

*Domaine : Analyse Rythmique & Événements Discrets*

---

## 1. Flux Spectral et Détection de Piques
Pour détecter un coup de caisse claire ou de grosse caisse :
1. Calculer la variation positive d'énergie du spectre entre deux trames audio successives (flux spectral).
2. Appliquer un seuil adaptatif basé sur une moyenne glissante pondérée.
3. Déclencher un front montant (valeur $1$) lors du dépassement du seuil pour piloter les nœuds d'impulsion (`Pulse`, `Trigger`).

---

## 🔗 Notes Associées
- [[Fast Fourier Transform (FFT) Audio Analysis]]
- [[Node Catalog]]

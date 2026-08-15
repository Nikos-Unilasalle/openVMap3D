/**
 * Base de connaissances pour l'assistant interactif de dépannage / diagnostic d'OpenVMap3D
 */
export const DIAGNOSTICS_DATABASE = [
  {
    id: "wire-over-keyframe",
    symptom: "Mes keyframes ne s'animent pas ou le paramètre reste figé",
    category: "Animation & Graphe",
    cause: "Priorité absolue des câbles (Wires Over Keyframes)",
    explanation: "Dans OpenVMap3D, si une entrée est connectée par un câble (wire), la valeur du câble écrase systématiquement les keyframes enregistrées sur ce champ.",
    steps: [
      "Vérifiez si une node (ex: Map Range, Oscillator) est branchée sur l'entrée de votre paramètre.",
      "Si vous souhaitez utiliser vos keyframes manuelles, faites un clic droit sur la prise d'entrée (socket) et sélectionnez 'Disconnect'.",
      "Vérifiez que la couleur du champ passe du bleu/jaune au vert/orange indiquant qu'il est réactif aux keyframes."
    ]
  },
  {
    id: "dlt-high-residual",
    symptom: "La calibration DLT indique une erreur résiduelle élevée (> 5 px) ou la projection dévie",
    category: "Video-Mapping DLT",
    cause: "Mauvais placement des 6 repères physiques ou murs non-orthogonaux",
    explanation: "Le solveur DLT compare les coordonnées 3D théoriques saisies dans la node 'Room Corner' avec les 6 repères ajustés sur l'image projetée.",
    steps: [
      "Vérifiez au mètre ruban les dimensions saisies dans 'Room Corner' (Wall A, Wall B, Height). Une erreur de 10 cm fausse la résolution.",
      "Assurez-vous que les 6 repères ne sont pas tous alignés sur un même plan (la calibration exige une disposition en coin 3D).",
      "Ajustez les poignées 1 à 6 à la souris au pixel près en zoomant sur l'image."
    ]
  },
  {
    id: "audio-no-signal",
    symptom: "La node Microphone Input ou Audio Spectrum n'émet aucun signal (valeurs à zéro)",
    category: "Audio & Entrées",
    cause: "Autorisations de carte son non accordées ou périphérique d'entrée par défaut incorrect",
    explanation: "L'API WebAudio nécessite une autorisation d'accès au microphone système.",
    steps: [
      "Vérifiez si l'entrée 'Active' de la node Microphone Input est bien réglée sur 1.",
      "Accédez aux paramètres du système de votre OS pour vous assurer qu'OpenVMap3D dispose de la permission d'accès au microphone.",
      "Incrémentez la valeur 'Gain' de la node Microphone Input si le volume de votre carte son est faible."
    ]
  },
  {
    id: "shadows-not-showing",
    symptom: "Les ombres portées virtuelles n'apparaissent pas sur la scène",
    category: "Rendu 3D & Ombres",
    cause: "Option Cast Shadow inactive ou lumière sans Shadow Map",
    explanation: "Chaque source lumineuse directionnelle ou spotlight nécessite l'activation explicite du drapeau d'ombre.",
    steps: [
      "Ouvrez le panneau de paramètres de votre lumière (Directional Light ou Spot Light) et cochez 'Cast Shadow'.",
      "Sélectionnez le maillage qui doit projeter l'ombre et assurez-vous que 'Cast Shadow' est activé.",
      "Sélectionnez le maillage récepteur (ex: le mur Room Corner) et vérifiez que 'Receive Shadow' est activé."
    ]
  },
  {
    id: "performance-low-fps",
    symptom: "Baisse de FPS (moins de 60 FPS) ou ralentissement du canevas 3D",
    category: "Performances",
    cause: "Trop de shadow passes, maillage OBJ trop lourd ou post-processing excessif",
    explanation: "Chaque lumière projetant des ombres génère une passe de profondeur GPU supplémentaire par frame.",
    steps: [
      "Limitez le nombre de lumières avec 'Cast Shadow' actif à 2 ou 3 maximum.",
      "Réduisez la subdivision des primitives 3D (ex: segments de Sphères ou Disques).",
      "Si vous utilisez des particules, vérifiez que le mode GPU Computation est bien actif."
    ]
  }
];

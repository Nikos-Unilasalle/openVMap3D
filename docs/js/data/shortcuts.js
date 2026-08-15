/**
 * Matrice des raccourcis clavier d'OpenVMap3D
 */
export const SHORTCUTS_DATABASE = [
  {
    keys: ["Espace"],
    action: "Play / Pause",
    description: "Démarre ou suspend la tête de lecture de l'animation temps réel.",
    category: "lecture"
  },
  {
    keys: ["Cmd", "Espace"],
    action: "Recherche Rapide de Nodes",
    description: "Ouvre le menu de recherche instantanée de nodes à la position du curseur.",
    category: "edition"
  },
  {
    keys: ["k"],
    action: "Keyframe (Ajouter/Supprimer)",
    description: "Pose ou retire une clé d'animation sur la valeur ou l'axe (X, Y, Z) survolé.",
    category: "timeline"
  },
  {
    keys: ["m"],
    action: "Marqueur visuel 1px",
    description: "Ajoute ou supprime un repère temporel vert sous la ligne de lecture.",
    category: "timeline"
  },
  {
    keys: ["Shift", "Clic / Glisser"],
    action: "Sélection Multiple",
    description: "Sélectionne plusieurs nodes dans le canevas ou trace un rectangle de sélection.",
    category: "canvas"
  },
  {
    keys: ["Tab"],
    action: "Masquer / Afficher l'UI 3D",
    description: "Bascule la visibilité de la grille au sol, des gizmos et des repères de lumière.",
    category: "affichage"
  },
  {
    keys: ["Cmd", "Z"],
    action: "Annuler (Undo)",
    description: "Annule la dernière action effectuée sur le graphe (historique 50 étapes).",
    category: "edition"
  },
  {
    keys: ["Cmd", "Shift", "Z"],
    action: "Rétablir (Redo)",
    description: "Rétablit l'action précédemment annulée.",
    category: "edition"
  },
  {
    keys: ["Cmd", "C"],
    action: "Copier la sélection",
    description: "Copie les nodes sélectionnées et leurs câbles internes dans le presse-papier.",
    category: "edition"
  },
  {
    keys: ["Cmd", "V"],
    action: "Coller les nodes",
    description: "Colle les nodes copiées à la position actuelle du curseur.",
    category: "edition"
  },
  {
    keys: ["Cmd", "D"],
    action: "Dupliquer",
    description: "Duplique immédiatement la sélection de nodes.",
    category: "edition"
  },
  {
    keys: ["Suppr"],
    action: "Supprimer",
    description: "Supprime les nodes ou liaisons sélectionnées.",
    category: "edition"
  }
];

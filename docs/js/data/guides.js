/**
 * Base de données enrichie des guides pédagogiques de Tsuji
 */
export const GUIDES_DATABASE = [
  {
    id: "quickstart",
    title: "🚀 Démarrage Rapide & Premier Graphe 3D",
    summary: "Apprenez les bases de la création 3D réactive : ajoutez votre première géométrie, reliez un oscillateur et activez le Bloom GPU.",
    time: "5 min",
    level: "Débutant",
    icon: "rocket",
    content: {
      lead: "Bienvenue dans Tsuji. Ce guide vous accompagne pas-à-pas pour créer votre première scène 3D animée en moins de 5 minutes.",
      sections: [
        {
          title: "1. Le Moteur Réactif (DAG)",
          type: "text",
          body: "Dans Tsuji, tout est piloté par un graphe réactif (Directed Acyclic Graph). Chaque propriété d'un objet (taille, couleur, position) se calcule en direct à 60 images par seconde en fonction des nodes connectées."
        },
        {
          title: "2. Tutoriel Pas-à-Pas : Animer un Cube 3D",
          type: "steps",
          items: [
            {
              number: "1",
              title: "Ouvrir la Recherche Rapide",
              desc: "Dans l'éditeur de graphe, appuyez simultanément sur Cmd + Espace (sur Mac) ou Ctrl + Espace (sur Windows) pour ouvrir le menu de recherche au curseur."
            },
            {
              number: "2",
              title: "Ajouter la Géométrie Box Geometry",
              desc: "Saisissez 'Box' et appuyez sur Entrée. Une node verte 'Box Geometry' apparaît dans votre graphe."
            },
            {
              number: "3",
              title: "Connecter la node Oscillator",
              desc: "Rouvrez la recherche rapide et sélectionnez 'Oscillator'. Glissez un câble réactif entre la prise de sortie 'Value' de l'Oscillator et la prise 'Scale' de la node Transform."
            },
            {
              number: "4",
              title: "Lancer la Lecture Temps Réel",
              desc: "Appuyez sur la touche Espace pour démarrer l'animation. Votre cube s'anime et se dilate automatiquement en rythme !"
            }
          ]
        },
        {
          title: "Conseil de Pro : Activer l'Effet Néon Bloom",
          type: "tip",
          titleTip: "💡 Halo Lumineux Émissif",
          bodyTip: "Pour donner un aspect néon à vos formes 3D, ajoutez la node 'Bloom Effect' de la catégorie Post-Traitement 2D et reliez-la avant le rendu final."
        },
        {
          title: "Aperçu de l'Interface Tsuji",
          type: "image",
          src: "img/videomap.jpg",
          caption: "Capture d'écran réelle de l'interface Tsuji : Éditeur de Graphe de Nodes à gauche et Canva 3D en direct à droite."
        }
      ]
    }
  },
  {
    id: "dlt-calibration",
    title: "📐 Calibration Vidéo-Mapping 3D (DLT)",
    summary: "Méthode pas-à-pas pour aligner la projection virtuelle sur les coins réels d'une pièce avec le solveur Direct Linear Transformation.",
    time: "8 min",
    level: "Intermédiaire",
    icon: "adjustments",
    content: {
      lead: "La calibration DLT (Direct Linear Transformation) résout la position absolue, l'orientation, le champ de vision et le décalage d'objectif (lens shift) de votre projecteur.",
      sections: [
        {
          title: "La Procédure en 4 Étapes de Calibration",
          type: "steps",
          items: [
            {
              number: "1",
              title: "Mesurer la Pièce Physique",
              desc: "Dans les paramètres de la node 'Room Corner', entrez au mètre ruban la largeur du Mur A, du Mur B et la Hauteur sous plafond."
            },
            {
              number: "2",
              title: "Lier la Caméra au Modèle de Pièce",
              desc: "Reliez la prise de sortie 'Ref Points' de Room Corner à l'entrée 'Ref Points In' de la node Camera."
            },
            {
              number: "3",
              title: "Glisser les 6 Poignées Colorées",
              desc: "Sur l'overlay de projection, ajustez à la souris chacun des 6 coins numerotés (1 à 6) pour les faire coïncider avec les angles réels de la salle."
            },
            {
              number: "4",
              title: "Vérifier le Residual Error",
              desc: "Le solveur DLT calcule la pose instantanément. Une erreur résiduelle inférieure à 2.0 px confirme un calage parfait."
            }
          ]
        },
        {
          title: "Règle de Précision DLT",
          type: "warning",
          titleWarning: "⚠️ Attention aux Murs Alignés",
          bodyWarning: "La calibration DLT exige que les 6 repères soient répartis en 3D (sur un coin de pièce). Si les repères sont tous sur un plan plat, le solveur ne pourra pas calculer la profondeur."
        },
        {
          title: "Vue du Canva 3D de Calibration",
          type: "image",
          src: "img/tsuji.jpg",
          caption: "Repères de calage physiques projetés en direct sur les volumes 3D de l'installation."
        }
      ]
    }
  },
  {
    id: "keyframes-timeline",
    title: "🎬 Timeline, Keyframes & Priorité des Câbles",
    summary: "Apprenez à combiner les keyframes sur axes (k), les marqueurs visuels (m) et la règle d'or d'évaluation des câbles.",
    time: "4 min",
    level: "Tous Niveaux",
    icon: "film",
    content: {
      lead: "Tsuji permet d'animer chaque axe (X, Y, Z) individuellement tout en maintenant la réactivité du graphe.",
      sections: [
        {
          title: "Les Raccourcis Timeline à Retenir",
          type: "steps",
          items: [
            {
              number: "k",
              title: "Enregistrer une Keyframe (Touche k)",
              desc: "Survolez un champ numérique dans le panneau de paramètres et appuyez sur k pour poser ou retirer une clé d'animation."
            },
            {
              number: "m",
              title: "Poser un Marqueur Visuel (Touche m)",
              desc: "Survolez le rail de la timeline et appuyez sur m pour placer un repère vert 1px sous la ligne de lecture."
            },
            {
              number: "Space",
              title: "Play / Pause (Touche Espace)",
              desc: "Appuyez sur la barre d'espace pour démarrer ou stopper le défilement du temps."
            }
          ]
        },
        {
          title: "La Règle d'Or : Wires Over Keyframes",
          type: "warning",
          titleWarning: "⚡ Priorité Absolue des Câbles",
          bodyWarning: "Si une prise d'entrée est connectée par un câble (wire), la valeur venant du câble écrase systématiquement les keyframes. Déconnectez le câble si vous souhaitez utiliser des clés manuelles."
        }
      ]
    }
  },
  {
    id: "audio-iot-data",
    title: "🎵 Audio Réactif & Dataviz 3D",
    summary: "Découpez le spectre sonore avec l'analyseur FFT et pilotez des graphiques 3D depuis des fichiers CSV.",
    time: "6 min",
    level: "Intermédiaire",
    icon: "music-note",
    content: {
      lead: "Transformez votre scène en une expérience audio-réactive ou data-visuelle vivante.",
      sections: [
        {
          title: "Décomposition FFT du Signal Audio",
          type: "text",
          body: "La node Audio Spectrum (FFT) extrait 3 bandes de fréquences réactives : la bande Bass (0-200Hz) pour les battements, la bande Mid (200-2kHz) pour les rotations et la bande High (2k-20kHz) pour l'émissivité."
        },
        {
          title: "Importation de Données CSV",
          type: "tip",
          titleTip: "📊 Chargement de Données Tabulaires",
          bodyTip: "Utilisez la node CSV Reader pour charger un fichier CSV. Associez les colonnes de chiffres à la node Map Range pour faire varier automatiquement la hauteur d'un Bar Graph 3D."
        }
      ]
    }
  }
];

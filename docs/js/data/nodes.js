/**
 * Base de données exhaustive des 60+ nodes d'OpenVMap3D
 */
export const NODE_CATEGORIES = {
  structure: { label: "Structure & Géométrie", color: "#10B981", icon: "cube" },
  transform: { label: "Transformations 3D", color: "#8B5CF6", icon: "arrows-expand" },
  camera: { label: "Caméra & Calibration", color: "#06B6D4", icon: "camera" },
  light: { label: "Éclairage & Environnement", color: "#F59E0B", icon: "sun" },
  texture: { label: "Textures & Matériaux", color: "#14B8A6", icon: "photograph" },
  postprocessing: { label: "Post-Traitement & Effets GPU", color: "#EC4899", icon: "sparkles" },
  math: { label: "Mathématiques & Logique", color: "#3B82F6", icon: "calculator" },
  sound: { label: "Audio Réactif & Signaux", color: "#F43F5E", icon: "music-note" },
  time: { label: "Temps & Oscillateurs", color: "#EAB308", icon: "clock" },
  list: { label: "Listes & Fichiers de Données", color: "#64748B", icon: "table" },
  particles: { label: "Systèmes de Particules", color: "#A855F7", icon: "dots-bubble" },
  random: { label: "Générateurs Aléatoires", color: "#D97706", icon: "sparkles" },
  converter: { label: "Convertisseurs de Types", color: "#6366F1", icon: "switch-horizontal" },
  text: { label: "Traitements de Texte 3D", color: "#0EA5E9", icon: "annotation" }
};

export const SOCKET_TYPES = {
  value: { label: "Value (Scalaire)", color: "#EAB308", description: "Nombre flottant ou booléen (0/1)" },
  vector: { label: "Vector (Vec3)", color: "#3B82F6", description: "Vecteur 3 dimensions (X, Y, Z)" },
  matrix: { label: "Matrix (4x4)", color: "#8B5CF6", description: "Matrice de transformation fusionnée (Loc/Rot/Scale)" },
  color: { label: "Color (RGBA)", color: "#EC4899", description: "Couleur RGBA" },
  geometry: { label: "Geometry (Mesh)", color: "#10B981", description: "Maillage / Mesh 3D Three.js" },
  texture: { label: "Texture", color: "#14B8A6", description: "Image bitmap, canevas 2D ou carte HDRI" },
  list: { label: "List (Collection)", color: "#94A3B8", description: "Collection ordonnée de données de n'importe quel type" }
};

export const NODES_DATABASE = [
  // --- STRUCTURE ---
  {
    id: "object/box",
    type: "object/box",
    name: "Box Geometry",
    category: "structure",
    summary: "Génère un cube ou parallélépipède 3D paramétrable avec gestion d'opacité et de texture.",
    inputs: [
      { id: "size", label: "Size", type: "vector", default: "[1, 1, 1]" },
      { id: "color", label: "Color", type: "color", default: "#ffffff" },
      { id: "opacity", label: "Opacity", type: "value", default: "1.0" },
      { id: "texture", label: "Texture", type: "texture", default: "None" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" },
      { id: "matrix", label: "Matrix", type: "matrix" }
    ],
    usage: "Utilisé pour créer des volumes 3D simples ou les briques élémentaires d'un projet de mapping."
  },
  {
    id: "object/plane",
    type: "object/plane",
    name: "Plane Geometry",
    category: "structure",
    summary: "Plan 2D dans l'espace 3D avec plaquage UV optimal pour l'affichage de vidéos ou d'images.",
    inputs: [
      { id: "width", label: "Width", type: "value", default: "1.0" },
      { id: "height", label: "Height", type: "value", default: "1.0" },
      { id: "color", label: "Color", type: "color", default: "#ffffff" },
      { id: "opacity", label: "Opacity", type: "value", default: "1.0" },
      { id: "texture", label: "Texture", type: "texture", default: "None" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" },
      { id: "matrix", label: "Matrix", type: "matrix" }
    ],
    usage: "Idéal comme écran de projection, mur d'affichage ou surface de texture."
  },
  {
    id: "object/sphere",
    type: "object/sphere",
    name: "Sphere Geometry",
    category: "structure",
    summary: "Sphère géométrique 3D avec subdivision UV paramétrable.",
    inputs: [
      { id: "radius", label: "Radius", type: "value", default: "0.5" },
      { id: "segments", label: "Segments", type: "value", default: "32" },
      { id: "color", label: "Color", type: "color", default: "#ffffff" },
      { id: "opacity", label: "Opacity", type: "value", default: "1.0" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" },
      { id: "matrix", label: "Matrix", type: "matrix" }
    ],
    usage: "Pour créer des orbes lumineuses, planètes ou éléments audio-réactifs sphériques."
  },
  {
    id: "object/cylinder",
    type: "object/cylinder",
    name: "Cylinder Geometry",
    category: "structure",
    summary: "Cylindre 3D géométrique avec rayons supérieur et inférieur indépendants.",
    inputs: [
      { id: "radiusTop", label: "Radius Top", type: "value", default: "0.5" },
      { id: "radiusBottom", label: "Radius Bottom", type: "value", default: "0.5" },
      { id: "height", label: "Height", type: "value", default: "1.0" },
      { id: "color", label: "Color", type: "color", default: "#ffffff" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" }
    ],
    usage: "Colonnes, piliers scénographiques, barres de volumes 3D."
  },
  {
    id: "object/text",
    type: "object/text",
    name: "Text 3D Extruded",
    category: "structure",
    summary: "Génère du texte 3D extrudé vectoriel à partir de polices typographiques.",
    inputs: [
      { id: "text", label: "Text", type: "value", default: '"OpenVMap3D"' },
      { id: "depth", label: "Extrude Depth", type: "value", default: "0.2" },
      { id: "size", label: "Font Size", type: "value", default: "1.0" },
      { id: "color", label: "Color", type: "color", default: "#38bdf8" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" }
    ],
    usage: "Typographies dynamiques 3D pour la scénographie, titrage et dataviz."
  },
  {
    id: "object/obj-loader",
    type: "object/obj-loader",
    name: "OBJ Model Loader",
    category: "structure",
    summary: "Importe un modèle 3D externe au format .obj avec matériaux et maillages complexes.",
    inputs: [
      { id: "path", label: "File Path / URL", type: "value", default: '""' },
      { id: "scale", label: "Global Scale", type: "value", default: "1.0" },
      { id: "color", label: "Override Color", type: "color", default: "#ffffff" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry", type: "geometry" },
      { id: "matrix", label: "Matrix", type: "matrix" }
    ],
    usage: "Chargement de la réplique 3D d'un bâtiment, d'une sculpture ou d'un objet physique à mapper."
  },
  {
    id: "structure/array",
    type: "structure/array",
    name: "Array / Instance Grid",
    category: "structure",
    summary: "Duplique une géométrie source selon des matrices d'instanciation Linear 1D, Circular 2D, Grid 2D ou 3D Grid.",
    inputs: [
      { id: "geometry", label: "Geometry In", type: "geometry", default: "Required" },
      { id: "count", label: "Count", type: "value", default: "10" },
      { id: "mode", label: "Distribution Mode", type: "value", default: '"Grid"' },
      { id: "spacing", label: "Spacing Vec3", type: "vector", default: "[1, 1, 1]" }
    ],
    outputs: [
      { id: "geometry", label: "Geometry Out", type: "geometry" },
      { id: "transforms", label: "Transform List", type: "list" }
    ],
    usage: "Création massive de répétitions et structures matricielles à haute performance (InstancedMesh)."
  },

  // --- TRANSFORMATIONS ---
  {
    id: "transform/transform",
    type: "transform/transform",
    name: "Transform",
    category: "transform",
    summary: "Applique translation (XYZ), rotation (XYZ en degrés) et échelle (XYZ). Produit une Matrix 4x4.",
    inputs: [
      { id: "translation", label: "Translation", type: "vector", default: "[0, 0, 0]" },
      { id: "rotation", label: "Rotation (Deg)", type: "vector", default: "[0, 0, 0]" },
      { id: "scale", label: "Scale", type: "vector", default: "[1, 1, 1]" }
    ],
    outputs: [
      { id: "matrix", label: "Matrix Out", type: "matrix" }
    ],
    usage: "Le node le plus fondamental de la catégorie Transform, utilisé pour positionner n'importe quel objet 3D."
  },
  {
    id: "transform/look-at",
    type: "transform/look-at",
    name: "Look At",
    category: "transform",
    summary: "Oriente un objet ou une caméra en continu vers une position cible dans l'espace 3D.",
    inputs: [
      { id: "eye", label: "Eye Position", type: "vector", default: "[0, 0, 5]" },
      { id: "target", label: "Target Position", type: "vector", default: "[0, 0, 0]" },
      { id: "up", label: "Up Vector", type: "vector", default: "[0, 1, 0]" }
    ],
    outputs: [
      { id: "matrix", label: "Matrix Out", type: "matrix" }
    ],
    usage: "Pour faire pivoter une caméra vers un objet mobile ou orienter un spot lumineux vers une cible."
  },

  // --- CAMERA & CALIBRATION ---
  {
    id: "camera/camera",
    type: "camera/camera",
    name: "Camera",
    category: "camera",
    summary: "Gestionnaire de caméra 3D avec support natif du mode Perspective, Orthographique et Solveur DLT.",
    inputs: [
      { id: "fov", label: "Field of View", type: "value", default: "60.0" },
      { id: "near", label: "Near Plane", type: "value", default: "0.1" },
      { id: "far", label: "Far Plane", type: "value", default: "1000.0" },
      { id: "refPoints", label: "Ref Points In", type: "list", default: "Optional" }
    ],
    outputs: [
      { id: "matrix", label: "Camera Matrix", type: "matrix" },
      { id: "residual", label: "DLT Residual Error", type: "value" }
    ],
    usage: "Point focal du rendu 3D et récepteur des 6 poignées de calage de la node Room Corner."
  },
  {
    id: "camera/room-corner",
    type: "camera/room-corner",
    name: "Room Corner (DLT)",
    category: "camera",
    summary: "Modèle 3D de la pièce physique (Mur A, Mur B, Hauteur) générant les 6 repères de calibration DLT.",
    inputs: [
      { id: "wallA", label: "Wall A Width (m)", type: "value", default: "4.0" },
      { id: "wallB", label: "Wall B Width (m)", type: "value", default: "3.5" },
      { id: "height", label: "Ceiling Height (m)", type: "value", default: "2.8" }
    ],
    outputs: [
      { id: "geometry", label: "Wireframe Mesh", type: "geometry" },
      { id: "refPoints", label: "Ref Points Out", type: "list" }
    ],
    usage: "Obligatoire pour la calibration vidéo-mapping 3D Direct Linear Transformation."
  },

  // --- LIGHT & ENVIRONMENT ---
  {
    id: "light/directional",
    type: "light/directional",
    name: "Directional Light",
    category: "light",
    summary: "Source lumineuse directionnelle (type soleil) avec support des ombres portées et de l'Empty Target.",
    inputs: [
      { id: "color", label: "Color", type: "color", default: "#ffffff" },
      { id: "intensity", label: "Intensity", type: "value", default: "1.0" },
      { id: "castShadow", label: "Cast Shadow", type: "value", default: "1" }
    ],
    outputs: [
      { id: "matrix", label: "Light Matrix", type: "matrix" }
    ],
    usage: "Permet de projeter des ombres réalistes d'objets 3D virtuels sur la géométrie physique."
  },
  {
    id: "light/environment",
    type: "light/environment",
    name: "Environment & HDRI",
    category: "light",
    summary: "Chargeur de cartes d'environnement HDRI (.hdr) ou OpenEXR 32 bits flottants pour l'éclairage PBR.",
    inputs: [
      { id: "path", label: "HDRI / EXR Path", type: "value", default: '""' },
      { id: "blurriness", label: "Background Blur", type: "value", default: "0.2" },
      { id: "intensity", label: "Exposure / Intensity", type: "value", default: "1.0" }
    ],
    outputs: [
      { id: "texture", label: "Environment Texture", type: "texture" }
    ],
    usage: "Pour obtenir des réflexions métaphoriques et un éclairage d'ambiance ultra-réaliste."
  },

  // --- POST-PROCESSING ---
  {
    id: "post/bloom",
    type: "post/bloom",
    name: "Bloom Effect",
    category: "postprocessing",
    summary: "Effet d'émanation lumineuse (glowing / halo émissif) sur les zones brillantes de l'image.",
    inputs: [
      { id: "threshold", label: "Threshold", type: "value", default: "0.8" },
      { id: "strength", label: "Strength", type: "value", default: "1.5" },
      { id: "radius", label: "Blur Radius", type: "value", default: "0.4" }
    ],
    outputs: [
      { id: "pass", label: "Post Pass Out", type: "texture" }
    ],
    usage: "Accentue l'aspect néon, émissif et cyber de la projection."
  },
  {
    id: "post/dof",
    type: "post/dof",
    name: "Depth of Field (DoF)",
    category: "postprocessing",
    summary: "Simule le flou de profondeur de champ cinématique d'une véritable lentille d'objectif.",
    inputs: [
      { id: "focusDistance", label: "Focus Distance", type: "value", default: "10.0" },
      { id: "focalLength", label: "Focal Length", type: "value", default: "50.0" },
      { id: "bokehScale", label: "Bokeh Size", type: "value", default: "2.0" }
    ],
    outputs: [
      { id: "pass", label: "Post Pass Out", type: "texture" }
    ],
    usage: "Focalise l'attention sur un objet précis en floutant l'arrière-plan."
  },
  {
    id: "post/outline",
    type: "post/outline",
    name: "Outline / Cel Shading",
    category: "postprocessing",
    summary: "Détection de contours de polygones et effet de tracé toon/architectural.",
    inputs: [
      { id: "color", label: "Outline Color", type: "color", default: "#38bdf8" },
      { id: "thickness", label: "Thickness", type: "value", default: "1.5" }
    ],
    outputs: [
      { id: "pass", label: "Post Pass Out", type: "texture" }
    ],
    usage: "Pour faire ressortir les arêtes architecturales du bâtiment."
  },

  // --- AUDIO & SIGNALS ---
  {
    id: "sound/microphone",
    type: "sound/microphone",
    name: "Microphone Input",
    category: "sound",
    summary: "Capture l'entrée audio du microphone du système en temps réel avec contrôle de gain.",
    inputs: [
      { id: "gain", label: "Gain Multiplier", type: "value", default: "1.0" },
      { id: "active", label: "Active", type: "value", default: "1" }
    ],
    outputs: [
      { id: "signal", label: "Audio Stream", type: "value" }
    ],
    usage: "Point d'entrée pour réagir à la voix, aux instruments ou au son ambiant de la salle."
  },
  {
    id: "sound/spectrum",
    type: "sound/spectrum",
    name: "Audio Spectrum (FFT)",
    category: "sound",
    summary: "Analyseur de spectre FFT décomposant le signal audio en bandes (Basses, Médiums, Aigus).",
    inputs: [
      { id: "signal", label: "Audio Signal In", type: "value", default: "Required" },
      { id: "smoothing", label: "Smoothing Factor", type: "value", default: "0.8" }
    ],
    outputs: [
      { id: "bass", label: "Bass Frequency (0-200Hz)", type: "value" },
      { id: "mid", label: "Mid Frequency (200-2kHz)", type: "value" },
      { id: "high", label: "High Frequency (2k-20kHz)", type: "value" },
      { id: "spectrumList", label: "Full FFT List", type: "list" }
    ],
    usage: "Pilote les transformations 3D (échelle, couleur, rotation) en rythme direct avec la musique."
  },

  // --- TIME & OSCILLATORS ---
  {
    id: "time/time",
    type: "time/time",
    name: "Time Master Clock",
    category: "time",
    summary: "Horloge temps réel déterministe fournissant le temps écoulé (s), le delta time et le frame count.",
    inputs: [
      { id: "speed", label: "Time Speed Multiplier", type: "value", default: "1.0" }
    ],
    outputs: [
      { id: "time", label: "Elapsed Time (s)", type: "value" },
      { id: "delta", label: "Delta Time (s)", type: "value" },
      { id: "frame", label: "Frame Count", type: "value" }
    ],
    usage: "Base de temps universelle pour synchroniser les oscillateurs et la timeline."
  },
  {
    id: "time/oscillator",
    type: "time/oscillator",
    name: "Oscillator",
    category: "time",
    summary: "Générateur d'ondes répétitives (Sinus, Carré, Dent de scie, Triangle) paramétrable en fréquence.",
    inputs: [
      { id: "waveform", label: "Waveform", type: "value", default: '"Sine"' },
      { id: "frequency", label: "Frequency (Hz)", type: "value", default: "1.0" },
      { id: "amplitude", label: "Amplitude", type: "value", default: "1.0" },
      { id: "phase", label: "Phase Shift", type: "value", default: "0.0" }
    ],
    outputs: [
      { id: "value", label: "Wave Value (-1 to 1)", type: "value" }
    ],
    usage: "Création de battements, clignotements, balayages et rotations animées fluides."
  },

  // --- MATH & LOGIC ---
  {
    id: "math/map-range",
    type: "math/map-range",
    name: "Map Range",
    category: "math",
    summary: "Remappe linéairement une valeur d'une plage [inMin, inMax] vers une nouvelle plage [outMin, outMax].",
    inputs: [
      { id: "value", label: "Input Value", type: "value", default: "0.5" },
      { id: "inMin", label: "In Min", type: "value", default: "0.0" },
      { id: "inMax", label: "In Max", type: "value", default: "1.0" },
      { id: "outMin", label: "Out Min", type: "value", default: "0.0" },
      { id: "outMax", label: "Out Max", type: "value", default: "10.0" }
    ],
    outputs: [
      { id: "out", label: "Rescaled Value", type: "value" }
    ],
    usage: "Le node le plus utilisé pour calibrer le signal d'un capteur ou d'un volume audio vers une propriété 3D."
  }
];

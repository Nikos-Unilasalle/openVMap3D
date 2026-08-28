/**
 * Catalog for the TopBar's Demos menu — small, single-purpose graphs that
 * each teach one node or one small combination, plus the handful of larger
 * showcase graphs kept from before. Grouped by category so the menu reads
 * like a table of contents, not a flat file list.
 *
 * Each `file` lives under public/demos/ — Vite copies public/ verbatim into
 * dist, so `fetch(\`/demos/${file}\`)` resolves the same way in the dev
 * server and in the built Tauri app (its webview loads the same bundled
 * index.html and assets). See demos.test.ts for the file-integrity check.
 */
export interface DemoEntry {
  file: string;
  label: string;
  description: string;
}

export interface DemoCategory {
  title: string;
  demos: DemoEntry[];
}

export const DEMO_CATALOG: DemoCategory[] = [
  {
    title: "Transform & Structure",
    demos: [
      {
        file: "demo_transform_basics.tsuji",
        label: "Geometry Transform",
        description: "Position, rotate and scale one object.",
      },
      {
        file: "demo_structure_array.tsuji",
        label: "Array Grid",
        description: "Repeat one object into a grid.",
      },
    ],
  },
  {
    title: "Time & Animation",
    demos: [
      {
        file: "demo_time_spin.tsuji",
        label: "Continuous Spin",
        description: "Time -> Value Math drives a steady rotation.",
      },
      {
        file: "demo_time_oscillator_bob.tsuji",
        label: "Oscillator Bob",
        description: "Oscillator drives a back-and-forth bob.",
      },
    ],
  },
  {
    title: "List & Instancing",
    demos: [
      {
        file: "demo_list_instance_color.tsuji",
        label: "Color Palette per Instance",
        description: "Array + Color Palette List -> Set Instance Color.",
      },
    ],
  },
  {
    title: "Curves",
    demos: [
      {
        file: "demo_curve_primitive.tsuji",
        label: "Curve Primitive",
        description: "One node, a ready-made helix curve.",
      },
    ],
  },
  {
    title: "Physics",
    demos: [
      {
        file: "demo_physics_raycast.tsuji",
        label: "Raycast Hit Marker",
        description: "Raycast a sphere, place a marker at the hit point.",
      },
    ],
  },
  {
    title: "Lighting & Post-Processing",
    demos: [
      {
        file: "demo_lighting_environment.tsuji",
        label: "Environment Lighting",
        description: "Environment & HDRI feeding the Render node.",
      },
      {
        file: "demo_postprocess_bloom.tsuji",
        label: "Bloom",
        description: "An emissive sphere through the Bloom pass.",
      },
    ],
  },
  {
    title: "I/O",
    demos: [
      {
        file: "demo_io_mouse_pointer.tsuji",
        label: "Mouse Pointer",
        description: "Mouse node's 3D point placing a marker.",
      },
      {
        file: "demo_mouse_halo.tsuji",
        label: "Mouse Proximity Halo",
        description: "Distances -> gradient color + height bump around the pointer.",
      },
    ],
  },
  {
    title: "Showcases",
    demos: [
      {
        file: "spawn.tsuji",
        label: "Spawn on Surface",
        description: "Scatter objects across a surface.",
      },
      {
        file: "demo_raycast.tsuji",
        label: "Ray Burst",
        description: "A field of rays hitting a target mesh.",
      },
      {
        file: "demo_stagger_wave.tsuji",
        label: "Stagger Wave",
        description: "A staggered rise/pop/spin animation across a grid.",
      },
      {
        file: "demo_spiderweb.tsuji",
        label: "Spiderweb",
        description: "A larger, multi-system composition.",
      },
    ],
  },
];

import type { SceneDefinition, SceneObjectDefinition } from "./definition";

const KEY_LIGHT = {
  type: "directional" as const,
  id: "key-light",
  name: "Key Light",
  direction: [-0.5, -1, -0.6] as [number, number, number],
  color: [1, 0.96, 0.9] as [number, number, number],
  intensity: 3,
  castShadow: true,
};

const FILL_POINT = {
  type: "point" as const,
  id: "fill-light",
  name: "Fill Light",
  position: [3, 2.5, 3] as [number, number, number],
  color: [0.7, 0.8, 1] as [number, number, number],
  intensity: 12,
  range: 14,
};

const GROUND: SceneObjectDefinition = {
  id: "ground",
  name: "Ground",
  geometry: { type: "plane", width: 20, depth: 20, segmentsX: 1, segmentsZ: 1 },
  material: { baseColor: [0.16, 0.16, 0.17], roughness: 0.9, metalness: 0 },
  position: [0, 0, 0],
  castShadow: false,
};

/** Scene A: cube, sphere, torus and plane under one shadow-casting directional light. */
export function geometryStudioScene(): SceneDefinition {
  return {
    id: "geometry-studio",
    name: "Geometry Studio",
    ambient: [0.04, 0.04, 0.05],
    background: [0.06, 0.06, 0.07],
    camera: { position: [5, 3.5, 6], target: [0, 0.6, 0], fovYDegrees: 50, near: 0.1, far: 100 },
    lights: [{ ...KEY_LIGHT }, { ...FILL_POINT }],
    objects: [
      GROUND,
      {
        id: "cube",
        name: "Cube",
        geometry: { type: "cube", size: 1.2 },
        material: { baseColor: [0.85, 0.25, 0.2], roughness: 0.45, metalness: 0.1 },
        position: [-2, 0.6, 0],
        rotationDegrees: [0, 25, 0],
      },
      {
        id: "sphere",
        name: "Sphere",
        geometry: { type: "sphere", radius: 0.7, widthSegments: 48, heightSegments: 24 },
        material: { baseColor: [0.9, 0.75, 0.35], roughness: 0.3, metalness: 0.9 },
        position: [0, 0.7, 0],
      },
      {
        id: "torus",
        name: "Torus",
        geometry: {
          type: "torus",
          radius: 0.6,
          tube: 0.22,
          radialSegments: 48,
          tubularSegments: 24,
        },
        material: { baseColor: [0.25, 0.55, 0.85], roughness: 0.55, metalness: 0.2 },
        position: [2, 0.85, 0],
        rotationDegrees: [60, 0, 0],
      },
    ],
  };
}

/** Scene B: a grid of spheres sweeping roughness (columns) against metalness (rows). */
export function materialGalleryScene(columns = 5, rows = 3): SceneDefinition {
  const objects: SceneObjectDefinition[] = [GROUND];
  const spacing = 1.7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      objects.push({
        id: `sphere-${r}-${c}`,
        name: `Sphere r${r} c${c}`,
        geometry: { type: "sphere", radius: 0.7, widthSegments: 40, heightSegments: 20 },
        material: {
          baseColor: [0.9, 0.55, 0.3],
          roughness: columns === 1 ? 0.5 : c / (columns - 1),
          metalness: rows === 1 ? 0 : r / (rows - 1),
        },
        position: [(c - (columns - 1) / 2) * spacing, 0.7, (r - (rows - 1) / 2) * spacing],
      });
    }
  }
  return {
    id: "material-gallery",
    name: "Material Gallery",
    ambient: [0.05, 0.05, 0.06],
    background: [0.06, 0.06, 0.07],
    camera: { position: [0, 6, 8.5], target: [0, 0.3, 0], fovYDegrees: 45, near: 0.1, far: 100 },
    lights: [{ ...KEY_LIGHT }, { ...FILL_POINT }],
    objects,
  };
}

/**
 * Scene C: `count` deterministic objects on a spiral/grid layout. Positions and shapes depend only
 * on the index, so the workload is identical on every run.
 */
export function scaleTestScene(count: number, segments = 16): SceneDefinition {
  const n = Math.max(1, Math.floor(count));
  const side = Math.ceil(Math.sqrt(n));
  const spacing = 1.4;
  const objects: SceneObjectDefinition[] = [
    {
      ...GROUND,
      geometry: { type: "plane", width: side * spacing + 6, depth: side * spacing + 6 },
    },
  ];
  const kinds = ["cube", "sphere", "torus"] as const;
  for (let i = 0; i < n; i++) {
    const x = (i % side) - (side - 1) / 2;
    const z = Math.floor(i / side) - (side - 1) / 2;
    const kind = kinds[i % kinds.length];
    const hue = (i * 0.61803398875) % 1;
    const geometry: SceneObjectDefinition["geometry"] =
      kind === "cube"
        ? { type: "cube", size: 0.9 }
        : kind === "sphere"
          ? {
              type: "sphere",
              radius: 0.5,
              widthSegments: segments,
              heightSegments: Math.max(2, segments / 2),
            }
          : {
              type: "torus",
              radius: 0.38,
              tube: 0.15,
              radialSegments: segments,
              tubularSegments: Math.max(3, segments / 2),
            };
    objects.push({
      id: `obj-${i}`,
      name: `Object ${i}`,
      geometry,
      material: {
        baseColor: hsvToRgb(hue, 0.55, 0.9),
        roughness: 0.2 + ((i * 7) % 10) / 12,
        metalness: (i % 4) / 4,
      },
      position: [x * spacing, 0.5, z * spacing],
      rotationDegrees: [0, (i * 37) % 360, 0],
    });
  }
  const dist = side * spacing * 0.9 + 4;
  return {
    id: `scale-test-${n}`,
    name: `Scale Test (${n})`,
    ambient: [0.04, 0.04, 0.05],
    background: [0.06, 0.06, 0.07],
    camera: {
      position: [dist, dist * 0.8, dist],
      target: [0, 0, 0],
      fovYDegrees: 50,
      near: 0.1,
      far: 500,
    },
    lights: [{ ...KEY_LIGHT }, { ...FILL_POINT }],
    objects,
  };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

export const SCENE_PRESETS = {
  "geometry-studio": () => geometryStudioScene(),
  "material-gallery": () => materialGalleryScene(),
  "scale-test": () => scaleTestScene(100),
} as const;

export type ScenePresetId = keyof typeof SCENE_PRESETS;

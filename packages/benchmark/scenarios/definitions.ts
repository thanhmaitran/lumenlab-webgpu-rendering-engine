import type { BenchmarkScenario } from "../src/types";

const COMMON = {
  warmupFrames: 30,
  measuredFrames: 120,
  runs: 3,
} as const;

const HD = { width: 1280, height: 720 } as const;

/**
 * The scenario matrix. Within a group, scenarios differ in exactly one factor (`variedFactor`);
 * scene, camera, materials, lighting and every other setting are held constant.
 */
export const SCENARIOS: readonly BenchmarkScenario[] = [
  {
    ...COMMON,
    id: "baseline-small",
    name: "Baseline (small)",
    description: "A small scene (10 objects) to establish the fixed cost of a frame.",
    group: "baseline",
    scene: { kind: "scale-test", count: 10, segments: 16 },
    resolution: HD,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "object count (reference)",
  },
  {
    ...COMMON,
    id: "geometry-medium",
    name: "Geometry (medium)",
    description: "100 objects: evaluates how cost scales with draw calls and triangles.",
    group: "scale",
    scene: { kind: "scale-test", count: 100, segments: 16 },
    resolution: HD,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "object count",
  },
  {
    ...COMMON,
    id: "geometry-large",
    name: "Geometry (large)",
    description: "400 objects: looks for the point where per-draw overhead starts to dominate.",
    group: "scale",
    scene: { kind: "scale-test", count: 400, segments: 16 },
    resolution: HD,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "object count",
  },
  {
    ...COMMON,
    id: "resolution-low",
    name: "Resolution (low)",
    description: "Same 100-object scene at 640x360 to isolate the per-pixel workload.",
    group: "resolution",
    scene: { kind: "scale-test", count: 100, segments: 16 },
    resolution: { width: 640, height: 360 },
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "render resolution",
  },
  {
    ...COMMON,
    id: "resolution-high",
    name: "Resolution (high)",
    description: "Same 100-object scene at 1920x1080 to measure sensitivity to pixel count.",
    group: "resolution",
    scene: { kind: "scale-test", count: 100, segments: 16 },
    resolution: { width: 1920, height: 1080 },
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "render resolution",
  },
  {
    ...COMMON,
    id: "shadow-on",
    name: "Shadows on",
    description: "100 objects at 1280x720 with the shadow pass enabled.",
    group: "shadow",
    scene: { kind: "scale-test", count: 100, segments: 16 },
    resolution: HD,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    variedFactor: "shadow mapping",
  },
  {
    ...COMMON,
    id: "shadow-off",
    name: "Shadows off",
    description: "Identical to shadow-on but with the shadow pass disabled, to estimate its cost.",
    group: "shadow",
    scene: { kind: "scale-test", count: 100, segments: 16 },
    resolution: HD,
    shadowsEnabled: false,
    shadowMapSize: 2048,
    variedFactor: "shadow mapping",
  },
];

import type { SceneDefinition } from "@lumenlab/engine";

export const BENCHMARK_SCHEMA_VERSION = 1;

/** Declarative description of the scene a scenario renders. Fully deterministic. */
export type SceneRef =
  | { kind: "scale-test"; count: number; segments: number }
  | { kind: "geometry-studio" }
  | { kind: "material-gallery" };

export type ScenarioGroup = "baseline" | "scale" | "resolution" | "shadow";

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  group: ScenarioGroup;
  scene: SceneRef;
  /** Backing-store resolution in pixels. Pinned so every run renders the same pixel count. */
  resolution: { width: number; height: number };
  shadowsEnabled: boolean;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  warmupFrames: number;
  measuredFrames: number;
  /** Number of independent repetitions (scene reloaded each time). */
  runs: number;
  /** Which single factor differs from its sibling scenarios in the same group. */
  variedFactor: string;
}

export interface RawSamples {
  /** Submit -> `onSubmittedWorkDone` per frame (ms). */
  completionMs: number[];
  /** CPU encode + submit per frame (ms). */
  cpuMs: number[];
  /** GPU pass time from timestamp queries (ms); only the frames where a value was available. */
  gpuMs: number[];
}

/**
 * One measured run of one scenario. Every number comes from a real measurement; metrics that the
 * environment cannot provide are `null`, never estimated.
 */
export interface BenchmarkResult {
  schemaVersion: number;
  scenarioId: string;
  runId: string;
  runIndex: number;
  timestamp: string;

  browser: string;
  deviceLabel: string;
  /** True when the adapter reports itself as a software/fallback implementation. */
  softwareAdapter: boolean;

  canvasWidth: number;
  canvasHeight: number;
  objectCount: number;
  triangleCount: number;
  drawCalls: number;
  shadowDrawCalls: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  renderMode: string;

  warmupFrames: number;
  measuredFrames: number;

  /** Frame time = CPU submit until the GPU queue reports the work done (vsync-independent). */
  frameTimeMedianMs: number;
  frameTimeP95Ms: number;
  frameTimeMeanMs: number;
  frameTimeStdDevMs: number;
  frameTimeMinMs: number;
  frameTimeMaxMs: number;

  cpuTimeMedianMs: number;
  cpuTimeP95Ms: number;

  /** GPU pass time from timestamp queries; null when the feature is unavailable. */
  gpuTimeMedianMs: number | null;
  gpuTimeP95Ms: number | null;
  gpuSamples: number;

  notes: string[];
}

export interface BenchmarkEnvironment {
  userAgent: string;
  browser: string;
  platform: string;
  deviceLabel: string;
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
  };
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  gpuTimingSupported: boolean;
}

/** The JSON document written by the Performance Lab and the benchmark CLI. */
export interface BenchmarkFile {
  schemaVersion: number;
  generatedAt: string;
  engineVersion: string;
  environment: BenchmarkEnvironment;
  results: BenchmarkResult[];
  raw: Record<string, RawSamples>;
}

export interface ResolvedScene {
  definition: SceneDefinition;
  objectCount: number;
  triangleCount: number;
  drawCalls: number;
}

import {
  ENGINE_VERSION,
  summarize,
  type AdapterReport,
  type FrameTiming,
  type RenderSettings,
  type SceneDefinition,
} from "@lumenlab/engine";
import { captureEnvironment, isSoftwareAdapter } from "./environment";
import { resolveScene } from "./scenarios";
import {
  BENCHMARK_SCHEMA_VERSION,
  type BenchmarkEnvironment,
  type BenchmarkFile,
  type BenchmarkResult,
  type BenchmarkScenario,
  type RawSamples,
} from "./types";

/** The subset of `Engine` the runner needs. Keeps the runner testable without a GPU. */
export interface BenchmarkTarget {
  readonly adapter: AdapterReport;
  readonly gpuTimingAvailable: boolean;
  readonly running: boolean;
  loadScene(definition: SceneDefinition): unknown;
  setSelection(id: string | null): void;
  getRenderSettings(): RenderSettings;
  setRenderSettings(partial: Partial<RenderSettings>): void;
  setFixedRenderSize(size: { width: number; height: number } | null): void;
  renderTimed(): Promise<FrameTiming | null>;
  start(): void;
  stop(): void;
}

export interface BenchmarkProgress {
  scenarioId: string;
  run: number;
  runs: number;
  phase: "warmup" | "measure";
  frame: number;
  totalFrames: number;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (progress: BenchmarkProgress) => void;
  /** Injected for deterministic tests. */
  now?: () => Date;
  /** Called after each completed run, e.g. to stream partial results into the UI. */
  onResult?: (result: BenchmarkResult, raw: RawSamples) => void;
}

export class BenchmarkAbortedError extends Error {
  constructor() {
    super("Benchmark aborted");
    this.name = "BenchmarkAbortedError";
  }
}

export class BenchmarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenchmarkError";
  }
}

export interface ScenarioRun {
  results: BenchmarkResult[];
  raw: Record<string, RawSamples>;
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BenchmarkAbortedError();
}

/**
 * Run one scenario `scenario.runs` times. Each run reloads the scene, pins the resolution, renders
 * `warmupFrames` frames that are discarded, then records `measuredFrames` frames.
 *
 * Frame time is measured as "CPU submit -> GPU queue idle" for every frame, which does not depend on
 * display refresh pacing. The target's previous settings and render loop are restored afterwards.
 */
export async function runScenario(
  target: BenchmarkTarget,
  scenario: BenchmarkScenario,
  environment: BenchmarkEnvironment,
  options: RunOptions = {},
): Promise<ScenarioRun> {
  const now = options.now ?? (() => new Date());
  const previousSettings = target.getRenderSettings();
  const wasRunning = target.running;
  const results: BenchmarkResult[] = [];
  const raw: Record<string, RawSamples> = {};
  const software = isSoftwareAdapter(environment);

  target.stop();
  try {
    for (let run = 0; run < scenario.runs; run++) {
      assertNotAborted(options.signal);
      const resolved = resolveScene(scenario.scene);
      target.loadScene(resolved.definition);
      target.setSelection(null);
      target.setRenderSettings({
        mode: "lit",
        renderScale: 1,
        shadowsEnabled: scenario.shadowsEnabled,
        shadowMapSize: scenario.shadowMapSize,
      });
      target.setFixedRenderSize(scenario.resolution);

      const total = scenario.warmupFrames + scenario.measuredFrames;
      const samples: RawSamples = { completionMs: [], cpuMs: [], gpuMs: [] };
      let last: FrameTiming | null = null;

      for (let i = 0; i < total; i++) {
        assertNotAborted(options.signal);
        const timing = await target.renderTimed();
        if (!timing) {
          throw new BenchmarkError("Rendering stopped (GPU device lost or no scene loaded).");
        }
        const measuring = i >= scenario.warmupFrames;
        options.onProgress?.({
          scenarioId: scenario.id,
          run,
          runs: scenario.runs,
          phase: measuring ? "measure" : "warmup",
          frame: measuring ? i - scenario.warmupFrames + 1 : i + 1,
          totalFrames: measuring ? scenario.measuredFrames : scenario.warmupFrames,
        });
        if (!measuring) continue;
        last = timing;
        samples.completionMs.push(timing.completionMs);
        samples.cpuMs.push(timing.stats.cpuMs);
        if (timing.stats.gpuMs !== null) samples.gpuMs.push(timing.stats.gpuMs);
      }
      if (!last) throw new BenchmarkError("Scenario measured zero frames.");

      const timestamp = now();
      const frame = summarize(samples.completionMs);
      const cpu = summarize(samples.cpuMs);
      const gpu = samples.gpuMs.length > 0 ? summarize(samples.gpuMs) : null;
      const notes: string[] = [];
      if (software)
        notes.push("Software/fallback adapter: not representative of hardware GPU performance.");
      if (!environment.gpuTimingSupported)
        notes.push("GPU timestamp queries unavailable; GPU time not reported.");
      else if (!gpu) notes.push("GPU timestamp queries supported but returned no samples.");

      const size = last.stats;
      const runId = `${scenario.id}-${compactTimestamp(timestamp)}-r${run + 1}`;
      const result: BenchmarkResult = {
        schemaVersion: BENCHMARK_SCHEMA_VERSION,
        scenarioId: scenario.id,
        runId,
        runIndex: run,
        timestamp: timestamp.toISOString(),
        browser: environment.browser,
        deviceLabel: environment.deviceLabel,
        softwareAdapter: software,
        canvasWidth: size.renderWidth,
        canvasHeight: size.renderHeight,
        objectCount: size.objects,
        triangleCount: size.triangles,
        drawCalls: size.drawCalls,
        shadowDrawCalls: size.shadowDrawCalls,
        shadowsEnabled: scenario.shadowsEnabled,
        shadowMapSize: scenario.shadowMapSize,
        renderMode: "lit",
        warmupFrames: scenario.warmupFrames,
        measuredFrames: scenario.measuredFrames,
        frameTimeMedianMs: frame.median,
        frameTimeP95Ms: frame.p95,
        frameTimeMeanMs: frame.mean,
        frameTimeStdDevMs: frame.stddev,
        frameTimeMinMs: frame.min,
        frameTimeMaxMs: frame.max,
        cpuTimeMedianMs: cpu.median,
        cpuTimeP95Ms: cpu.p95,
        gpuTimeMedianMs: gpu ? gpu.median : null,
        gpuTimeP95Ms: gpu ? gpu.p95 : null,
        gpuSamples: samples.gpuMs.length,
        notes,
      };
      results.push(result);
      raw[runId] = samples;
      options.onResult?.(result, samples);
    }
  } finally {
    target.setFixedRenderSize(null);
    target.setRenderSettings(previousSettings);
    if (wasRunning) target.start();
  }
  return { results, raw };
}

/** Run several scenarios in order and assemble the exportable result document. */
export async function runSuite(
  target: BenchmarkTarget,
  scenarios: readonly BenchmarkScenario[],
  options: RunOptions = {},
): Promise<BenchmarkFile> {
  const environment = captureEnvironment(target);
  const results: BenchmarkResult[] = [];
  const raw: Record<string, RawSamples> = {};
  for (const scenario of scenarios) {
    const run = await runScenario(target, scenario, environment, options);
    results.push(...run.results);
    Object.assign(raw, run.raw);
  }
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    engineVersion: ENGINE_VERSION,
    environment,
    results,
    raw,
  };
}

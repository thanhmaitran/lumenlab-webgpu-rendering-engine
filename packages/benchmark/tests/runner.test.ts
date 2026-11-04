import type {
  AdapterReport,
  FrameStats,
  FrameTiming,
  RenderSettings,
  SceneDefinition,
} from "@lumenlab/engine";
import { DEFAULT_RENDER_SETTINGS } from "@lumenlab/engine";
import { describe, expect, it } from "vitest";
import {
  BenchmarkAbortedError,
  BenchmarkError,
  getScenario,
  runScenario,
  runSuite,
  validateBenchmarkFile,
  validateBenchmarkResult,
  captureEnvironment,
  type BenchmarkScenario,
  type BenchmarkTarget,
} from "../src";

const ADAPTER: AdapterReport = {
  vendor: "acme",
  architecture: "gen1",
  device: "TestGPU",
  description: "",
  features: [],
  limits: {},
  isFallbackAdapter: false,
};

class FakeTarget implements BenchmarkTarget {
  adapter = ADAPTER;
  gpuTimingAvailable: boolean;
  running = true;
  calls: string[] = [];
  settings: RenderSettings = { ...DEFAULT_RENDER_SETTINGS, renderScale: 1.5 };
  fixed: { width: number; height: number } | null = null;
  frames = 0;
  loaded: SceneDefinition | null = null;
  failAtFrame = Infinity;
  onFrame?: () => void;

  constructor(gpu = true) {
    this.gpuTimingAvailable = gpu;
  }

  loadScene(def: SceneDefinition) {
    this.loaded = def;
    this.calls.push("load");
  }
  setSelection() {}
  getRenderSettings() {
    return { ...this.settings };
  }
  setRenderSettings(p: Partial<RenderSettings>) {
    this.settings = { ...this.settings, ...p };
  }
  setFixedRenderSize(size: { width: number; height: number } | null) {
    this.fixed = size;
  }
  start() {
    this.running = true;
    this.calls.push("start");
  }
  stop() {
    this.running = false;
    this.calls.push("stop");
  }
  async renderTimed(): Promise<FrameTiming | null> {
    const i = this.frames++;
    this.onFrame?.();
    if (i >= this.failAtFrame) return null;
    const stats: FrameStats = {
      frameIndex: i,
      cpuMs: 1 + (i % 3) * 0.1,
      gpuMs: this.gpuTimingAvailable ? 2 : null,
      drawCalls: 11,
      shadowDrawCalls: 11,
      triangles: 1234,
      objects: 11,
      uploadedBytes: 0,
      renderWidth: this.fixed?.width ?? 0,
      renderHeight: this.fixed?.height ?? 0,
    };
    return { stats, completionMs: 4 + i * 0.001 };
  }
}

const tiny: BenchmarkScenario = {
  ...getScenario("baseline-small"),
  warmupFrames: 3,
  measuredFrames: 10,
  runs: 2,
};
const fixedNow = () => new Date("2026-01-02T03:04:05.678Z");

describe("runScenario", () => {
  it("discards warm-up frames and records exactly the measured frames", async () => {
    const target = new FakeTarget();
    const env = captureEnvironment(target, {
      navigator: { userAgent: "Chrome/130", platform: "x", hardwareConcurrency: 8 },
      devicePixelRatio: 1,
    });
    const run = await runScenario(target, tiny, env, { now: fixedNow });
    expect(target.frames).toBe(2 * (3 + 10));
    expect(run.results).toHaveLength(2);
    for (const r of run.results) {
      expect(r.measuredFrames).toBe(10);
      expect(run.raw[r.runId].completionMs).toHaveLength(10);
      expect(validateBenchmarkResult(r)).toEqual([]);
      expect(r.canvasWidth).toBe(1280);
      expect(r.drawCalls).toBe(11);
      expect(r.gpuTimeMedianMs).toBe(2);
    }
    expect(run.results[0].runId).toBe("baseline-small-20260102-030405678-r1");
  });

  it("restores settings, fixed size and the render loop even on failure", async () => {
    const target = new FakeTarget();
    target.failAtFrame = 5;
    const env = captureEnvironment(target, { navigator: undefined });
    await expect(runScenario(target, tiny, env)).rejects.toBeInstanceOf(BenchmarkError);
    expect(target.fixed).toBeNull();
    expect(target.settings.renderScale).toBe(1.5);
    expect(target.running).toBe(true);
  });

  it("does not restart a loop that was not running", async () => {
    const target = new FakeTarget();
    target.running = false;
    const env = captureEnvironment(target, { navigator: undefined });
    await runScenario(target, { ...tiny, runs: 1 }, env);
    expect(target.calls).not.toContain("start");
  });

  it("reports GPU time as null (never invented) when timestamps are unavailable", async () => {
    const target = new FakeTarget(false);
    const env = captureEnvironment(target, { navigator: undefined });
    const { results } = await runScenario(target, { ...tiny, runs: 1 }, env);
    expect(results[0].gpuTimeMedianMs).toBeNull();
    expect(results[0].gpuTimeP95Ms).toBeNull();
    expect(results[0].gpuSamples).toBe(0);
    expect(results[0].notes.join(" ")).toMatch(/timestamp queries unavailable/);
    expect(validateBenchmarkResult(results[0])).toEqual([]);
  });

  it("flags software adapters", async () => {
    const target = new FakeTarget();
    target.adapter = { ...ADAPTER, vendor: "google", architecture: "swiftshader", device: "" };
    const env = captureEnvironment(target, { navigator: undefined });
    const { results } = await runScenario(target, { ...tiny, runs: 1 }, env);
    expect(results[0].softwareAdapter).toBe(true);
    expect(results[0].notes.join(" ")).toMatch(/Software/);
  });

  it("stops promptly when aborted", async () => {
    const target = new FakeTarget();
    const controller = new AbortController();
    target.onFrame = () => {
      if (target.frames === 4) controller.abort();
    };
    const env = captureEnvironment(target, { navigator: undefined });
    await expect(
      runScenario(target, tiny, env, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(BenchmarkAbortedError);
    expect(target.frames).toBeLessThanOrEqual(5);
    expect(target.running).toBe(true);
  });

  it("reports progress for warm-up and measurement phases", async () => {
    const target = new FakeTarget();
    const phases = new Set<string>();
    const env = captureEnvironment(target, { navigator: undefined });
    await runScenario(target, { ...tiny, runs: 1 }, env, {
      onProgress: (p) => phases.add(p.phase),
    });
    expect([...phases].sort()).toEqual(["measure", "warmup"]);
  });
});

describe("runSuite", () => {
  it("produces a file that passes validation", async () => {
    const target = new FakeTarget();
    const scenarios = ["baseline-small", "shadow-on", "shadow-off"].map((id) => ({
      ...getScenario(id),
      warmupFrames: 1,
      measuredFrames: 5,
      runs: 2,
    }));
    const file = await runSuite(target, scenarios, { now: fixedNow });
    expect(file.results).toHaveLength(6);
    expect(Object.keys(file.raw)).toHaveLength(6);
    expect(validateBenchmarkFile(file)).toEqual([]);
    expect(file.environment.deviceLabel).toBe("acme gen1 TestGPU");
  });
});

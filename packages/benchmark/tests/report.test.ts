import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_SCHEMA_VERSION,
  RESULT_FIELDS,
  aggregateResults,
  compareTimings,
  describeDevice,
  isSoftwareAdapter,
  parseBrowser,
  toCsv,
  toMarkdownReport,
  validateBenchmarkFile,
  validateBenchmarkResult,
  type BenchmarkFile,
  type BenchmarkResult,
} from "../src";

function result(over: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    scenarioId: "geometry-medium",
    runId: "geometry-medium-1-r1",
    runIndex: 0,
    timestamp: "2026-01-01T00:00:00.000Z",
    browser: "Chrome 130",
    deviceLabel: "acme gen1",
    softwareAdapter: false,
    canvasWidth: 1280,
    canvasHeight: 720,
    objectCount: 101,
    triangleCount: 50000,
    drawCalls: 101,
    shadowDrawCalls: 100,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    renderMode: "lit",
    warmupFrames: 30,
    measuredFrames: 3,
    frameTimeMedianMs: 5,
    frameTimeP95Ms: 6,
    frameTimeMeanMs: 5.2,
    frameTimeStdDevMs: 0.4,
    frameTimeMinMs: 4.5,
    frameTimeMaxMs: 6.1,
    cpuTimeMedianMs: 1.2,
    cpuTimeP95Ms: 1.5,
    gpuTimeMedianMs: null,
    gpuTimeP95Ms: null,
    gpuSamples: 0,
    notes: [],
    ...over,
  };
}

function file(results: BenchmarkResult[]): BenchmarkFile {
  const raw = Object.fromEntries(
    results.map((r) => [r.runId, { completionMs: [5, 5, 5], cpuMs: [1, 1, 1], gpuMs: [] }]),
  );
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    generatedAt: "2026-01-01T00:00:00.000Z",
    engineVersion: "0.1.0",
    environment: {
      userAgent: "ua",
      browser: "Chrome 130",
      platform: "Linux",
      deviceLabel: "acme gen1",
      adapter: {
        vendor: "acme",
        architecture: "gen1",
        device: "",
        description: "",
        isFallbackAdapter: false,
      },
      devicePixelRatio: 1,
      hardwareConcurrency: 8,
      gpuTimingSupported: false,
    },
    results,
    raw,
  };
}

describe("validation", () => {
  it("accepts a well-formed result", () => {
    expect(validateBenchmarkResult(result())).toEqual([]);
  });

  it("rejects missing fields, NaN and inconsistent statistics", () => {
    const bad: Record<string, unknown> = { ...result() };
    delete bad.frameTimeMedianMs;
    expect(validateBenchmarkResult(bad)).toContain('missing field "frameTimeMedianMs"');
    expect(validateBenchmarkResult(result({ frameTimeMedianMs: NaN }))[0]).toMatch(
      /frameTimeMedianMs/,
    );
    expect(validateBenchmarkResult(result({ frameTimeP95Ms: 1 }))).toContain(
      "frameTimeP95Ms must be >= frameTimeMedianMs",
    );
    expect(validateBenchmarkResult(result({ gpuTimeMedianMs: 1 }))).toContain(
      "gpuTimeMedianMs and gpuTimeP95Ms must both be null or both be numbers",
    );
    expect(validateBenchmarkResult(result({ gpuSamples: 3 }))).toContain(
      "gpuSamples must be 0 when GPU time is null",
    );
    expect(validateBenchmarkResult(null)).toEqual(["result must be an object"]);
  });

  it("detects raw sample mismatches in files", () => {
    const f = file([result()]);
    expect(validateBenchmarkFile(f)).toEqual([]);
    f.raw[f.results[0].runId].completionMs.pop();
    expect(validateBenchmarkFile(f).join()).toMatch(/raw sample count mismatch/);
  });

  it("keeps the JSON schema and the validator in sync", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../../../benchmarks/schemas/benchmark-result.schema.json", import.meta.url),
        "utf8",
      ),
    ) as { required: string[]; properties: Record<string, unknown> };
    expect([...schema.required].sort()).toEqual(Object.keys(RESULT_FIELDS).sort());
    expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(RESULT_FIELDS).sort());
  });
});

describe("aggregation and comparison", () => {
  it("takes the median of run medians and keeps the spread", () => {
    const rs = [
      result({ runId: "a", frameTimeMedianMs: 5 }),
      result({ runId: "b", frameTimeMedianMs: 7, frameTimeP95Ms: 9 }),
      result({ runId: "c", frameTimeMedianMs: 6 }),
    ];
    const [agg] = aggregateResults(rs);
    expect(agg.runs).toBe(3);
    expect(agg.frameTimeMedianMs).toBe(6);
    expect(agg.frameTimeRunMin).toBe(5);
    expect(agg.frameTimeRunMax).toBe(7);
    expect(agg.frameTimeP95Ms).toBe(9);
    expect(agg.gpuTimeMedianMs).toBeNull();
  });

  it("compares timings and flags regressions beyond tolerance", () => {
    const c = compareTimings(10, 12, 10);
    expect(c.deltaMs).toBe(2);
    expect(c.ratio).toBeCloseTo(1.2);
    expect(c.percentChange).toBeCloseTo(20);
    expect(c.regression).toBe(true);
    expect(compareTimings(10, 10.5, 10).regression).toBe(false);
    expect(compareTimings(10, 8).regression).toBe(false);
    expect(() => compareTimings(0, 1)).toThrow(RangeError);
  });
});

describe("export", () => {
  it("writes one CSV row per result with null as an empty cell", () => {
    const csv = toCsv([result(), result({ runId: "x,y" })])
      .trim()
      .split("\n");
    expect(csv).toHaveLength(3);
    const header = csv[0].split(",");
    expect(header).toContain("gpuTimeMedianMs");
    expect(csv[1].split(",")[header.indexOf("gpuTimeMedianMs")]).toBe("");
    expect(csv[2]).toContain('"x,y"');
  });

  it("builds a markdown report with environment, caveats and comparisons", () => {
    const md = toMarkdownReport(
      file([
        result({ scenarioId: "shadow-off", runId: "s-off", frameTimeMedianMs: 4 }),
        result({
          scenarioId: "shadow-on",
          runId: "s-on",
          frameTimeMedianMs: 6,
          softwareAdapter: true,
        }),
      ]),
    );
    expect(md).toContain("# LumenLab benchmark report");
    expect(md).toContain("acme gen1");
    expect(md).toContain("software/fallback adapter");
    expect(md).toContain("Shadow pass cost");
    expect(md).toContain("1.50×");
  });
});

describe("environment helpers", () => {
  it("parses browsers", () => {
    expect(parseBrowser("Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36 Edg/130.0")).toBe("Edge 130");
    expect(parseBrowser("Mozilla/5.0 HeadlessChrome/141.0 Safari/537.36")).toBe(
      "Chrome (headless) 141",
    );
    expect(parseBrowser("curl/8")).toBe("unknown browser");
  });

  it("labels devices and detects software adapters", () => {
    expect(describeDevice({ vendor: "", architecture: "", device: "", description: "" })).toBe(
      "unknown GPU adapter",
    );
    expect(
      describeDevice({ vendor: "nvidia", architecture: "ada", device: "", description: "RTX" }),
    ).toBe("nvidia ada RTX");
    const env = file([]).environment;
    expect(isSoftwareAdapter(env)).toBe(false);
    expect(
      isSoftwareAdapter({ ...env, adapter: { ...env.adapter, architecture: "swiftshader" } }),
    ).toBe(true);
    expect(
      isSoftwareAdapter({ ...env, adapter: { ...env.adapter, isFallbackAdapter: true } }),
    ).toBe(true);
  });
});

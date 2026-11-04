import { describe, expect, it, vi } from "vitest";
import {
  DiagnosticsLog,
  Emitter,
  RollingWindow,
  computeRenderSize,
  detectWebGPU,
  mean,
  median,
  percentile,
  sanitizeRenderSettings,
  stddev,
  summarize,
} from "../src";

describe("statistics", () => {
  it("computes the median of odd and even samples", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("computes interpolated percentiles", () => {
    const v = Array.from({ length: 101 }, (_, i) => i); // 0..100
    expect(percentile(v, 0)).toBe(0);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([10, 20], 50)).toBe(15);
  });

  it("does not mutate its input", () => {
    const v = [3, 1, 2];
    percentile(v, 95);
    expect(v).toEqual([3, 1, 2]);
  });

  it("returns NaN for empty samples instead of inventing a number", () => {
    expect(Number.isNaN(median([]))).toBe(true);
    expect(Number.isNaN(mean([]))).toBe(true);
  });

  it("uses the sample standard deviation", () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stddev([5])).toBe(0);
  });

  it("summarizes a sample", () => {
    const s = summarize([1, 2, 3, 4, 100]);
    expect(s).toMatchObject({ count: 5, min: 1, max: 100, median: 3 });
    expect(s.p95).toBeGreaterThan(s.median);
  });
});

describe("RollingWindow", () => {
  it("keeps only the most recent `capacity` values", () => {
    const w = new RollingWindow(3);
    [1, 2, 3, 4, 5].forEach((x) => w.push(x));
    expect(w.values().sort()).toEqual([3, 4, 5]);
    expect(w.length).toBe(3);
    w.clear();
    expect(w.length).toBe(0);
  });
  it("rejects invalid capacity", () => {
    expect(() => new RollingWindow(0)).toThrow();
  });
});

describe("Emitter", () => {
  it("delivers values and supports unsubscribe", () => {
    const e = new Emitter<number>();
    const fn = vi.fn();
    const off = e.subscribe(fn);
    e.emit(1);
    off();
    e.emit(2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
    expect(e.size).toBe(0);
  });
});

describe("DiagnosticsLog", () => {
  it("is bounded and emits entries", () => {
    const log = new DiagnosticsLog(3);
    const seen: string[] = [];
    log.onEntry.subscribe((e) => seen.push(e.message));
    for (let i = 0; i < 5; i++) log.add("info", `m${i}`);
    expect(log.list().map((e) => e.message)).toEqual(["m2", "m3", "m4"]);
    expect(seen).toHaveLength(5);
  });
});

describe("render settings", () => {
  it("clamps render scale and rejects unknown shadow sizes", () => {
    expect(sanitizeRenderSettings({ renderScale: 99 }).renderScale).toBe(2);
    expect(sanitizeRenderSettings({ renderScale: 0 }).renderScale).toBe(0.25);
    expect(sanitizeRenderSettings({ renderScale: NaN }).renderScale).toBe(1);
    expect(sanitizeRenderSettings({ shadowMapSize: 333 as 512 }).shadowMapSize).toBe(2048);
    expect(sanitizeRenderSettings({ shadowMapSize: 1024 }).shadowMapSize).toBe(1024);
  });

  it("computes render size from css size, dpr and scale (never below 1px)", () => {
    expect(computeRenderSize(800, 600, 2, 0.5)).toEqual({ width: 800, height: 600 });
    expect(computeRenderSize(0, 0, 1, 1)).toEqual({ width: 1, height: 1 });
    expect(computeRenderSize(100000, 100, 1, 2, 8192).width).toBe(8192);
  });
});

describe("detectWebGPU", () => {
  it("reports unsupported (with a reason) when navigator.gpu is missing", async () => {
    const result = await detectWebGPU({} as Navigator);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toMatch(/WebGPU/);
  });

  it("reports unsupported when no adapter is granted", async () => {
    const nav = { gpu: { requestAdapter: async () => null } } as unknown as Navigator;
    const result = await detectWebGPU(nav);
    expect(result.supported).toBe(false);
    if (!result.supported) expect(result.reason).toMatch(/no compatible GPU adapter/);
  });

  it("reports unsupported (not a crash) when requestAdapter throws", async () => {
    const nav = {
      gpu: {
        requestAdapter: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as Navigator;
    const result = await detectWebGPU(nav);
    expect(result.supported).toBe(false);
  });

  it("returns an adapter report when an adapter is granted", async () => {
    const adapter = {
      features: new Set(["timestamp-query"]),
      limits: { maxTextureDimension2D: 8192 },
      info: { vendor: "acme", architecture: "x", device: "d", description: "desc" },
    };
    const nav = { gpu: { requestAdapter: async () => adapter } } as unknown as Navigator;
    const result = await detectWebGPU(nav);
    expect(result.supported).toBe(true);
    if (result.supported) {
      expect(result.report.vendor).toBe("acme");
      expect(result.report.features).toEqual(["timestamp-query"]);
      expect(result.report.limits.maxTextureDimension2D).toBe(8192);
    }
  });
});

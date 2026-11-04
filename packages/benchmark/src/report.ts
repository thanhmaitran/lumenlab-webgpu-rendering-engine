import { median } from "@lumenlab/engine";
import { SCENARIOS } from "../scenarios/definitions";
import type { BenchmarkFile, BenchmarkResult } from "./types";

export interface ScenarioAggregate {
  scenarioId: string;
  runs: number;
  objectCount: number;
  triangleCount: number;
  drawCalls: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Median of the per-run medians (ms). */
  frameTimeMedianMs: number;
  /** Fastest and slowest per-run median, showing run-to-run spread. */
  frameTimeRunMin: number;
  frameTimeRunMax: number;
  /** Worst per-run p95. */
  frameTimeP95Ms: number;
  cpuTimeMedianMs: number;
  gpuTimeMedianMs: number | null;
}

/** Combine the repeated runs of every scenario. Order follows the first appearance in `results`. */
export function aggregateResults(results: readonly BenchmarkResult[]): ScenarioAggregate[] {
  const order: string[] = [];
  const groups = new Map<string, BenchmarkResult[]>();
  for (const r of results) {
    if (!groups.has(r.scenarioId)) {
      groups.set(r.scenarioId, []);
      order.push(r.scenarioId);
    }
    groups.get(r.scenarioId)!.push(r);
  }
  return order.map((id) => {
    const runs = groups.get(id)!;
    const medians = runs.map((r) => r.frameTimeMedianMs);
    const gpu = runs.map((r) => r.gpuTimeMedianMs).filter((v): v is number => v !== null);
    const first = runs[0];
    return {
      scenarioId: id,
      runs: runs.length,
      objectCount: first.objectCount,
      triangleCount: first.triangleCount,
      drawCalls: first.drawCalls,
      canvasWidth: first.canvasWidth,
      canvasHeight: first.canvasHeight,
      frameTimeMedianMs: median(medians),
      frameTimeRunMin: Math.min(...medians),
      frameTimeRunMax: Math.max(...medians),
      frameTimeP95Ms: Math.max(...runs.map((r) => r.frameTimeP95Ms)),
      cpuTimeMedianMs: median(runs.map((r) => r.cpuTimeMedianMs)),
      gpuTimeMedianMs: gpu.length > 0 ? median(gpu) : null,
    };
  });
}

export interface Comparison {
  baselineMs: number;
  candidateMs: number;
  deltaMs: number;
  /** candidate / baseline. */
  ratio: number;
  percentChange: number;
  /** True when the candidate is slower than the baseline by more than `tolerancePercent`. */
  regression: boolean;
}

/** Compare two timings measured in the SAME environment. Throws on non-positive baselines. */
export function compareTimings(
  baselineMs: number,
  candidateMs: number,
  tolerancePercent = 10,
): Comparison {
  if (!(baselineMs > 0)) throw new RangeError("baseline must be > 0");
  const ratio = candidateMs / baselineMs;
  const percentChange = (ratio - 1) * 100;
  return {
    baselineMs,
    candidateMs,
    deltaMs: candidateMs - baselineMs,
    ratio,
    percentChange,
    regression: percentChange > tolerancePercent,
  };
}

const CSV_COLUMNS: ReadonlyArray<keyof BenchmarkResult> = [
  "scenarioId",
  "runId",
  "runIndex",
  "timestamp",
  "browser",
  "deviceLabel",
  "softwareAdapter",
  "canvasWidth",
  "canvasHeight",
  "objectCount",
  "triangleCount",
  "drawCalls",
  "shadowDrawCalls",
  "shadowsEnabled",
  "warmupFrames",
  "measuredFrames",
  "frameTimeMedianMs",
  "frameTimeP95Ms",
  "frameTimeMeanMs",
  "frameTimeStdDevMs",
  "cpuTimeMedianMs",
  "cpuTimeP95Ms",
  "gpuTimeMedianMs",
  "gpuTimeP95Ms",
  "gpuSamples",
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(Number(value.toFixed(4))) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(results: readonly BenchmarkResult[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of results) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\n") + "\n";
}

const fmt = (v: number | null, digits = 2) =>
  v === null || !Number.isFinite(v) ? "n/a" : v.toFixed(digits);

/** Markdown report for a result file. Includes the environment and the measurement caveats. */
export function toMarkdownReport(file: BenchmarkFile): string {
  const env = file.environment;
  const aggregates = aggregateResults(file.results);
  const software = file.results.some((r) => r.softwareAdapter);
  const lines: string[] = [];
  lines.push("# LumenLab benchmark report", "");
  lines.push(`Generated: ${file.generatedAt}  `);
  lines.push(`Engine version: ${file.engineVersion}  `);
  lines.push(`Schema version: ${file.schemaVersion}`, "");
  lines.push("## Environment", "");
  lines.push(`- Browser: ${env.browser}`);
  lines.push(`- Platform: ${env.platform}`);
  lines.push(
    `- GPU adapter: ${env.deviceLabel}${env.adapter.isFallbackAdapter ? " (fallback adapter)" : ""}`,
  );
  lines.push(`- Device pixel ratio: ${env.devicePixelRatio}`);
  lines.push(`- Logical CPU cores: ${env.hardwareConcurrency ?? "unknown"}`);
  lines.push(
    `- GPU timestamp queries: ${env.gpuTimingSupported ? "supported" : "not supported"}`,
    "",
  );
  if (software) {
    lines.push(
      "> **Warning:** these results were produced by a software/fallback adapter. They validate the",
      "> measurement pipeline but must not be read as hardware GPU performance.",
      "",
    );
  }
  lines.push("## Results", "");
  lines.push(
    "| Scenario | Runs | Resolution | Objects | Triangles | Draw calls | Frame time median (ms) | Run-to-run range (ms) | Worst p95 (ms) | CPU median (ms) | GPU median (ms) |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |",
  );
  for (const a of aggregates) {
    lines.push(
      `| ${a.scenarioId} | ${a.runs} | ${a.canvasWidth}x${a.canvasHeight} | ${a.objectCount} | ${a.triangleCount} | ${a.drawCalls} | ${fmt(a.frameTimeMedianMs)} | ${fmt(a.frameTimeRunMin)} – ${fmt(a.frameTimeRunMax)} | ${fmt(a.frameTimeP95Ms)} | ${fmt(a.cpuTimeMedianMs)} | ${fmt(a.gpuTimeMedianMs)} |`,
    );
  }
  lines.push("");

  const byId = new Map(aggregates.map((a) => [a.scenarioId, a]));
  const pairs: Array<[string, string, string]> = [
    ["shadow-off", "shadow-on", "Shadow pass cost (same scene, camera, resolution)"],
    ["resolution-low", "resolution-high", "Resolution sensitivity (same scene)"],
    ["geometry-medium", "geometry-large", "Object-count scaling"],
  ];
  const comparisons = pairs.filter(([a, b]) => byId.has(a) && byId.has(b));
  if (comparisons.length > 0) {
    lines.push("## Controlled comparisons", "");
    lines.push(
      "| Comparison | Baseline | Candidate | Δ (ms) | Ratio |",
      "| --- | --- | --- | ---: | ---: |",
    );
    for (const [a, b, label] of comparisons) {
      const c = compareTimings(byId.get(a)!.frameTimeMedianMs, byId.get(b)!.frameTimeMedianMs);
      lines.push(
        `| ${label} | ${a} (${fmt(c.baselineMs)} ms) | ${b} (${fmt(c.candidateMs)} ms) | ${fmt(c.deltaMs)} | ${fmt(c.ratio)}× |`,
      );
    }
    lines.push("");
  }

  lines.push("## How to read this", "");
  lines.push(
    "- **Frame time** is CPU submit until the GPU queue reports the work complete. It does not depend on display refresh pacing, but it includes driver and queue latency.",
  );
  lines.push("- **CPU time** is encode + submit only.");
  lines.push(
    "- **GPU time** comes from timestamp queries and is `n/a` when the adapter or browser does not provide them.",
  );
  lines.push(
    "- Compare numbers only within one environment. The scenarios vary one factor at a time; see `variedFactor` in the scenario definitions.",
  );
  lines.push("");
  lines.push("## Scenario definitions", "");
  for (const id of aggregates.map((a) => a.scenarioId)) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (s) lines.push(`- \`${s.id}\` – ${s.description} (varies: ${s.variedFactor})`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Serialise a file the way the Performance Lab and CLI write it. */
export function toJson(file: BenchmarkFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

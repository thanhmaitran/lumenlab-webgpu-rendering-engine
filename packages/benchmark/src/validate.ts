import { BENCHMARK_SCHEMA_VERSION } from "./types";

type Kind = "string" | "number" | "boolean" | "nullable-number" | "string[]";

/** Field table shared by the validator and checked against benchmarks/schemas/*.json in tests. */
export const RESULT_FIELDS: Record<string, Kind> = {
  schemaVersion: "number",
  scenarioId: "string",
  runId: "string",
  runIndex: "number",
  timestamp: "string",
  browser: "string",
  deviceLabel: "string",
  softwareAdapter: "boolean",
  canvasWidth: "number",
  canvasHeight: "number",
  objectCount: "number",
  triangleCount: "number",
  drawCalls: "number",
  shadowDrawCalls: "number",
  shadowsEnabled: "boolean",
  shadowMapSize: "number",
  renderMode: "string",
  warmupFrames: "number",
  measuredFrames: "number",
  frameTimeMedianMs: "number",
  frameTimeP95Ms: "number",
  frameTimeMeanMs: "number",
  frameTimeStdDevMs: "number",
  frameTimeMinMs: "number",
  frameTimeMaxMs: "number",
  cpuTimeMedianMs: "number",
  cpuTimeP95Ms: "number",
  gpuTimeMedianMs: "nullable-number",
  gpuTimeP95Ms: "nullable-number",
  gpuSamples: "number",
  notes: "string[]",
};

function checkKind(value: unknown, kind: Kind): boolean {
  switch (kind) {
    case "string":
      return typeof value === "string" && value.length > 0;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "nullable-number":
      return value === null || (typeof value === "number" && Number.isFinite(value));
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
  }
}

/** Returns a list of human-readable problems; an empty list means the record is valid. */
export function validateBenchmarkResult(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["result must be an object"];
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [field, kind] of Object.entries(RESULT_FIELDS)) {
    if (!(field in record)) errors.push(`missing field "${field}"`);
    else if (!checkKind(record[field], kind)) errors.push(`field "${field}" must be ${kind}`);
  }
  if (errors.length > 0) return errors;
  if (record.schemaVersion !== BENCHMARK_SCHEMA_VERSION) {
    errors.push(`unsupported schemaVersion ${String(record.schemaVersion)}`);
  }
  const num = (k: string) => record[k] as number;
  if (num("measuredFrames") < 1) errors.push("measuredFrames must be >= 1");
  if (num("frameTimeMedianMs") < 0) errors.push("frameTimeMedianMs must be >= 0");
  if (num("frameTimeP95Ms") < num("frameTimeMedianMs"))
    errors.push("frameTimeP95Ms must be >= frameTimeMedianMs");
  if (
    num("frameTimeMinMs") > num("frameTimeMedianMs") ||
    num("frameTimeMaxMs") < num("frameTimeMedianMs")
  ) {
    errors.push("frame time min/median/max are inconsistent");
  }
  if (num("canvasWidth") < 1 || num("canvasHeight") < 1)
    errors.push("canvas size must be positive");
  if ((record.gpuTimeMedianMs === null) !== (record.gpuTimeP95Ms === null)) {
    errors.push("gpuTimeMedianMs and gpuTimeP95Ms must both be null or both be numbers");
  }
  if (record.gpuTimeMedianMs === null && num("gpuSamples") !== 0) {
    errors.push("gpuSamples must be 0 when GPU time is null");
  }
  return errors;
}

export function validateBenchmarkFile(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return ["file must be an object"];
  const file = value as Record<string, unknown>;
  const errors: string[] = [];
  if (file.schemaVersion !== BENCHMARK_SCHEMA_VERSION)
    errors.push("unsupported or missing schemaVersion");
  if (typeof file.generatedAt !== "string") errors.push("missing generatedAt");
  if (typeof file.environment !== "object" || file.environment === null)
    errors.push("missing environment");
  if (!Array.isArray(file.results)) return [...errors, "results must be an array"];
  file.results.forEach((r, i) => {
    for (const e of validateBenchmarkResult(r)) errors.push(`results[${i}]: ${e}`);
  });
  const raw = file.raw as Record<string, unknown> | undefined;
  if (typeof raw !== "object" || raw === null) errors.push("missing raw samples");
  else {
    for (const r of file.results as Array<{ runId?: string; measuredFrames?: number }>) {
      const samples = r.runId
        ? (raw[r.runId] as { completionMs?: unknown[] } | undefined)
        : undefined;
      if (!samples) errors.push(`missing raw samples for run "${String(r.runId)}"`);
      else if (samples.completionMs?.length !== r.measuredFrames) {
        errors.push(`raw sample count mismatch for run "${String(r.runId)}"`);
      }
    }
  }
  return errors;
}

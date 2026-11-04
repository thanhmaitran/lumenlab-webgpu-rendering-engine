# Benchmark methodology

The goal of the benchmark suite is **reproducible, honestly-labelled measurements** — not a single
impressive FPS number.

## What is measured

For every run of a scenario the harness records one _frame time_ per measured frame:

> the time from the CPU starting to encode a frame until `queue.onSubmittedWorkDone()` resolves.

This is independent of display refresh (it is not capped at 60 Hz) and includes driver and queue
latency. It is **not** pure GPU execution time. Separately the harness records:

- **CPU time** — encode + submit only.
- **GPU time** — from timestamp queries, only when the adapter exposes `timestamp-query`. Otherwise
  `null` (shown as `n/a`). It is never estimated.
- **Workload facts** — canvas size, objects, triangles, main-pass and shadow-pass draw calls.

## Procedure (per run)

1. Load the scenario's deterministic scene (no random numbers, no wall-clock input).
2. Pin the render resolution so the pixel count is exact.
3. Stop the interactive render loop so it cannot compete with the measurement.
4. Render `warmupFrames` frames and discard them (pipeline/driver warm-up).
5. Render `measuredFrames` frames, awaiting GPU completion after each, and store every sample.
6. Compute median, p95, mean, standard deviation, min and max.
7. Repeat for `runs` runs and aggregate: the headline number is the **median of run medians**; the
   **run-to-run range** is reported next to it so noise is visible.
8. Restore the interactive scene and loop.

## Scenario matrix

Scenarios differ in exactly one factor from their group siblings; everything else is held constant.

| Scenario          | Group      | Varied factor     | Scene       | Resolution | Shadows |
| ----------------- | ---------- | ----------------- | ----------- | ---------- | ------- |
| `baseline-small`  | baseline   | (reference)       | 10 objects  | 1280×720   | on      |
| `geometry-medium` | scale      | object count      | 100 objects | 1280×720   | on      |
| `geometry-large`  | scale      | object count      | 400 objects | 1280×720   | on      |
| `resolution-low`  | resolution | render resolution | 100 objects | 640×360    | on      |
| `resolution-high` | resolution | render resolution | 100 objects | 1920×1080  | on      |
| `shadow-on`       | shadow     | shadow mapping    | 100 objects | 1280×720   | on      |
| `shadow-off`      | shadow     | shadow mapping    | 100 objects | 1280×720   | off     |

Defaults: 30 warm-up frames, 120 measured frames, 3 runs. The object counts reported in results are
one higher than the scenario name suggests because the ground plane is part of every scene.

## What may and may not be concluded

- ✅ Compare scenarios **within one result file** (same machine, browser, driver, power state).
- ✅ Use the controlled comparisons in the generated report (shadow cost, resolution sensitivity,
  object-count scaling).
- ❌ Do not compare numbers from different machines and conclude one engine/GPU is faster.
- ❌ Do not claim LumenLab is faster than another engine. No such benchmark exists in this
  repository; a fair one would need equivalent scenes, shading and pass structure in both engines.
- ❌ Do not read software-adapter (SwiftShader) results as hardware performance. Files produced
  that way carry `softwareAdapter: true` and the report prints a warning.

## Result files

Written to `benchmarks/results/<timestamp>-<label>.{json,csv,md}`:

- `json` — summary rows (one per run, validated against `benchmarks/schemas/benchmark-result.schema.json`),
  the environment (browser, platform, adapter, limits, features, device pixel ratio, cores) and the
  raw per-frame samples.
- `csv` — the summary rows for spreadsheets.
- `md` — the human-readable report with the controlled comparisons.

## Reproducing

```bash
npm ci
npm run build
npm run bench -- --label my-machine
```

Close other GPU-heavy applications, plug in laptops, and run twice; large differences between runs
mean the machine was not in a steady state.

## Recorded runs in this repository

See [`recorded-run.md`](./recorded-run.md) for the run that ships with the repository and exactly
how it was produced.

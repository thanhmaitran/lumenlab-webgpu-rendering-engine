# 0008. Benchmark methodology and software-adapter labelling

- Status: Accepted
- Date: 2026-10-31

## Context

A single FPS figure says almost nothing: it depends on vsync, the browser, the driver, the power
state and what exactly was drawn. It is also easy to publish numbers that do not mean what they
appear to mean.

## Decision

- Scenarios vary one factor at a time; everything else is pinned (scene, camera, resolution,
  materials, lighting).
- Each run discards warm-up frames, then records per-frame samples; reports show median, p95 and
  the run-to-run range of several runs.
- Frame time is _submit → `onSubmittedWorkDone`_, independent of refresh rate. CPU time and GPU
  (timestamp-query) time are separate fields; unavailable metrics are `null`, never estimated.
- Result files record browser, platform, adapter, limits and whether the adapter is a software
  fallback. Software results are flagged in the file, the UI and the report.
- The repository makes no cross-engine speed claims.

## Consequences

- Numbers are only comparable inside one environment — stated everywhere they appear.
- The recorded run shipped in the repository is from a software adapter and says so.

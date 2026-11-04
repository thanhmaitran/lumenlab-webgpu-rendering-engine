# Benchmarks

This folder holds the **result schema** and **recorded runs**. Scenario definitions live in
`packages/benchmark/scenarios/definitions.ts`; the methodology is described in
[`docs/benchmarks/methodology.md`](../docs/benchmarks/methodology.md).

```
benchmarks/
├── schemas/benchmark-result.schema.json   JSON Schema (draft 2020-12) of one measured run
└── results/                               files written by `npm run bench` (JSON, CSV, Markdown)
```

## Producing results

Interactive: open the app, choose **Perf Lab**, select scenarios, **Run**, then export JSON/CSV/Markdown.

Command line (launches Chromium with WebGPU, runs the same code path as the UI, validates the file
against the schema, writes `benchmarks/results/<timestamp>-<label>.{json,csv,md}`):

```bash
npm run build
npm run bench -- --label my-laptop
npm run bench -- --scenarios shadow-on,shadow-off --label shadow-check
```

Options: `--runs`, `--warmup`, `--frames` (override workload size; recorded in the file),
`--screenshot <png>`, `--headed`, `--url <running server>`.

## Rules for results in this folder

- Every file was produced by a real run of this code. Nothing is hand-edited.
- A result is only comparable with results from the same machine, browser and driver state.
- Files produced with a software adapter (SwiftShader) are flagged `softwareAdapter: true`. They
  validate the measurement pipeline; they are **not** hardware GPU numbers.
- Metrics the environment cannot provide (for example GPU timestamps) are stored as `null`.

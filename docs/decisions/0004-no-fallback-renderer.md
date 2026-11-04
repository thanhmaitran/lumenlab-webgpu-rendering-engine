# 0004. No fallback renderer when WebGPU is unavailable

- Status: Accepted
- Date: 2026-10-31

## Context

`navigator.gpu` existing does not guarantee an adapter, and some browsers/drivers expose neither.
A silent fallback (WebGL, Canvas 2D, a placeholder image) would make it look like rendering works
and would make results, screenshots and benchmarks ambiguous.

## Decision

`Engine.create` actively requests an adapter and device. On any failure it throws an `EngineError`
with a machine-readable code and the workbench shows a precise notice (secure-context problem,
missing API, no adapter, device request failure, shader/pipeline error, device loss). There is no
fallback renderer.

## Consequences

- Visitors on unsupported browsers see an explanation instead of a degraded experience.
- Everything that appears on screen was produced by the WebGPU path.
- The end-to-end suite must handle "no adapter": renderer tests skip with an explicit reason.

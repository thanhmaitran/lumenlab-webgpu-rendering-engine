# 0009. Test the renderer without a GPU: mock device + offscreen presentation shim

- Status: Accepted
- Date: 2026-10-31

## Context

CI runners and many containers have no GPU. We still want to verify lifecycle logic on every commit
and exercise the real shaders in a browser where possible.

## Decision

Two complementary tools:

1. A recording **mock `GPUDevice`** (`tests/integration/support/mock-gpu.ts`) for Vitest. It cannot
   judge pixels, but proves resource lifecycle, resize, upload and device-loss behaviour.
2. Playwright with Chromium's **SwiftShader** software adapter for real shader execution. Where the
   software adapter destroys the device on canvas presentation, an opt-in shim
   (`PW_OFFSCREEN_PRESENT=1`) renders the same passes into an offscreen texture and paints the
   read-back onto an overlay canvas.

## Consequences

- Behaviour tests run everywhere; pixel tests run wherever Chromium can create a software adapter.
- The shim is test infrastructure only and is off by default so real GPUs exercise real presentation.
- Software-adapter results are never used as performance evidence (ADR 0008).

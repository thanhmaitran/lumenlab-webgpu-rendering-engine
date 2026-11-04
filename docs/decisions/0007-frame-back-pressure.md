# 0007. Bound frames in flight with `onSubmittedWorkDone`

- Status: Accepted
- Date: 2026-10-31

## Context

`requestAnimationFrame` fires at display rate whether or not the GPU keeps up. On a slow adapter
(including software ones) the CPU enqueues frames faster than they complete; the queue grows
without bound, latency increases every frame and any readback or screenshot shows stale content.
This was observed while testing on a software adapter: the screenshot assertions failed because the
image captured was many frames old.

## Decision

The renderer counts submissions and decrements the counter when `queue.onSubmittedWorkDone()`
resolves. The render loop skips an animation frame while two or more frames are in flight
(`MAX_FRAMES_IN_FLIGHT`). Skips are counted and exposed. Benchmarks bypass the loop and await
completion per frame explicitly.

## Consequences

- Bounded latency on slow GPUs; no unbounded memory growth in the queue.
- On fast GPUs the limit is never reached and behaviour is unchanged.
- The displayed frame rate on a slow adapter is lower than the display rate by design.

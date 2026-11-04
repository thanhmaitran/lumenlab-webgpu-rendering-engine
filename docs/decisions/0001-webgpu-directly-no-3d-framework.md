# 0001. Use WebGPU directly; no 3D framework

- Status: Accepted
- Date: 2026-10-31

## Context

The project exists to demonstrate computer-graphics and GPU-programming skill. Building on Three.js
or Babylon.js would make a nicer demo faster, but the interesting parts (maths, scene graph, pipelines,
shaders, resource lifecycle, shadow mapping) would be done by someone else's code.

## Decision

Rendering uses the WebGPU API directly with hand-written WGSL. Vector/matrix/quaternion maths, the
scene graph, procedural geometry, lighting, shadow mapping and GPU resource management are
implemented in this repository. React, Vite, Vitest and Playwright are allowed as tooling and UI.

## Consequences

- Browser support is limited to WebGPU-capable browsers (see ADR 0004 for how absence is handled).
- Every behaviour must be tested by us; there is no upstream test suite to lean on.
- The engine is small enough to read end to end, which is part of the point.

## Alternatives considered

- **Three.js / Babylon.js** — rejected: defeats the purpose of the project.
- **WebGL 2** — wider support, but WebGPU's explicit pipelines, bind groups and depth-texture
  sampling are the skills being demonstrated.
- **A software rasterizer** — rejected for the first version: WebGPU already rasterizes; the project
  controls the pipeline stages around it instead of reimplementing them on the CPU.

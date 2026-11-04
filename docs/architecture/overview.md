# Architecture overview

LumenLab is three cooperating pieces in one npm-workspaces monorepo. The dependency direction is
strictly downward; nothing below ever imports anything above it.

```
┌──────────────────────────────────────────────────────────────┐
│ apps/workbench      React UI · scene tree · inspector · Lab   │  depends on engine, benchmark
├──────────────────────────────────────────────────────────────┤
│ packages/benchmark  scenarios · runner · statistics · reports │  depends on engine (types only)
├──────────────────────────────────────────────────────────────┤
│ packages/engine     maths · scene · geometry · renderer · WGSL│  no UI, no benchmark knowledge
├──────────────────────────────────────────────────────────────┤
│ WebGPU              device · buffers · textures · pipelines   │  browser API
└──────────────────────────────────────────────────────────────┘
```

## Packages

### `packages/engine` — `@lumenlab/engine`

| Folder         | Responsibility                                                                           |
| -------------- | ---------------------------------------------------------------------------------------- |
| `math/`        | `Vector3`, `Quaternion`, `Matrix4`, `Aabb`. Immutable value types, column-major.         |
| `geometry/`    | Indexed `MeshData`, procedural cube/plane/sphere/torus, validation, wireframe edges.     |
| `camera/`      | `PerspectiveCamera` and a DOM-free `OrbitController`.                                    |
| `scene/`       | `SceneNode` hierarchy, `Scene`, `SceneDefinition`, CPU picking, three presets.           |
| `materials/`   | `MaterialParams` (base colour, roughness, metalness, emissive, checker) + sanitising.    |
| `lighting/`    | Directional and point lights, directional shadow-matrix fitting.                         |
| `gpu/`         | `GpuResourceTracker`, `GpuMeshCache` (shared vertex/index buffers), procedural textures. |
| `renderer/`    | `Renderer` (the WebGPU backend), uniform layouts, render settings.                       |
| `diagnostics/` | WebGPU capability detection, adapter report, frame statistics, diagnostic log.           |
| `core/`        | `Engine` — the facade the UI talks to; render loop; typed events; `EngineError`.         |
| `shaders/`     | `mesh.wgsl`, imported as a raw string at build time.                                     |

### `packages/benchmark` — `@lumenlab/benchmark`

Scenario definitions (`scenarios/definitions.ts`), the runner (`runScenario`, `runSuite`) which only
needs a small `BenchmarkTarget` interface, statistics and aggregation, result validation against the
schema in `benchmarks/schemas/`, and CSV / JSON / Markdown report generation.

### `apps/workbench` — `@lumenlab/workbench`

A React 19 + Vite application. `WorkbenchStore` is a plain TypeScript store (subscribed to through
`useSyncExternalStore`) that owns the `Engine`, translates UI actions into engine commands and
republishes engine state. Components are presentation only.

## The rule that keeps this honest

> React never creates GPU buffers and never owns a render loop.

The UI calls typed methods such as `engine.setMaterial(id, { roughness: 0.45 })` and
`engine.setRenderSettings({ shadowsEnabled: true, renderScale: 1 })`. Everything below that call —
validation, dirty tracking, uploads, pass encoding — is the engine's business. The end-to-end test
"the render loop stops after the app unmounts" and the integration tests for resource lifecycle
exist to defend this boundary.

## Data flow of one frame

```
requestAnimationFrame
  └─ Engine.tick
       ├─ back-pressure check (≥ 2 frames in flight → skip this animation frame)
       ├─ OrbitController.apply(camera)
       └─ Renderer.render()
            ├─ sync GPU meshes with the scene (acquire/release shared buffers)
            ├─ upload per-object data   — only when the scene epoch / selection / count changed
            ├─ upload per-frame uniforms (camera, light, shadow matrix, settings)
            ├─ shadow pass              — depth-only, if a directional light casts shadows
            ├─ main pass                — lit | normals | depth | shadow | wireframe
            └─ queue.submit, then track completion via onSubmittedWorkDone
```

## Failure model

There is **no fallback renderer**. If WebGPU, an adapter or a device cannot be obtained,
`Engine.create` throws an `EngineError` with a machine-readable code
(`webgpu-unavailable`, `adapter-unavailable`, `device-request-failed`, `canvas-context-failed`,
`shader-compilation-failed`, `pipeline-creation-failed`, …) and the workbench renders an explicit
notice. If the device is lost mid-session the render loop stops, the Diagnostics log records the
reason, and the user can recreate the engine from the viewport overlay. The renderer never touches
a lost device.

## Resource ownership

Every buffer and texture is created through `GpuResourceTracker`, which counts live objects and
bytes and destroys exactly once. `GpuMeshCache` reference-counts shared geometry (ten spheres with
the same parameters share one vertex and one index buffer). Replacing the scene releases the old
meshes; `Renderer.dispose()` destroys everything and the device, and is idempotent.

## Related documents

- [Rendering pipeline](../rendering/pipeline.md)
- [Benchmark methodology](../benchmarks/methodology.md)
- [Testing strategy](../testing.md)
- [Architecture decision records](../decisions/)

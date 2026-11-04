# Contributing to LumenLab

Thanks for your interest. LumenLab is an engineering showcase: correctness, honesty about
measurements and a clean architecture matter more than feature count.

## Ground rules

1. **The engine owns rendering.** React code never creates GPU resources or runs a render loop. It
   sends typed commands to `Engine` (see `packages/engine/src/core/engine.ts`).
2. **No 3D frameworks.** Do not add Three.js, Babylon.js, gl-matrix or any other library that
   replaces the maths, scene graph or renderer. Small tooling dependencies are fine.
3. **A feature exists when it works and is tested** — not when a button exists for it.
4. **No invented numbers.** Benchmark results, screenshots and performance claims must be produced
   by running this repository. Say which environment produced them.
5. **No silent fallbacks.** If WebGPU is unavailable the app says so; it does not switch to another
   renderer.

## Setup

```bash
node --version   # >= 22.12
npm ci
npm run dev      # http://localhost:5173
```

Use a Chromium-based browser with WebGPU (Chrome or Edge, recent versions). `localhost` counts as a
secure context.

## Before you open a pull request

```bash
npm run verify   # typecheck + lint + format check + tests + production build
npm run test:e2e # browser tests (needs Playwright's Chromium; see docs/testing.md)
```

CI runs the same checks. Auto-fix formatting with `npm run format`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), one logical step per commit:

```
feat(math): add quaternion slerp
fix(renderer): recreate depth texture on resize
test(geometry): validate sphere normals
docs: document the shadow pass
chore: bump dependencies
```

## Where things go

| Change                           | Location                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| Maths, geometry, scene, renderer | `packages/engine/src/<area>/` with tests in `tests/`         |
| WGSL                             | `packages/engine/shaders/` (layouts mirrored in `layout.ts`) |
| Benchmark scenarios / statistics | `packages/benchmark/`                                        |
| UI                               | `apps/workbench/src/`                                        |
| Architecture decisions           | `docs/decisions/NNNN-title.md` (copy the template)           |

## Changing a shader uniform layout

The WGSL structs and `packages/engine/src/renderer/layout.ts` must change together.
`packages/engine/tests/shader-layout.test.ts` parses the shader and fails if they drift.

## Reporting bugs

Include the browser and version, OS, GPU/adapter string (shown in the app header and in the
Diagnostics tab) and the Diagnostics log. Many rendering problems are driver specific.

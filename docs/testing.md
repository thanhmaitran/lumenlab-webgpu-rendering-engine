# Testing strategy

Four layers, each answering a different question. All of them are wired into `npm` scripts and CI.

| Layer                  | Location             | Runner                    | Needs a GPU?                          | Question answered                                                               |
| ---------------------- | -------------------- | ------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| Unit                   | `packages/*/tests/`  | Vitest                    | no                                    | Is the maths, geometry, scene, statistics and report code correct?              |
| Integration            | `tests/integration/` | Vitest + mock `GPUDevice` | no                                    | Does the renderer manage resources, resizes, uploads and device loss correctly? |
| End-to-end             | `tests/e2e/`         | Playwright (Chromium)     | a WebGPU adapter (software is enough) | Does the real app render, respond to input and measure?                         |
| Performance regression | benchmark harness    | `npm run bench`           | yes, on a fixed machine               | Did a change alter workload counts or timing in a controlled environment?       |

```bash
npm test            # unit + integration (223 tests, a few seconds)
npm run test:e2e    # browser tests
npm run verify      # typecheck + lint + format + tests + build
```

## Unit tests

- `Vector3`, `Quaternion`, `Matrix4`: identities, associativity, multiplication **order**, inverse,
  `compose`/`decompose`, `lookAt` (including an `up` vector parallel to the view direction),
  perspective/orthographic depth range `[0, 1]`.
- Geometry: every index in range, no degenerate triangles, normals unit length and consistent with
  winding, UVs in range, bounds, sphere/torus vertex counts.
- Scene graph: world matrices through hierarchy, re-parenting, cycle rejection, duplicate ids,
  picking.
- Shader layout: the WGSL structs are parsed and compared to `layout.ts`.
- Benchmark: statistics, aggregation, schema validation, report text, runner behaviour with a fake
  target (including abort and error paths).

## Integration tests (mock GPU)

`tests/integration/support/mock-gpu.ts` is a recording stand-in for `GPUDevice`. It cannot judge
pixels, but it can prove behaviour that otherwise only fails on someone else's machine:

- depth texture is recreated and the old one destroyed on every size change; none when unchanged
- render scale and pinned benchmark size feed the backing store correctly
- per-object data is re-uploaded after a material **or** transform edit, and not otherwise
- the shadow pass is skipped when shadows are off; wireframe draws fill + lines
- device loss marks the renderer lost, notifies listeners, and nothing is submitted afterwards
- `dispose()` destroys every tracked buffer/texture, is idempotent, and is not reported as loss
- shader compile errors and missing canvas contexts surface as typed `EngineError`s
- frames-in-flight bookkeeping used for back-pressure

## End-to-end tests

Chromium is launched with WebGPU flags. On machines without a GPU it uses the **SwiftShader**
software adapter, which executes the real renderer and shaders but is not a performance reference.

Some software-GPU containers destroy the device the moment a frame is _presented_ to a canvas.
Setting `PW_OFFSCREEN_PRESENT=1` installs `tests/e2e/shims/offscreen-present.js`, which keeps the
real render passes and redirects only the final presentation to an offscreen texture that is read
back and painted onto an overlay canvas. This is test infrastructure only; leave it unset on real
GPUs so the genuine presentation path is exercised.

Covered: first paint is not blank (colour-variety check on a real screenshot), scene tree contents,
inspector edits reach engine state, viewport picking, every view mode changes the image, shadow
toggle changes the image, render scale changes the backing store, diagnostics show real draw-call
counts, the render loop stops on dispose, preset switching leaves no errors and no device loss, and
the Performance Lab produces a schema-valid, honestly-labelled result.

If no WebGPU adapter can be created the renderer tests **skip with an explicit reason**; the shell
test still asserts that the precise "WebGPU is not available" notice is shown.

First run on a machine (and after Playwright updates): `npx playwright install chromium`. Without it every
browser test fails at launch with _Executable doesn't exist_; see [troubleshooting](troubleshooting.md).

```bash
# Linux/macOS, a system Chromium instead of the Playwright download:
PW_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# software-GPU container:
PW_NO_SANDBOX=1 PW_OFFSCREEN_PRESENT=1 npm run test:e2e
```

PowerShell equivalents: `$env:PW_OFFSCREEN_PRESENT = "1"; npm run test:e2e`.

## Bugs the suite is designed to catch

| Failure mode                                       | Where it is tested                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Camera `up` parallel to view direction             | unit (`lookAt`)                                                      |
| Matrix multiplied in the wrong order               | unit (compose / TRS cases)                                           |
| Index outside the vertex buffer                    | unit (geometry validation)                                           |
| Non-unit normals                                   | unit (geometry validation)                                           |
| Resize without recreating the depth texture        | integration                                                          |
| Device lost but old resources still used           | integration                                                          |
| Material changed in the UI, GPU buffer not updated | integration + e2e                                                    |
| Render loop keeps running after unmount/dispose    | e2e                                                                  |
| Uniform struct drift between WGSL and TypeScript   | unit (`shader-layout`)                                               |
| GPU queue growing without bound on slow adapters   | integration (in-flight accounting) + e2e screenshots staying current |

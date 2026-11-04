# Architecture decision records

Short records of decisions that shaped the project, including the trade-offs accepted. Add a new
file (`NNNN-short-title.md`, copy [`0000-template.md`](./0000-template.md)) whenever a decision is
hard to reverse or would surprise a new contributor.

| ADR                                                      | Decision                                                                   | Status   |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | -------- |
| [0001](./0001-webgpu-directly-no-3d-framework.md)        | Use WebGPU directly; no 3D framework                                       | Accepted |
| [0002](./0002-monorepo-engine-independent-of-react.md)   | npm-workspaces monorepo; engine independent of React                       | Accepted |
| [0003](./0003-procedural-geometry-only.md)               | Geometry is procedural; no model loading                                   | Accepted |
| [0004](./0004-no-fallback-renderer.md)                   | No fallback renderer when WebGPU is unavailable                            | Accepted |
| [0005](./0005-wireframe-as-line-list.md)                 | Wireframe as a line-list over a hidden-surface fill                        | Accepted |
| [0006](./0006-single-instance-buffer-dynamic-offsets.md) | One instance uniform buffer addressed with dynamic offsets                 | Accepted |
| [0007](./0007-frame-back-pressure.md)                    | Bound frames in flight with `onSubmittedWorkDone`                          | Accepted |
| [0008](./0008-benchmark-honesty.md)                      | Benchmark methodology and software-adapter labelling                       | Accepted |
| [0009](./0009-testing-without-a-gpu.md)                  | Test the renderer without a GPU: mock device + offscreen presentation shim | Accepted |

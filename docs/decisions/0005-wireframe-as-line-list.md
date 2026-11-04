# 0005. Wireframe as a line-list over a hidden-surface fill

- Status: Accepted
- Date: 2026-10-31

## Context

WebGPU has no polygon-mode switch (`glPolygonMode`). Wireframe rendering needs another approach.

## Decision

For each mesh the renderer lazily builds a deduplicated edge index buffer and draws it with a
`line-list` pipeline. A first pass fills the mesh with the background colour and writes depth so
back-facing and hidden edges are removed; the line pass then uses `depthCompare: "less-equal"`
without writing depth.

## Consequences

- Correct hidden-line removal with two draws per object (the draw counter reports both).
- Extra GPU memory for edge buffers, allocated only when wireframe mode is used.
- Lines are one pixel wide; WebGPU has no line-width control.

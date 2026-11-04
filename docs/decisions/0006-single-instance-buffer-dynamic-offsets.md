# 0006. One instance uniform buffer addressed with dynamic offsets

- Status: Accepted
- Date: 2026-10-31

## Context

Each object needs a model matrix, a normal matrix and material parameters. A buffer and bind group
per object makes the Scale Test scenes allocation-heavy and slows scene switches.

## Decision

All per-object data lives in one uniform buffer. Each object occupies a slot padded to the device's
`minUniformBufferOffsetAlignment`, and a single bind group is bound per draw with a dynamic offset.
The buffer grows geometrically; data is re-uploaded only when the scene epoch, the selection or the
object count changes.

## Consequences

- N objects cost one buffer and N draw calls; no per-object GPU allocations.
- Each slot is padded (176 bytes of data in a 256-byte slot on typical devices).
- Instancing (one draw for many identical meshes) is a possible later optimisation; it is not
  implemented, and the benchmark report states the draw-call count it measured.

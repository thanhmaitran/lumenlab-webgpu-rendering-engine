# 0003. Geometry is procedural; no model loading

- Status: Accepted
- Date: 2026-10-31

## Context

Loading glTF/OBJ files would add parsers, asset licensing questions and large binary files, and the
engine's correctness would depend on third-party content.

## Decision

Meshes are generated in code (cube, plane, sphere, torus). Every scene is described by a
`SceneDefinition` that is pure data, so scenes are deterministic and benchmark workloads are
exactly reproducible.

## Consequences

- No asset pipeline, no licensing risk, tiny repository.
- Mesh validation (index range, unit normals, winding) can be exhaustively unit-tested.
- The engine cannot yet show real-world models. Importers are a possible roadmap item.

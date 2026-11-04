# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - Initial release

### Added

- **Engine** (`@lumenlab/engine`): `Vector3`, `Quaternion`, `Matrix4`, AABB; scene graph and
  declarative scene definitions; orbit camera; procedural cube, plane, sphere and torus with
  validation; material parameters; directional and point lights.
- **WebGPU renderer**: adapter/device/context initialisation with typed failures, WGSL shading
  (GGX, Smith, Schlick, ACES), depth testing, shadow mapping with PCF, view modes (lit, wireframe,
  normals, depth, shadow), render scale, GPU resource tracking, device-loss handling, frame
  back-pressure, optional timestamp-query pass timing.
- **Workbench** (`@lumenlab/workbench`): viewport with orbit/pan/zoom/picking, scene hierarchy,
  inspector, render settings, diagnostics, Performance Lab.
- **Benchmark package** (`@lumenlab/benchmark`): seven one-factor-at-a-time scenarios, runner,
  statistics, JSON Schema validation, JSON / CSV / Markdown reports, CLI (`npm run bench`).
- **Tests**: 223 Vitest tests (unit and mock-GPU integration), 13 Playwright tests.
- **Tooling**: npm workspaces, TypeScript project setup, ESLint (engine may not import React),
  Prettier, GitHub Actions CI and GitHub Pages deployment.
- **Documentation**: architecture overview, rendering pipeline, benchmark methodology, testing
  strategy, nine architecture decision records, deployment guide, release checklist.

### Documentation

- README rewritten with gallery, verified-environments table, troubleshooting and architecture
  diagram; added `docs/troubleshooting.md` and Windows verification evidence.

### Known limitations

See the "Limitations" section of the [README](README.md).

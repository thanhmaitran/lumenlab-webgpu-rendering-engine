# Release checklist

Each item records **what evidence exists** and **where it was produced**. "Local" means it was
verified by running the command in a Linux development container (Node 22, Chromium with the
SwiftShader software WebGPU adapter). Items that depend on GitHub are marked **Pending** until you
push the repository; they cannot be verified from a local checkout.

Status: **17 of 19 verified locally, 2 pending your push.**

## Foundation

| Item                         | Status   | Evidence                                                                 |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| npm workspace installs       | Verified | `npm ci` / `npm ls` resolve `@lumenlab/engine`, `benchmark`, `workbench` |
| TypeScript, lint, tests work | Verified | `npm run typecheck`, `npm run lint`, `npm test` all exit 0               |
| Workbench runs locally       | Verified | production build succeeds; Playwright loads it and the engine starts     |

## Core rendering

| Item                                | Status            | Evidence                                                                                                                                                                             |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Vector and matrix unit tests        | Verified          | `packages/engine/tests/math.test.ts` (multiplication order, inverse, projections, lookAt)                                                                                            |
| Camera and procedural geometry work | Verified          | `camera.test.ts`, `geometry.test.ts` (indices, normals, winding, bounds)                                                                                                             |
| WebGPU renderer draws a real mesh   | Verified          | e2e "draws real geometry, not a blank canvas"; screenshots in `docs/images/`                                                                                                         |
| Depth testing works                 | Verified (visual) | Screenshots show objects occluding each other and the ground; wireframe mode removes hidden edges via the depth-writing fill. There is no automated pixel-level depth assertion yet. |

## Rendering features

| Item                               | Status   | Evidence                                                                    |
| ---------------------------------- | -------- | --------------------------------------------------------------------------- |
| Scene graph and material system    | Verified | `scene.test.ts`; e2e inspector edit reaches engine state                    |
| Directional lighting and normals   | Verified | shader layout test; Normals view mode e2e; lit screenshots                  |
| Shadow mapping has evidence        | Verified | e2e "shadow toggle changes the lit image"; `docs/images/shadow-mapping.png` |
| Diagnostics reflect real rendering | Verified | e2e "diagnostics report real, non-zero workload numbers"                    |

## Engineering quality

| Item                                | Status   | Evidence                                                                                  |
| ----------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| GPU resource lifecycle managed      | Verified | `gpu-resources.test.ts`, integration "resource lifecycle" and "device loss" suites        |
| Browser and integration tests       | Verified | 223 Vitest tests, 13 Playwright tests, all passing                                        |
| Reproducible benchmark scenarios    | Verified | `scenarios.test.ts` (one varied factor per group, deterministic scenes); CLI run recorded |
| Honest limitations and measurements | Verified | README limitations, `docs/benchmarks/methodology.md`, `softwareAdapter` flag in results   |

## Public release

| Item                                | Status      | Evidence / next step                                                                |
| ----------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| README and project-made screenshots | Verified    | `README.md`; images captured by `npm run screenshots` from the running app          |
| GitHub Actions succeed              | **Pending** | Workflows exist and use the same commands as locally; push and read the Actions tab |
| License and install instructions    | Verified    | `LICENSE` (MIT), README "Getting started", `docs/deployment.md`                     |
| Demo deployed and checked           | **Pending** | `deploy-pages.yml` exists; follow `docs/deployment.md` section 4 and open the URL   |

## Verified on a developer machine

| Environment                                     | Result                                                                                  | Evidence                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| Windows (NT 10.0.26200), Edge 156, hardware GPU | `npm run verify`: typecheck, lint, format, 223 tests in 12 files, build all pass        | `images/local-run/npm-run-verify-windows.png` |
| Same machine                                    | `edge://gpu`: WebGPU _Hardware accelerated_                                             | `images/local-run/edge-gpu-status.png`        |
| Same machine                                    | `npm run test:e2e`: not yet run successfully; failed at launch (browser not downloaded) | fix: `npx playwright install chromium`        |

## What this checklist does not claim

- No hardware-GPU performance numbers exist in this repository.
- The application itself has not yet been captured running on a hardware GPU (only the environment
  report and the test run are recorded); browsers other than Chromium/Edge were not verified.
- The GPU presentation path (as opposed to the software offscreen shim used for the e2e screenshots)
  should be exercised once on your own machine: run `npm run dev` and confirm the viewport updates.

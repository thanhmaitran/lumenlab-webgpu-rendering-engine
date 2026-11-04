# Deployment and publishing

This guide takes the local repository to a public GitHub repository with a deployed demo.
Nothing below has been executed for you: pushing and deploying need your GitHub account.

## 1. Final local checks

```powershell
git status                 # nothing unexpected; no node_modules, dist, .env, logs
npm ci
npm run verify             # typecheck + lint + format check + tests + production build
npm run test:e2e           # needs Chromium; see docs/testing.md
```

Search for anything that must not be public:

```powershell
git ls-files | Select-String -Pattern "\.env|node_modules|dist/|\.log$"
```

The command should print nothing. Benchmark files in `benchmarks/results/` must come from real runs
and must say which adapter produced them.

## 2. Create the repository

1. On GitHub: **New repository**, name `lumenlab-webgpu-rendering-engine`, **Public**, no README,
   no `.gitignore`, no license (they already exist locally).
2. Description: _A from-scratch real-time 3D rendering engine and interactive WebGPU workbench built
   with TypeScript and WGSL, featuring procedural geometry, lighting, shadow mapping, rendering
   diagnostics, and reproducible performance benchmarks._
3. Topics: `webgpu`, `wgsl`, `typescript`, `computer-graphics`, `rendering-engine`, `react`, `vite`.

```powershell
git remote add origin https://github.com/<your-username>/lumenlab-webgpu-rendering-engine.git
git branch -M main
git push -u origin main
```

## 3. Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. `verify`: `npm ci`, type check, lint, format check, unit + integration tests, production build.
2. `e2e`: installs Chromium and runs the Playwright suite with the SwiftShader software adapter.
   GitHub-hosted runners have no GPU, so this validates rendering correctness only. If an adapter
   cannot be created, the renderer tests skip with an explicit reason.

Open the **Actions** tab after the first push and confirm both jobs are green before announcing the
project. If `e2e` shows skipped renderer tests, read the skip reason.

## 4. GitHub Pages demo

`.github/workflows/deploy-pages.yml` builds the workbench with `LUMENLAB_BASE=/<repo-name>/` and
publishes `apps/workbench/dist`.

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main` (or run the workflow manually from the Actions tab).
3. The demo URL appears in the workflow summary: `https://<your-username>.github.io/<repo-name>/`.

GitHub Pages is served over HTTPS, so WebGPU's secure-context requirement is satisfied.

### Verify the deployed demo

Open the URL in Chrome or Edge on a machine with a GPU:

- The header shows **GPU READY** and your adapter name.
- The viewport renders the Geometry Studio scene; dragging orbits the camera.
- Diagnostics shows non-zero draw calls and triangles.
- In a browser without WebGPU you see the explicit "WebGPU is not available" notice.

Only after that, add the demo URL to the repository description and to the top of `README.md`.
A deployed demo that was never opened is not a verified demo.

## 5. Optional: regenerate screenshots and benchmarks on your hardware

```powershell
npm run build
npm run screenshots          # overwrites docs/images/*.png from your GPU
npm run bench -- --label my-laptop
```

Commit the generated files only if you want your hardware results in the repository, and keep the
adapter name in the file name or label.

## 6. Repository hygiene

- Enable branch protection on `main` requiring the `verify` job.
- Keep `package-lock.json` committed; CI uses `npm ci`.
- Tag releases (`git tag v0.1.0 && git push --tags`) and update [`CHANGELOG.md`](../CHANGELOG.md).

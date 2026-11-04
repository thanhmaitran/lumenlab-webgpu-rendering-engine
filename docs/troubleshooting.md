# Troubleshooting

## Checking that your browser really has WebGPU

1. Open `chrome://gpu` (Chrome) or `edge://gpu` (Edge).
2. Under **Graphics Feature Status**, the **WebGPU** line should say _Hardware accelerated_.
3. Start the app (`npm run dev`) and open <http://localhost:5173>. The header should show **GPU
   READY** and your adapter name.

An example of a healthy report (Edge 156 on Windows) is in
[`images/local-run/edge-gpu-status.png`](images/local-run/edge-gpu-status.png).

If the app shows a "WebGPU is not available" notice, it names the step that failed:

| Code                        | Meaning                                      | What to try                                         |
| --------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `webgpu-unavailable`        | `navigator.gpu` is missing                   | Recent Chrome/Edge; use `localhost` or HTTPS        |
| `adapter-unavailable`       | The browser could not get a GPU adapter      | Update the driver; enable hardware acceleration     |
| `device-request-failed`     | The adapter refused to create a device       | Close other GPU-heavy apps; restart the browser     |
| `canvas-context-failed`     | The canvas could not create a WebGPU context | Reload; check for extensions that block canvas APIs |
| `shader-compilation-failed` | A WGSL module failed to compile              | Copy the Diagnostics log into a bug report          |

There is intentionally no fallback renderer, so the notice is the correct behaviour on unsupported
systems.

## Playwright: "Executable doesn't exist"

`npm run test:e2e` needs the browser build matching the installed Playwright version. After
`npm ci`, or after Playwright is updated, download it once:

```powershell
npx playwright install chromium
npm run test:e2e
```

Without this step every browser test fails at launch with _Executable doesn't exist at ...
ms-playwright..._ and the message _Looks like Playwright was just installed or updated_. That is a
missing download, not a defect in the tests or the renderer.

On Linux containers without a GPU you may additionally need:

```bash
PW_NO_SANDBOX=1 PW_OFFSCREEN_PRESENT=1 npm run test:e2e
```

and, to use a system Chromium, `PW_CHROMIUM_PATH=/path/to/chromium`.

## The header says "google swiftshader"

The browser is using its software adapter. Rendering is correct but slow, GPU timestamp queries may
behave differently, and any benchmark result is flagged `softwareAdapter: true`. On a machine with a
GPU, check `chrome://gpu` / `edge://gpu` and the browser's _Use graphics acceleration when
available_ setting.

## Frame time looks high or jumpy

- Compare **Frame interval** (display-paced) with **CPU submit** in the Diagnostics tab; a small CPU
  time with a large interval means the GPU or the display is the limit.
- Reduce **Render scale** to see whether the cost follows the pixel count.
- The loop skips animation frames when two frames are already in flight; the skip count is
  available as `Engine.skippedFrameCount`.

## `npm` and Node

- `npm ci` requires Node 22.12 or newer (`node --version`).
- Use `npm ci` rather than `npm install` to reproduce the locked dependency versions.
- Keep the repository one folder deep; a nested copy of the repository inside itself makes `git
status` and relative paths confusing.

## Reporting a bug

Include browser and version, OS, the adapter string from the header, and the Diagnostics log. Many
rendering problems are driver specific.

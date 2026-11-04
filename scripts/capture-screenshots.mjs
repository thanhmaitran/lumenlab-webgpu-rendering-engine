#!/usr/bin/env node
// Capture the screenshots used in the README from the running workbench. Every image is real
// engine output; nothing is mocked or composited from other products.
//
//   npm run screenshots -- [--url http://localhost:5173] [--build] [--headed]
//   Software-GPU containers only: --software --offscreen-present --no-sandbox
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  launchBrowser,
  openWorkbench,
  parseArgs,
  ROOT,
  serveWorkbench,
  syncFrame,
} from "./lib/browser.mjs";

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(ROOT, "docs/images");
mkdirSync(outDir, { recursive: true });

const server = await serveWorkbench(args);
const browser = await launchBrowser(args);
let exitCode = 0;

async function canvasShot(page, name) {
  await syncFrame(page);
  const path = resolve(outDir, name);
  await page.getByTestId("viewport-canvas").screenshot({ path });
  console.log(`  ${name}`);
  return path;
}

try {
  const { context, page } = await openWorkbench(browser, server.url, args);
  const store = (fn, arg) => page.evaluate(fn, arg);

  // 1. Geometry Studio, lit, with shadows
  await store(() => window.__lumenlab.store.loadPreset("geometry-studio"));
  await store(() =>
    window.__lumenlab.store.setRenderSettings({ mode: "lit", shadowsEnabled: true }),
  );
  await canvasShot(page, "geometry-studio.png");

  // 2. Shadow mapping evidence: same view with shadows on and the shadow-visibility mode
  await store(() => window.__lumenlab.store.setRenderSettings({ mode: "shadow" }));
  const shadowVis = await canvasShot(page, "shadow-mapping.png");

  // 3. Diagnostics montage: the same view in four modes
  const modes = [
    ["lit", "LIT"],
    ["normals", "NORMALS"],
    ["depth", "DEPTH"],
    ["wireframe", "WIREFRAME"],
  ];
  const shots = [];
  for (const [mode, title] of modes) {
    await store(
      (m) => window.__lumenlab.store.setRenderSettings({ mode: m, shadowsEnabled: true }),
      mode,
    );
    await syncFrame(page);
    const buf = await page.getByTestId("viewport-canvas").screenshot();
    shots.push({ title, data: buf.toString("base64") });
  }
  const montage = await context.newPage();
  await montage.setViewportSize({ width: 1600, height: 900 });
  await montage.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#15161a;color:#ece8dc;font:600 13px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em}
    .g{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;height:880px}
    figure{margin:0;position:relative;overflow:hidden;border:1px solid #3a3b42;background:#0e0f12}
    img{width:100%;height:100%;object-fit:cover;display:block}
    figcaption{position:absolute;left:10px;top:10px;padding:5px 8px;background:rgba(14,15,18,.82);color:#d9b86a;border:1px solid #3a3b42}
  </style><div class="g">${shots
    .map(
      (s) =>
        `<figure><img src="data:image/png;base64,${s.data}"><figcaption>${s.title}</figcaption></figure>`,
    )
    .join("")}</div>`);
  await montage.screenshot({ path: resolve(outDir, "render-diagnostics.png") });
  await montage.close();
  console.log("  render-diagnostics.png");

  // 4. Material gallery
  await store(() => {
    const s = window.__lumenlab.store;
    s.loadPreset("material-gallery");
    s.setRenderSettings({ mode: "lit", shadowsEnabled: true });
  });
  await canvasShot(page, "material-gallery.png");

  // 5. Whole workbench with a selected object and the inspector open
  await store(() => {
    const s = window.__lumenlab.store;
    s.loadPreset("geometry-studio");
    s.setRenderSettings({ mode: "lit", shadowsEnabled: true });
    s.selectObject("sphere");
  });
  await page.getByRole("tab", { name: "Inspect" }).click();
  await syncFrame(page, 900);
  await page.screenshot({ path: resolve(outDir, "workbench-overview.png") });
  console.log("  workbench-overview.png");
  void shadowVis;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await browser.close();
  server.stop();
}
process.exit(exitCode);

// Shared helpers for the CLI scripts: serve the production build, launch Chromium with the WebGPU
// flags the e2e suite uses, and (optionally) install the offscreen-present test shim.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIM = resolve(ROOT, "tests/e2e/shims/offscreen-present.js");

/** Minimal `--key value` / `--flag` argument parser. */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: "inherit", shell: true, ...options });
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${command} ${args.join(" ")} -> ${code}`)),
    );
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not start at ${url}`);
}

/**
 * Returns `{ url, stop }`. With `--url` the caller's server is used; otherwise the production build
 * is (re)built when missing or when `--build` is passed, and served with `vite preview`.
 */
export async function serveWorkbench(args, port = 4174) {
  if (typeof args.url === "string") return { url: args.url.replace(/\/$/, ""), stop: () => {} };
  if (args.build || !existsSync(resolve(ROOT, "apps/workbench/dist/index.html"))) {
    await run("npm", ["run", "build"]);
  }
  const server = spawn(
    "npm",
    [
      "run",
      "preview",
      "--workspace",
      "@lumenlab/workbench",
      "--",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: ROOT, stdio: "ignore", shell: true, detached: true },
  );
  const url = `http://localhost:${port}`;
  await waitForServer(url);
  return {
    url,
    stop: () => {
      try {
        process.kill(-server.pid);
      } catch {
        server.kill();
      }
    },
  };
}

/**
 * Launch Chromium with WebGPU enabled. In a container without a GPU it falls back to the
 * SwiftShader software adapter, which is fine for correctness checks but NOT for performance claims.
 */
export async function launchBrowser(args) {
  const noSandbox = process.env.CI || process.env.PW_NO_SANDBOX || args["no-sandbox"];
  return chromium.launch({
    headless: !args.headed,
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    args: [
      ...(noSandbox ? ["--no-sandbox"] : []),
      "--enable-unsafe-webgpu",
      "--enable-features=Vulkan,WebGPU",
      ...(args.software
        ? [
            "--enable-unsafe-swiftshader",
            "--use-angle=swiftshader",
            "--use-webgpu-adapter=swiftshader",
            "--ignore-gpu-blocklist",
          ]
        : []),
    ],
  });
}

/** Open the workbench and wait until the engine reports ready (throws if WebGPU is unavailable). */
export async function openWorkbench(
  browser,
  baseUrl,
  args,
  viewport = { width: 1600, height: 900 },
) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  if (args["offscreen-present"]) {
    if (args["no-auto-sync"])
      await page.addInitScript({ content: "window.__offscreenPresentNoAuto = true;" });
    await page.addInitScript({ content: readFileSync(SHIM, "utf8") });
  }
  await page.goto(`${baseUrl}/?debug`);
  const status = page.getByTestId("gpu-status");
  await page.waitForFunction(
    () => document.querySelector('[data-testid="gpu-status"]')?.textContent !== "INITIALIZING",
    undefined,
    { timeout: 60_000 },
  );
  const text = await status.innerText();
  if (text !== "GPU READY") {
    const notice = await page
      .getByTestId("unsupported-notice")
      .innerText()
      .catch(() => text);
    throw new Error(`WebGPU is not usable in this browser: ${notice}`);
  }
  return { context, page };
}

/** With the shim active, repaint the overlay so screenshots contain the latest GPU frame. */
export async function syncFrame(page, settleMs = 700) {
  await page.waitForTimeout(settleMs);
  await page.evaluate(async () => {
    await window.__offscreenPresent?.sync();
  });
}

import { defineConfig } from "@playwright/test";

const PORT = 4173;

// WebGPU in headless Chromium needs flags; software adapters (SwiftShader) are
// enough to validate rendering correctness, NOT to measure performance.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      // Optional override, e.g. a system Chromium: PW_CHROMIUM_PATH=/usr/bin/chromium
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: [
        ...(process.env.CI || process.env.PW_NO_SANDBOX ? ["--no-sandbox"] : []),
        "--enable-unsafe-swiftshader",
        "--enable-unsafe-webgpu",
        "--enable-features=Vulkan,WebGPU",
        "--use-angle=swiftshader",
        "--use-webgpu-adapter=swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  webServer: {
    command: `npm run build && npm run preview --workspace @lumenlab/workbench -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});

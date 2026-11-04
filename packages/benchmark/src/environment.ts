import type { AdapterReport } from "@lumenlab/engine";
import type { BenchmarkEnvironment } from "./types";

/** Best-effort browser name + major version from a user-agent string. */
export function parseBrowser(userAgent: string): string {
  const rules: Array<[RegExp, string]> = [
    [/Edg\/(\d+)/, "Edge"],
    [/OPR\/(\d+)/, "Opera"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/HeadlessChrome\/(\d+)/, "Chrome (headless)"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  for (const [re, name] of rules) {
    const m = re.exec(userAgent);
    if (m) return `${name} ${m[1]}`;
  }
  return "unknown browser";
}

export function describeDevice(
  adapter: Pick<AdapterReport, "vendor" | "architecture" | "device" | "description">,
): string {
  const parts = [
    adapter.vendor,
    adapter.architecture,
    adapter.device || adapter.description,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(" ") : "unknown GPU adapter";
}

export interface EnvironmentSource {
  adapter: AdapterReport;
  gpuTimingAvailable: boolean;
}

/** Collect everything needed to interpret a result later. Reads browser globals when present. */
export function captureEnvironment(
  source: EnvironmentSource,
  globals: {
    navigator?: Pick<Navigator, "userAgent" | "platform" | "hardwareConcurrency">;
    devicePixelRatio?: number;
  } = {
    navigator: typeof navigator === "undefined" ? undefined : navigator,
    devicePixelRatio: typeof window === "undefined" ? undefined : window.devicePixelRatio,
  },
): BenchmarkEnvironment {
  const nav = globals.navigator;
  const userAgent = nav?.userAgent ?? "unknown";
  return {
    userAgent,
    browser: parseBrowser(userAgent),
    platform: nav?.platform ?? "unknown",
    deviceLabel: describeDevice(source.adapter),
    adapter: {
      vendor: source.adapter.vendor,
      architecture: source.adapter.architecture,
      device: source.adapter.device,
      description: source.adapter.description,
      isFallbackAdapter: source.adapter.isFallbackAdapter,
    },
    devicePixelRatio: globals.devicePixelRatio ?? 1,
    hardwareConcurrency: nav?.hardwareConcurrency ?? null,
    gpuTimingSupported: source.gpuTimingAvailable,
  };
}

/** Heuristic for software rasterizers (SwiftShader, llvmpipe, WARP), which are not real GPUs. */
export function isSoftwareAdapter(env: BenchmarkEnvironment): boolean {
  if (env.adapter.isFallbackAdapter) return true;
  const text =
    `${env.adapter.vendor} ${env.adapter.architecture} ${env.adapter.device} ${env.adapter.description}`.toLowerCase();
  return /swiftshader|llvmpipe|softpipe|warp|software/.test(text);
}

import type { AdapterReport } from "./types";

export type WebGPUSupport =
  | { supported: true; adapter: GPUAdapter; report: AdapterReport }
  | { supported: false; reason: string };

export function describeAdapter(adapter: GPUAdapter): AdapterReport {
  const info = adapter.info;
  const limits: Record<string, number> = {};
  for (const key of [
    "maxTextureDimension2D",
    "maxBufferSize",
    "maxUniformBufferBindingSize",
    "minUniformBufferOffsetAlignment",
    "maxBindGroups",
  ]) {
    const v = (adapter.limits as unknown as Record<string, unknown>)[key];
    if (typeof v === "number") limits[key] = v;
  }
  return {
    vendor: info?.vendor ?? "",
    architecture: info?.architecture ?? "",
    device: info?.device ?? "",
    description: info?.description ?? "",
    features: [...adapter.features].sort(),
    limits,
    isFallbackAdapter: Boolean(
      (adapter as unknown as { isFallbackAdapter?: boolean }).isFallbackAdapter ??
      info?.isFallbackAdapter,
    ),
  };
}

/**
 * Detect WebGPU support without throwing. Having `navigator.gpu` does not guarantee an adapter,
 * so this actually requests one. There is deliberately NO fallback to another graphics API.
 */
export async function detectWebGPU(
  nav: Navigator | undefined = globalThis.navigator,
): Promise<WebGPUSupport> {
  if (!nav || !("gpu" in nav) || !nav.gpu) {
    const secure = typeof isSecureContext === "boolean" ? isSecureContext : true;
    return {
      supported: false,
      reason: secure
        ? "This browser does not expose the WebGPU API (navigator.gpu is undefined)."
        : "WebGPU requires a secure context (HTTPS or localhost).",
    };
  }
  try {
    const adapter = await nav.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      return {
        supported: false,
        reason:
          "WebGPU is exposed but no compatible GPU adapter was granted (driver or hardware limitation).",
      };
    }
    return { supported: true, adapter, report: describeAdapter(adapter) };
  } catch (error) {
    return { supported: false, reason: `Requesting a WebGPU adapter failed: ${String(error)}` };
  }
}

/** Per-frame renderer statistics. Every value is measured, never estimated. */
export interface FrameStats {
  frameIndex: number;
  /** CPU time spent encoding and submitting the frame (ms). */
  cpuMs: number;
  /** GPU time of all render passes from timestamp queries (ms); null when unavailable. */
  gpuMs: number | null;
  drawCalls: number;
  shadowDrawCalls: number;
  triangles: number;
  objects: number;
  /** Bytes written to GPU buffers with queue.writeBuffer this frame. */
  uploadedBytes: number;
  renderWidth: number;
  renderHeight: number;
}

export interface GpuResourceStats {
  buffers: number;
  textures: number;
  /** Total bytes of live tracked buffers and textures. */
  bytes: number;
}

export interface AdapterReport {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  features: string[];
  limits: Record<string, number>;
  isFallbackAdapter: boolean;
}

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticEntry {
  timestamp: number;
  severity: DiagnosticSeverity;
  message: string;
}

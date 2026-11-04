import type { GpuResourceStats } from "../diagnostics/types";

interface Destroyable {
  destroy(): void;
}

/**
 * Owns every GPU buffer/texture created through it. Tracking creation and destruction makes
 * leaks observable (counts and bytes) and lets `destroyAll()` release everything deterministically.
 */
export class GpuResourceTracker {
  private readonly live = new Map<Destroyable, { kind: "buffer" | "texture"; bytes: number }>();

  constructor(private readonly device: GPUDevice) {}

  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    const buffer = this.device.createBuffer(descriptor);
    this.live.set(buffer, { kind: "buffer", bytes: descriptor.size });
    return buffer;
  }

  createTexture(descriptor: GPUTextureDescriptor, bytes: number): GPUTexture {
    const texture = this.device.createTexture(descriptor);
    this.live.set(texture, { kind: "texture", bytes });
    return texture;
  }

  destroy(resource: Destroyable): void {
    if (this.live.delete(resource)) resource.destroy();
  }

  destroyAll(): void {
    for (const resource of this.live.keys()) resource.destroy();
    this.live.clear();
  }

  stats(): GpuResourceStats {
    let buffers = 0;
    let textures = 0;
    let bytes = 0;
    for (const r of this.live.values()) {
      if (r.kind === "buffer") buffers++;
      else textures++;
      bytes += r.bytes;
    }
    return { buffers, textures, bytes };
  }
}

import { createWireframeIndices, interleaveVertices, type MeshData } from "../geometry/mesh";
import type { GpuResourceTracker } from "./resource-tracker";

export interface GpuMesh {
  key: string;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  wireIndexBuffer: GPUBuffer | null;
  wireIndexCount: number;
}

interface Entry {
  mesh: GpuMesh;
  source: MeshData;
  refs: number;
}

function uploadIndices(
  device: GPUDevice,
  tracker: GpuResourceTracker,
  data: Uint32Array,
  label: string,
): GPUBuffer {
  const buffer = tracker.createBuffer({
    label,
    size: Math.max(16, Math.ceil(data.byteLength / 4) * 4),
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  return buffer;
}

/**
 * Reference-counted cache of GPU geometry. Objects with identical geometry share one vertex/index
 * buffer pair; buffers are destroyed when the last user releases them.
 */
export class GpuMeshCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly device: GPUDevice,
    private readonly tracker: GpuResourceTracker,
  ) {}

  acquire(key: string, source: MeshData): GpuMesh {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs++;
      return existing.mesh;
    }
    const vertices = interleaveVertices(source);
    const vertexBuffer = this.tracker.createBuffer({
      label: `vertex:${key}`,
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(
      vertexBuffer,
      0,
      vertices.buffer as ArrayBuffer,
      vertices.byteOffset,
      vertices.byteLength,
    );
    const indexBuffer = uploadIndices(this.device, this.tracker, source.indices, `index:${key}`);
    const mesh: GpuMesh = {
      key,
      vertexBuffer,
      indexBuffer,
      indexCount: source.indices.length,
      wireIndexBuffer: null,
      wireIndexCount: 0,
    };
    this.entries.set(key, { mesh, source, refs: 1 });
    return mesh;
  }

  get(key: string): GpuMesh | undefined {
    return this.entries.get(key)?.mesh;
  }

  /** Lazily build the line-list index buffer the first time wireframe rendering needs it. */
  ensureWireframe(mesh: GpuMesh): void {
    if (mesh.wireIndexBuffer) return;
    const entry = this.entries.get(mesh.key);
    if (!entry) return;
    const lines = createWireframeIndices(entry.source);
    mesh.wireIndexBuffer = uploadIndices(this.device, this.tracker, lines, `wire:${mesh.key}`);
    mesh.wireIndexCount = lines.length;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs--;
    if (entry.refs > 0) return;
    this.tracker.destroy(entry.mesh.vertexBuffer);
    this.tracker.destroy(entry.mesh.indexBuffer);
    if (entry.mesh.wireIndexBuffer) this.tracker.destroy(entry.mesh.wireIndexBuffer);
    this.entries.delete(key);
  }

  refCount(key: string): number {
    return this.entries.get(key)?.refs ?? 0;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.tracker.destroy(entry.mesh.vertexBuffer);
      this.tracker.destroy(entry.mesh.indexBuffer);
      if (entry.mesh.wireIndexBuffer) this.tracker.destroy(entry.mesh.wireIndexBuffer);
    }
    this.entries.clear();
  }
}

import { describe, expect, it } from "vitest";
import {
  GpuMeshCache,
  GpuResourceTracker,
  createCheckerImage,
  createCube,
  createWireframeIndices,
  generateMipChain,
} from "../src";

// Minimal fake of the parts of GPUDevice the tracker and mesh cache use.
function fakeDevice() {
  const destroyed: string[] = [];
  const writes: number[] = [];
  const device = {
    createBuffer(d: { label?: string; size: number }) {
      return { label: d.label, size: d.size, destroy: () => destroyed.push(d.label ?? "buffer") };
    },
    createTexture(d: { label?: string }) {
      return { label: d.label, destroy: () => destroyed.push(d.label ?? "texture") };
    },
    queue: {
      writeBuffer: (_b: unknown, _o: number, _d: unknown, _do: number, size: number) =>
        writes.push(size),
    },
  };
  return { device: device as unknown as GPUDevice, destroyed, writes };
}

// GPUBufferUsage is a browser global; provide the constants the cache reads.
(globalThis as Record<string, unknown>).GPUBufferUsage = {
  VERTEX: 0x20,
  INDEX: 0x10,
  COPY_DST: 0x8,
  UNIFORM: 0x40,
};

describe("GpuResourceTracker", () => {
  it("tracks live buffers, textures and bytes", () => {
    const { device } = fakeDevice();
    const t = new GpuResourceTracker(device);
    t.createBuffer({ size: 100, usage: 0 });
    t.createBuffer({ size: 50, usage: 0 });
    t.createTexture({ size: [4, 4], format: "rgba8unorm", usage: 0 }, 64);
    expect(t.stats()).toEqual({ buffers: 2, textures: 1, bytes: 214 });
  });

  it("destroys individual resources exactly once", () => {
    const { device, destroyed } = fakeDevice();
    const t = new GpuResourceTracker(device);
    const b = t.createBuffer({ label: "a", size: 10, usage: 0 });
    t.destroy(b);
    t.destroy(b);
    expect(destroyed).toEqual(["a"]);
    expect(t.stats().buffers).toBe(0);
  });

  it("destroyAll releases everything", () => {
    const { device, destroyed } = fakeDevice();
    const t = new GpuResourceTracker(device);
    t.createBuffer({ label: "a", size: 10, usage: 0 });
    t.createTexture({ label: "b", size: [1, 1], format: "rgba8unorm", usage: 0 }, 4);
    t.destroyAll();
    expect(destroyed.sort()).toEqual(["a", "b"]);
    expect(t.stats()).toEqual({ buffers: 0, textures: 0, bytes: 0 });
  });
});

describe("GpuMeshCache lifecycle", () => {
  it("shares GPU buffers between users of the same key and frees them at refcount 0", () => {
    const { device, destroyed } = fakeDevice();
    const tracker = new GpuResourceTracker(device);
    const cache = new GpuMeshCache(device, tracker);
    const cube = createCube(1);

    const a = cache.acquire("cube", cube);
    const b = cache.acquire("cube", cube);
    expect(a).toBe(b);
    expect(cache.refCount("cube")).toBe(2);
    expect(tracker.stats().buffers).toBe(2); // one vertex + one index buffer, shared

    cache.release("cube");
    expect(tracker.stats().buffers).toBe(2);
    cache.release("cube");
    expect(tracker.stats().buffers).toBe(0);
    expect(destroyed).toHaveLength(2);
    expect(cache.size).toBe(0);
  });

  it("creates the wireframe index buffer lazily, once, and frees it with the mesh", () => {
    const { device } = fakeDevice();
    const tracker = new GpuResourceTracker(device);
    const cache = new GpuMeshCache(device, tracker);
    const cube = createCube(1);
    const mesh = cache.acquire("cube", cube);
    expect(mesh.wireIndexBuffer).toBeNull();
    cache.ensureWireframe(mesh);
    const first = mesh.wireIndexBuffer;
    expect(first).not.toBeNull();
    expect(mesh.wireIndexCount).toBe(createWireframeIndices(cube).length);
    cache.ensureWireframe(mesh);
    expect(mesh.wireIndexBuffer).toBe(first);
    expect(tracker.stats().buffers).toBe(3);
    cache.release("cube");
    expect(tracker.stats().buffers).toBe(0);
  });

  it("releasing an unknown key is a no-op", () => {
    const { device } = fakeDevice();
    const cache = new GpuMeshCache(device, new GpuResourceTracker(device));
    expect(() => cache.release("nope")).not.toThrow();
  });

  it("clear() frees everything", () => {
    const { device } = fakeDevice();
    const tracker = new GpuResourceTracker(device);
    const cache = new GpuMeshCache(device, tracker);
    cache.acquire("a", createCube(1));
    cache.acquire("b", createCube(2));
    cache.clear();
    expect(tracker.stats().buffers).toBe(0);
  });
});

describe("procedural textures", () => {
  it("creates an alternating checker pattern", () => {
    const img = createCheckerImage(8, 2, 255, 0);
    const px = (x: number, y: number) => img.data[(y * 8 + x) * 4];
    expect(px(0, 0)).toBe(255);
    expect(px(4, 0)).toBe(0);
    expect(px(0, 4)).toBe(0);
    expect(px(4, 4)).toBe(255);
    expect(img.data[3]).toBe(255); // opaque
  });

  it("builds a full mip chain down to 1x1 with a mid-grey tail", () => {
    const chain = generateMipChain(createCheckerImage(64, 8, 240, 40));
    expect(chain).toHaveLength(7);
    expect(chain.map((l) => l.width)).toEqual([64, 32, 16, 8, 4, 2, 1]);
    const last = chain[chain.length - 1];
    expect(last.data[0]).toBeCloseTo(140, 0); // average of 240 and 40
  });

  it("rejects invalid parameters", () => {
    expect(() => createCheckerImage(1, 1)).toThrow();
  });
});

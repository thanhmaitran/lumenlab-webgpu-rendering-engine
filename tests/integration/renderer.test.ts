import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DiagnosticsLog,
  EngineError,
  FRAME_BYTES,
  Renderer,
  Scene,
  Vector3,
  geometryStudioScene,
  materialGalleryScene,
} from "@lumenlab/engine";
import {
  createMockGpu,
  installGpuGlobals,
  removeGpuGlobals,
  type MockGpu,
} from "./support/mock-gpu";

/**
 * Renderer behaviour against a recording mock device. These tests run everywhere (no GPU needed)
 * and pin down the lifecycle bugs listed in the project guide: stale depth buffers after resize,
 * material edits that never reach the GPU, use of resources after device loss, leaked resources.
 */

let gpu: MockGpu;

beforeEach(() => {
  installGpuGlobals();
  gpu = createMockGpu();
});

afterEach(() => {
  removeGpuGlobals();
});

async function createRenderer(options: { scene?: Scene | null } = {}) {
  const renderer = await Renderer.create(gpu.canvas, gpu.adapter, new DiagnosticsLog());
  const scene =
    options.scene === undefined ? Scene.fromDefinition(geometryStudioScene()) : options.scene;
  if (scene) renderer.setScene(scene);
  return { renderer, scene };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("Renderer initialisation", () => {
  it("configures the canvas context with the device and the preferred format", async () => {
    await createRenderer();
    expect(gpu.contextConfigured).toEqual({ device: gpu.device, format: "bgra8unorm" });
  });

  it("builds the four pipelines (main, wire fill, wire lines, shadow)", async () => {
    await createRenderer();
    expect(gpu.byKind("pipeline")).toHaveLength(4);
  });

  it("surfaces shader compilation errors as an EngineError and releases the device", async () => {
    gpu.failShaderCompilation("unexpected token");
    const error = await Renderer.create(gpu.canvas, gpu.adapter, new DiagnosticsLog()).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("shader-compilation-failed");
    expect((error as EngineError).message).toContain("unexpected token");
    expect(gpu.deviceDestroyed).toBe(true);
  });

  it("fails clearly when the canvas cannot provide a WebGPU context", async () => {
    gpu.denyCanvasContext();
    const error = await Renderer.create(gpu.canvas, gpu.adapter, new DiagnosticsLog()).catch(
      (e: unknown) => e,
    );
    expect((error as EngineError).code).toBe("canvas-context-failed");
    expect(gpu.deviceDestroyed).toBe(true);
  });
});

describe("Renderer frames", () => {
  it("returns null until a scene is loaded", async () => {
    const { renderer } = await createRenderer({ scene: null });
    expect(renderer.render()).toBeNull();
    expect(gpu.submits).toBe(0);
  });

  it("draws one main-pass call per object and one shadow call per caster", async () => {
    const { renderer, scene } = await createRenderer();
    const objects = scene!.meshObjects();
    const stats = renderer.render()!;
    expect(stats.objects).toBe(objects.length);
    expect(stats.drawCalls).toBe(objects.length);
    expect(stats.shadowDrawCalls).toBe(objects.filter((o) => o.castShadow).length);
    expect(stats.shadowDrawCalls).toBeGreaterThan(0);
    expect(stats.shadowDrawCalls).toBeLessThan(stats.drawCalls); // the ground does not cast
    expect(gpu.submits).toBe(1);
    expect(gpu.passDraws.map((p) => p.label)).toEqual(["shadow-pass", "main-pass"]);
  });

  it("skips the shadow pass entirely when shadows are disabled", async () => {
    const { renderer } = await createRenderer();
    renderer.setSettings({ shadowsEnabled: false });
    const stats = renderer.render()!;
    expect(stats.shadowDrawCalls).toBe(0);
    expect(gpu.passDraws.map((p) => p.label)).toEqual(["main-pass"]);
  });

  it("wireframe mode draws every object twice (hidden-surface fill + line list)", async () => {
    const { renderer, scene } = await createRenderer();
    renderer.setSettings({ mode: "wireframe" });
    expect(renderer.render()!.drawCalls).toBe(scene!.meshObjects().length * 2);
  });

  it("only re-uploads per-object data when something changed", async () => {
    const { renderer, scene } = await createRenderer();
    const first = renderer.render()!;
    expect(first.uploadedBytes).toBeGreaterThan(FRAME_BYTES); // instances + frame uniform

    const idle = renderer.render()!;
    expect(idle.uploadedBytes).toBe(FRAME_BYTES); // frame uniform only

    scene!.getObject("cube")!.setMaterial({ roughness: 0.9 });
    const afterEdit = renderer.render()!;
    expect(afterEdit.uploadedBytes).toBeGreaterThan(FRAME_BYTES);
  });

  it("uploads again after a transform edit, so the GPU never shows stale positions", async () => {
    const { renderer, scene } = await createRenderer();
    renderer.render();
    renderer.render();
    const sphere = scene!.getObject("sphere")!;
    sphere.position = new Vector3(sphere.position.x + 1, sphere.position.y, sphere.position.z);
    expect(renderer.render()!.uploadedBytes).toBeGreaterThan(FRAME_BYTES);
  });
});

describe("Renderer resize and render scale", () => {
  const depthTextures = () =>
    gpu.byKind("texture").filter((t) => t.descriptor.label === "main-depth");

  it("recreates the depth texture when the canvas size changes and destroys the old one", async () => {
    const { renderer } = await createRenderer();
    renderer.resize(800, 600, 1);
    const before = depthTextures().length;
    renderer.resize(1000, 500, 1);
    const all = depthTextures();
    expect(all.length).toBe(before + 1);
    expect(all.slice(0, -1).every((t) => t.destroyed)).toBe(true); // superseded buffers freed
    expect(all.at(-1)!.destroyed).toBe(false);
    expect(all.at(-1)!.descriptor.size).toEqual([1000, 500]);
  });

  it("does not churn GPU resources when the size is unchanged", async () => {
    const { renderer } = await createRenderer();
    renderer.resize(800, 600, 1);
    const count = depthTextures().length;
    renderer.resize(800, 600, 1);
    expect(depthTextures()).toHaveLength(count);
  });

  it("applies render scale to the backing store and keeps the depth buffer in step", async () => {
    const { renderer } = await createRenderer();
    renderer.setSettings({ renderScale: 0.5 });
    renderer.resize(800, 600, 2);
    expect(renderer.renderSize).toEqual({ width: 800, height: 600 }); // 800 * 2 * 0.5
    expect(gpu.canvas.width).toBe(800);
    expect(depthTextures().at(-1)!.descriptor.size).toEqual([800, 600]);
  });

  it("a pinned render size ignores the canvas size (benchmarks rely on this)", async () => {
    const { renderer } = await createRenderer();
    renderer.setFixedSize({ width: 640, height: 360 });
    renderer.resize(1920, 1080, 1);
    expect(renderer.renderSize).toEqual({ width: 640, height: 360 });
    renderer.setFixedSize(null);
    renderer.resize(1920, 1080, 1);
    expect(renderer.renderSize).toEqual({ width: 1920, height: 1080 });
  });

  it("recreates the shadow map when its resolution setting changes", async () => {
    const { renderer } = await createRenderer();
    const shadows = () => gpu.byKind("texture").filter((t) => String(t.label).includes("shadow"));
    const before = shadows().length;
    renderer.setSettings({ shadowMapSize: 1024 });
    const after = shadows();
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.descriptor.size).toEqual([1024, 1024]);
    expect(after.slice(0, -1).every((t) => t.destroyed)).toBe(true);
  });
});

describe("Renderer resource lifecycle", () => {
  it("releases the previous scene's meshes when a new scene is loaded", async () => {
    const { renderer } = await createRenderer();
    renderer.render();
    const buffersBefore = renderer.resourceStats().buffers;
    renderer.setScene(Scene.fromDefinition(materialGalleryScene(2, 1)));
    renderer.render();
    const stats = renderer.resourceStats();
    // The sphere + ground of the gallery replace cube/sphere/torus/ground; nothing accumulates.
    expect(stats.buffers).toBeLessThanOrEqual(buffersBefore);
  });

  it("shares one GPU mesh between objects with identical geometry", async () => {
    const { renderer } = await createRenderer({
      scene: Scene.fromDefinition(materialGalleryScene(3, 2)),
    });
    renderer.render();
    const vertexBuffers = gpu
      .byKind("buffer")
      .filter((b) => String(b.label).includes("vertex") && !b.destroyed);
    const spheres = Scene.fromDefinition(materialGalleryScene(3, 2)).meshObjects().length;
    expect(vertexBuffers.length).toBeLessThan(spheres);
  });

  it("dispose() destroys every tracked resource and the device, and is idempotent", async () => {
    const { renderer } = await createRenderer();
    renderer.render();
    renderer.dispose();
    expect(renderer.resourceStats()).toEqual({ buffers: 0, textures: 0, bytes: 0 });
    expect(gpu.live("buffer")).toHaveLength(0);
    // The swap-chain texture belongs to the browser, not the engine, so it is excluded.
    expect(gpu.live("texture").filter((t) => t.label !== "swapchain")).toHaveLength(0);
    expect(gpu.deviceDestroyed).toBe(true);
    expect(gpu.contextUnconfigured).toBe(true);
    expect(() => renderer.dispose()).not.toThrow();
  });

  it("does not render after dispose()", async () => {
    const { renderer } = await createRenderer();
    renderer.dispose();
    const submits = gpu.submits;
    expect(renderer.render()).toBeNull();
    expect(gpu.submits).toBe(submits);
  });

  it("an intentional dispose() is not reported as a device loss", async () => {
    const { renderer } = await createRenderer();
    const messages: string[] = [];
    renderer.onDeviceLost.subscribe((m) => messages.push(m));
    renderer.dispose();
    await flushMicrotasks();
    expect(messages).toEqual([]);
    expect(renderer.isLost).toBe(false);
  });
});

describe("Renderer device loss", () => {
  it("marks the renderer lost, notifies listeners and stops using GPU resources", async () => {
    const { renderer } = await createRenderer();
    renderer.render();
    const messages: string[] = [];
    renderer.onDeviceLost.subscribe((m) => messages.push(m));

    gpu.loseDevice("unknown", "TDR");
    await flushMicrotasks();

    expect(renderer.isLost).toBe(true);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("GPU device lost");
    expect(messages[0]).toContain("TDR");

    const submits = gpu.submits;
    const writes = gpu.bufferWrites.length;
    expect(renderer.render()).toBeNull();
    expect(gpu.submits).toBe(submits); // nothing is submitted to a dead device
    expect(gpu.bufferWrites.length).toBe(writes);
  });

  it("records the loss in the diagnostics log", async () => {
    const log = new DiagnosticsLog();
    const renderer = await Renderer.create(gpu.canvas, gpu.adapter, log);
    renderer.setScene(Scene.fromDefinition(geometryStudioScene()));
    gpu.loseDevice("unknown", "driver reset");
    await flushMicrotasks();
    expect(
      log.list().some((e) => e.severity === "error" && e.message.includes("driver reset")),
    ).toBe(true);
  });
});

describe("Renderer back-pressure bookkeeping", () => {
  it("counts frames in flight until the GPU reports completion", async () => {
    const { renderer } = await createRenderer();
    const hold = gpu.holdSubmissions();
    renderer.render();
    renderer.render();
    expect(renderer.framesInFlight).toBe(2);
    hold.release();
    await flushMicrotasks();
    expect(renderer.framesInFlight).toBe(0);
  });
});

describe("Renderer timing capability", () => {
  it("reports GPU timing as unavailable without the timestamp-query feature", async () => {
    const { renderer } = await createRenderer();
    expect(renderer.gpuTimingAvailable).toBe(false);
  });

  it("enables GPU timing only when the adapter exposes timestamp-query", async () => {
    gpu = createMockGpu({ timestampQuery: true });
    const { renderer } = await createRenderer();
    expect(renderer.gpuTimingAvailable).toBe(true);
  });
});

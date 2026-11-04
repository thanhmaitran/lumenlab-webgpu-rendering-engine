import meshShaderSource from "../../shaders/mesh.wgsl?raw";
import { Emitter } from "../core/emitter";
import { EngineError } from "../core/errors";
import type { DiagnosticsLog } from "../diagnostics/log";
import { describeAdapter } from "../diagnostics/support";
import type { AdapterReport, FrameStats, GpuResourceStats } from "../diagnostics/types";
import { VERTEX_STRIDE_BYTES } from "../geometry/mesh";
import { GpuMeshCache, type GpuMesh } from "../gpu/mesh-cache";
import { createCheckerImage, generateMipChain } from "../gpu/procedural-textures";
import { GpuResourceTracker } from "../gpu/resource-tracker";
import {
  normalizedLightDirection,
  type DirectionalLightDefinition,
  type PointLightDefinition,
} from "../lighting/lights";
import { computeDirectionalShadowMatrix } from "../lighting/shadow";
import type { MaterialParams } from "../materials/material";
import { SceneNode } from "../scene/scene-node";
import type { MeshObject, Scene } from "../scene/scene";
import {
  FRAME_BYTES,
  FRAME_LAYOUT,
  INSTANCE_BYTES,
  INSTANCE_LAYOUT,
  RENDER_MODE_INDEX,
  alignUp,
  linearToSrgb,
} from "./layout";
import {
  DEFAULT_RENDER_SETTINGS,
  computeRenderSize,
  sanitizeRenderSettings,
  type RenderSettings,
} from "./settings";

const COLOR_DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const SHADOW_FORMAT: GPUTextureFormat = "depth32float";
const CHECKER_FORMAT: GPUTextureFormat = "rgba8unorm-srgb";
const SHADER_DEPTH_BIAS = 0.0008;

export interface FrameTiming {
  stats: FrameStats;
  /** CPU encode+submit start until `onSubmittedWorkDone` resolves (ms). Includes queue latency. */
  completionMs: number;
}

/**
 * WebGPU backend. Owns every GPU resource (through a tracker), the pipelines and the per-frame
 * uniform data. It is driven by `Engine`; UI code never touches it directly.
 */
export class Renderer {
  readonly resources: GpuResourceTracker;
  readonly onDeviceLost = new Emitter<string>();
  readonly adapterReport: AdapterReport;

  private settings: RenderSettings = { ...DEFAULT_RENDER_SETTINGS };
  private scene: Scene | null = null;
  private selectedId: string | null = null;
  private lost = false;
  private disposed = false;

  private readonly meshCache: GpuMeshCache;
  private readonly frameLayout: GPUBindGroupLayout;
  private readonly shadowFrameLayout: GPUBindGroupLayout;
  private readonly instanceLayout: GPUBindGroupLayout;
  private readonly mainPipeline: GPURenderPipeline;
  private readonly wireFillPipeline: GPURenderPipeline;
  private readonly wireLinePipeline: GPURenderPipeline;
  private readonly shadowPipeline: GPURenderPipeline;
  private readonly frameBuffer: GPUBuffer;
  private readonly frameData = new Float32Array(FRAME_LAYOUT.totalFloats);
  private readonly shadowSampler: GPUSampler;
  private readonly albedoSampler: GPUSampler;
  private readonly albedoView: GPUTextureView;

  private shadowTexture: GPUTexture | null = null;
  private shadowView: GPUTextureView | null = null;
  private shadowFrameBindGroup: GPUBindGroup | null = null;
  private mainFrameBindGroup: GPUBindGroup | null = null;

  private depthTexture: GPUTexture | null = null;
  private depthView: GPUTextureView | null = null;
  private width = 1;
  private height = 1;
  private fixedSize: { width: number; height: number } | null = null;

  private instanceBuffer: GPUBuffer | null = null;
  private instanceBindGroup: GPUBindGroup | null = null;
  private instanceCapacity = 0;
  private instanceData = new Float32Array(0);
  private readonly instanceStride: number;
  private lastUploadedEpoch = -1;
  private lastUploadedSelection: string | null | undefined;
  private lastUploadedCount = -1;

  private drawList: MeshObject[] = [];
  private drawMeshes: GpuMesh[] = [];
  private acquired = new Map<string, string>(); // objectId -> geometryKey
  private syncedSceneVersion = -1;
  private syncedScene: Scene | null = null;

  private readonly querySet: GPUQuerySet | null;
  private readonly queryResolve: GPUBuffer | null;
  private readonly queryRead: GPUBuffer | null;
  private timingPending = false;
  private lastGpuMs: number | null = null;

  private frameIndex = 0;
  private inFlight = 0;

  private constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas,
    format: GPUTextureFormat,
    shaderModule: GPUShaderModule,
    readonly log: DiagnosticsLog,
    adapter: GPUAdapter,
  ) {
    this.adapterReport = describeAdapter(adapter);
    this.resources = new GpuResourceTracker(device);
    this.meshCache = new GpuMeshCache(device, this.resources);
    this.instanceStride = alignUp(INSTANCE_BYTES, device.limits.minUniformBufferOffsetAlignment);

    this.frameLayout = device.createBindGroupLayout({
      label: "frame-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    // The shadow pass renders INTO the shadow map, so its layout must not reference it.
    this.shadowFrameLayout = device.createBindGroupLayout({
      label: "shadow-frame-layout",
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    this.instanceLayout = device.createBindGroupLayout({
      label: "instance-layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: INSTANCE_BYTES },
        },
      ],
    });

    const mainLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.frameLayout, this.instanceLayout],
    });
    const shadowLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.shadowFrameLayout, this.instanceLayout],
    });

    const vertexBuffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: VERTEX_STRIDE_BYTES,
        attributes: [
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          { shaderLocation: 1, offset: 12, format: "float32x3" },
          { shaderLocation: 2, offset: 24, format: "float32x2" },
        ],
      },
    ];
    const depthStencil = (extra: Partial<GPUDepthStencilState> = {}): GPUDepthStencilState => ({
      format: COLOR_DEPTH_FORMAT,
      depthWriteEnabled: true,
      depthCompare: "less",
      ...extra,
    });

    this.mainPipeline = device.createRenderPipeline({
      label: "main-pipeline",
      layout: mainLayout,
      vertex: { module: shaderModule, entryPoint: "vs_main", buffers: vertexBuffers },
      fragment: { module: shaderModule, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: depthStencil(),
    });
    this.wireFillPipeline = device.createRenderPipeline({
      label: "wire-fill-pipeline",
      layout: mainLayout,
      vertex: { module: shaderModule, entryPoint: "vs_main", buffers: vertexBuffers },
      fragment: { module: shaderModule, entryPoint: "fs_wire_fill", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      // Push the fill slightly away so the wire lines drawn on top win the depth test.
      depthStencil: depthStencil({ depthBias: 2, depthBiasSlopeScale: 2 }),
    });
    this.wireLinePipeline = device.createRenderPipeline({
      label: "wire-line-pipeline",
      layout: mainLayout,
      vertex: { module: shaderModule, entryPoint: "vs_main", buffers: vertexBuffers },
      fragment: { module: shaderModule, entryPoint: "fs_wire_line", targets: [{ format }] },
      primitive: { topology: "line-list" },
      depthStencil: depthStencil({ depthCompare: "less-equal", depthWriteEnabled: false }),
    });
    this.shadowPipeline = device.createRenderPipeline({
      label: "shadow-pipeline",
      layout: shadowLayout,
      vertex: { module: shaderModule, entryPoint: "vs_shadow", buffers: vertexBuffers },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: {
        format: SHADOW_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "less",
        depthBias: 1,
        depthBiasSlopeScale: 1.5,
      },
    });

    this.frameBuffer = this.resources.createBuffer({
      label: "frame-uniforms",
      size: FRAME_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.shadowSampler = device.createSampler({
      label: "shadow-sampler",
      compare: "less",
      magFilter: "linear",
      minFilter: "linear",
    });
    this.albedoSampler = device.createSampler({
      label: "albedo-sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
      maxAnisotropy: 4,
    });
    this.albedoView = this.createCheckerTexture();
    this.createShadowResources(this.settings.shadowMapSize);
    this.resizeInternal(1, 1);

    if (device.features.has("timestamp-query")) {
      this.querySet = device.createQuerySet({
        label: "pass-timestamps",
        type: "timestamp",
        count: 4,
      });
      this.queryResolve = this.resources.createBuffer({
        label: "timestamp-resolve",
        size: 4 * 8,
        usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
      });
      this.queryRead = this.resources.createBuffer({
        label: "timestamp-read",
        size: 4 * 8,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      log.add("info", "GPU timestamp queries are available; GPU pass time will be reported.");
    } else {
      this.querySet = this.queryResolve = this.queryRead = null;
      log.add(
        "info",
        "GPU timestamp queries are NOT available on this adapter; GPU time is reported as n/a.",
      );
    }

    device.lost.then((info) => {
      if (this.disposed) return; // intentional destroy() also resolves `lost`
      this.lost = true;
      const message = `GPU device lost (${info.reason}): ${info.message}`;
      log.add("error", message);
      this.onDeviceLost.emit(message);
    });
    device.addEventListener("uncapturederror", (event) => {
      log.add("error", `WebGPU error: ${(event as GPUUncapturedErrorEvent).error.message}`);
    });
  }

  static async create(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    adapter: GPUAdapter,
    log: DiagnosticsLog,
  ): Promise<Renderer> {
    const requiredFeatures: GPUFeatureName[] = adapter.features.has("timestamp-query")
      ? ["timestamp-query"]
      : [];
    let device: GPUDevice;
    try {
      device = await adapter.requestDevice({ label: "lumenlab-device", requiredFeatures });
    } catch (error) {
      throw new EngineError(
        "device-request-failed",
        `Could not create a GPU device: ${String(error)}`,
        { cause: error },
      );
    }

    const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!context) {
      device.destroy();
      throw new EngineError(
        "canvas-context-failed",
        "The canvas could not provide a WebGPU context.",
      );
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });

    const module = device.createShaderModule({ label: "mesh-shader", code: meshShaderSource });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((m) => m.type === "error");
    if (errors.length > 0) {
      device.destroy();
      throw new EngineError(
        "shader-compilation-failed",
        errors.map((m) => `line ${m.lineNum}: ${m.message}`).join("\n"),
      );
    }

    device.pushErrorScope("validation");
    const renderer = new Renderer(device, context, canvas, format, module, log, adapter);
    const validationError = await device.popErrorScope();
    if (validationError) {
      renderer.dispose();
      throw new EngineError("pipeline-creation-failed", validationError.message);
    }
    return renderer;
  }

  // ---- public API -------------------------------------------------------------------------

  /** Frames submitted to the queue whose GPU work has not completed yet. */
  get framesInFlight(): number {
    return this.inFlight;
  }

  get isLost(): boolean {
    return this.lost;
  }

  get renderSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  get gpuTimingAvailable(): boolean {
    return this.querySet !== null;
  }

  getSettings(): RenderSettings {
    return { ...this.settings };
  }

  setSettings(partial: Partial<RenderSettings>): void {
    const next = sanitizeRenderSettings(partial, this.settings);
    const shadowSizeChanged = next.shadowMapSize !== this.settings.shadowMapSize;
    this.settings = next;
    if (shadowSizeChanged) this.createShadowResources(next.shadowMapSize);
  }

  setSelectedId(id: string | null): void {
    this.selectedId = id;
  }

  setScene(scene: Scene | null): void {
    this.releaseAllMeshes();
    this.scene = scene;
    this.syncedSceneVersion = -1;
    this.lastUploadedEpoch = -1;
  }

  /**
   * Pin the backing-store resolution (used by benchmarks so every run renders the same pixel count
   * regardless of window size). Pass null to return to automatic sizing.
   */
  setFixedSize(size: { width: number; height: number } | null): void {
    this.fixedSize = size
      ? { width: Math.max(1, Math.floor(size.width)), height: Math.max(1, Math.floor(size.height)) }
      : null;
    if (this.fixedSize) {
      const max = this.device.limits.maxTextureDimension2D;
      this.resizeInternal(
        Math.min(max, this.fixedSize.width),
        Math.min(max, this.fixedSize.height),
      );
    }
  }

  get hasFixedSize(): boolean {
    return this.fixedSize !== null;
  }

  /** Set the canvas backing-store size from a CSS size, device pixel ratio and the render scale. */
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void {
    const max = this.device.limits.maxTextureDimension2D;
    if (this.fixedSize) {
      this.resizeInternal(
        Math.min(max, this.fixedSize.width),
        Math.min(max, this.fixedSize.height),
      );
      return;
    }
    const { width, height } = computeRenderSize(
      cssWidth,
      cssHeight,
      devicePixelRatio,
      this.settings.renderScale,
      max,
    );
    this.resizeInternal(width, height);
  }

  resourceStats(): GpuResourceStats {
    return this.resources.stats();
  }

  /** Render one frame. Returns null when the device is lost or no scene is loaded. */
  render(): FrameStats | null {
    if (this.lost || this.disposed || !this.scene) return null;
    const t0 = performance.now();
    const scene = this.scene;
    const settings = this.settings;

    this.syncResources(scene);
    const count = this.drawList.length;
    this.ensureInstanceCapacity(count);
    if (settings.mode === "wireframe")
      for (const m of this.drawMeshes) this.meshCache.ensureWireframe(m);

    // Make sure the render target matches the (possibly scaled) canvas size at the camera aspect.
    scene.camera.setAspect(this.width, this.height);

    let uploadedBytes = 0;
    const epoch = SceneNode.epoch;
    if (
      epoch !== this.lastUploadedEpoch ||
      this.selectedId !== this.lastUploadedSelection ||
      count !== this.lastUploadedCount
    ) {
      this.fillInstanceData();
      if (count > 0 && this.instanceBuffer) {
        const floats = count * (this.instanceStride / 4);
        this.device.queue.writeBuffer(
          this.instanceBuffer,
          0,
          this.instanceData.buffer as ArrayBuffer,
          0,
          floats * 4,
        );
        uploadedBytes += floats * 4;
      }
      this.lastUploadedEpoch = epoch;
      this.lastUploadedSelection = this.selectedId;
      this.lastUploadedCount = count;
    }

    const shadowActive = this.fillFrameData(scene);
    this.device.queue.writeBuffer(
      this.frameBuffer,
      0,
      this.frameData.buffer as ArrayBuffer,
      0,
      FRAME_BYTES,
    );
    uploadedBytes += FRAME_BYTES;

    const encoder = this.device.createCommandEncoder({ label: "frame" });
    let drawCalls = 0;
    let shadowDrawCalls = 0;
    let triangles = 0;

    if (shadowActive && this.shadowView && this.shadowFrameBindGroup && this.instanceBindGroup) {
      const pass = encoder.beginRenderPass({
        label: "shadow-pass",
        colorAttachments: [],
        depthStencilAttachment: {
          view: this.shadowView,
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
        timestampWrites: this.querySet
          ? { querySet: this.querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 }
          : undefined,
      });
      pass.setPipeline(this.shadowPipeline);
      pass.setBindGroup(0, this.shadowFrameBindGroup);
      let lastMesh: GpuMesh | null = null;
      for (let i = 0; i < count; i++) {
        if (!this.drawList[i].castShadow) continue;
        const mesh = this.drawMeshes[i];
        pass.setBindGroup(1, this.instanceBindGroup, [i * this.instanceStride]);
        if (mesh !== lastMesh) {
          pass.setVertexBuffer(0, mesh.vertexBuffer);
          pass.setIndexBuffer(mesh.indexBuffer, "uint32");
          lastMesh = mesh;
        }
        pass.drawIndexed(mesh.indexCount);
        shadowDrawCalls++;
      }
      pass.end();
    }

    const bg = scene.background;
    const colorView = this.context.getCurrentTexture().createView();
    const main = encoder.beginRenderPass({
      label: "main-pass",
      colorAttachments: [
        {
          view: colorView,
          clearValue: {
            r: linearToSrgb(bg[0]),
            g: linearToSrgb(bg[1]),
            b: linearToSrgb(bg[2]),
            a: 1,
          },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthView!,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "discard",
      },
      timestampWrites: this.querySet
        ? { querySet: this.querySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3 }
        : undefined,
    });

    if (this.mainFrameBindGroup && this.instanceBindGroup) {
      main.setBindGroup(0, this.mainFrameBindGroup);
      const wireframe = settings.mode === "wireframe";

      const drawAll = (lines: boolean) => {
        let lastMesh: GpuMesh | null = null;
        for (let i = 0; i < count; i++) {
          const mesh = this.drawMeshes[i];
          const indexBuffer = lines ? mesh.wireIndexBuffer : mesh.indexBuffer;
          const indexCount = lines ? mesh.wireIndexCount : mesh.indexCount;
          if (!indexBuffer) continue;
          main.setBindGroup(1, this.instanceBindGroup!, [i * this.instanceStride]);
          if (mesh !== lastMesh) {
            main.setVertexBuffer(0, mesh.vertexBuffer);
            lastMesh = mesh;
          }
          // The index buffer differs between filled and line passes, so always (re)bind it.
          main.setIndexBuffer(indexBuffer, "uint32");
          main.drawIndexed(indexCount);
          drawCalls++;
          if (!lines) triangles += indexCount / 3;
        }
      };

      if (wireframe) {
        main.setPipeline(this.wireFillPipeline);
        drawAll(false);
        main.setPipeline(this.wireLinePipeline);
        drawAll(true);
      } else {
        main.setPipeline(this.mainPipeline);
        drawAll(false);
      }
    }
    main.end();

    let resolveTiming = false;
    if (this.querySet && this.queryResolve && this.queryRead && !this.timingPending) {
      encoder.resolveQuerySet(this.querySet, 0, 4, this.queryResolve, 0);
      encoder.copyBufferToBuffer(this.queryResolve, 0, this.queryRead, 0, 32);
      resolveTiming = true;
    }

    this.device.queue.submit([encoder.finish()]);
    this.trackSubmission();
    if (resolveTiming) this.readTimings(shadowActive);

    const cpuMs = performance.now() - t0;
    return {
      frameIndex: this.frameIndex++,
      cpuMs,
      gpuMs: this.lastGpuMs,
      drawCalls,
      shadowDrawCalls,
      triangles,
      objects: count,
      uploadedBytes,
      renderWidth: this.width,
      renderHeight: this.height,
    };
  }

  /** Count a submission until the GPU reports it finished, so callers can bound queue depth. */
  private trackSubmission(): void {
    this.inFlight++;
    const done = () => {
      this.inFlight = Math.max(0, this.inFlight - 1);
    };
    this.device.queue.onSubmittedWorkDone().then(done, done);
  }

  /** Render a frame and wait until the GPU queue has finished it. Used by benchmarks. */
  async renderAndWait(): Promise<FrameTiming | null> {
    const start = performance.now();
    const stats = this.render();
    if (!stats) return null;
    await this.device.queue.onSubmittedWorkDone();
    return { stats, completionMs: performance.now() - start };
  }

  /** Release every GPU resource and the device. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseAllMeshes();
    this.meshCache.clear();
    this.resources.destroyAll();
    this.querySet?.destroy();
    this.context.unconfigure();
    this.device.destroy();
    this.onDeviceLost.clear();
  }

  // ---- internals --------------------------------------------------------------------------

  private readTimings(shadowRan: boolean): void {
    const read = this.queryRead!;
    this.timingPending = true;
    read
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const t = new BigUint64Array(read.getMappedRange().slice(0));
        read.unmap();
        let ns = 0n;
        if (shadowRan && t[1] > t[0]) ns += t[1] - t[0];
        if (t[3] > t[2]) ns += t[3] - t[2];
        this.lastGpuMs = Number(ns) / 1e6;
        this.timingPending = false;
      })
      .catch(() => {
        this.timingPending = false;
      });
  }

  private createCheckerTexture(): GPUTextureView {
    const levels = generateMipChain(createCheckerImage(256, 8));
    let bytes = 0;
    for (const l of levels) bytes += l.data.byteLength;
    const texture = this.resources.createTexture(
      {
        label: "checker-albedo",
        size: [levels[0].width, levels[0].height],
        mipLevelCount: levels.length,
        format: CHECKER_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      },
      bytes,
    );
    levels.forEach((level, mipLevel) => {
      this.device.queue.writeTexture(
        { texture, mipLevel },
        level.data.buffer as ArrayBuffer,
        { offset: level.data.byteOffset, bytesPerRow: level.width * 4 },
        { width: level.width, height: level.height },
      );
    });
    return texture.createView();
  }

  private createShadowResources(size: number): void {
    if (this.shadowTexture) this.resources.destroy(this.shadowTexture);
    this.shadowTexture = this.resources.createTexture(
      {
        label: `shadow-map-${size}`,
        size: [size, size],
        format: SHADOW_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      },
      size * size * 4,
    );
    this.shadowView = this.shadowTexture.createView();
    this.shadowFrameBindGroup = this.device.createBindGroup({
      label: "shadow-frame-bind-group",
      layout: this.shadowFrameLayout,
      entries: [{ binding: 0, resource: { buffer: this.frameBuffer } }],
    });
    this.mainFrameBindGroup = this.device.createBindGroup({
      label: "main-frame-bind-group",
      layout: this.frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: this.shadowView },
        { binding: 2, resource: this.shadowSampler },
        { binding: 3, resource: this.albedoView },
        { binding: 4, resource: this.albedoSampler },
      ],
    });
  }

  private resizeInternal(width: number, height: number): void {
    const changed = width !== this.width || height !== this.height || !this.depthTexture;
    if (!changed) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    // The depth buffer must always match the colour target; recreate it on every size change.
    if (this.depthTexture) this.resources.destroy(this.depthTexture);
    this.depthTexture = this.resources.createTexture(
      {
        label: "main-depth",
        size: [width, height],
        format: COLOR_DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      },
      width * height * 4,
    );
    this.depthView = this.depthTexture.createView();
  }

  private ensureInstanceCapacity(count: number): void {
    if (count <= this.instanceCapacity && this.instanceBuffer) return;
    let capacity = Math.max(64, this.instanceCapacity);
    while (capacity < count) capacity *= 2;
    if (this.instanceBuffer) this.resources.destroy(this.instanceBuffer);
    this.instanceBuffer = this.resources.createBuffer({
      label: "instance-uniforms",
      size: capacity * this.instanceStride,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.instanceData = new Float32Array((capacity * this.instanceStride) / 4);
    this.instanceCapacity = capacity;
    this.instanceBindGroup = this.device.createBindGroup({
      label: "instance-bind-group",
      layout: this.instanceLayout,
      entries: [
        { binding: 0, resource: { buffer: this.instanceBuffer, offset: 0, size: INSTANCE_BYTES } },
      ],
    });
    this.lastUploadedEpoch = -1; // force re-upload into the new buffer
  }

  private releaseAllMeshes(): void {
    for (const key of this.acquired.values()) this.meshCache.release(key);
    this.acquired.clear();
    this.drawList = [];
    this.drawMeshes = [];
    this.syncedScene = null;
  }

  /** Acquire/release GPU meshes so they exactly match the scene's current objects. */
  private syncResources(scene: Scene): void {
    if (this.syncedScene === scene && this.syncedSceneVersion === scene.version) return;
    const objects = scene.meshObjects();
    const present = new Set(objects.map((o) => o.id));
    for (const [id, key] of this.acquired) {
      if (!present.has(id)) {
        this.meshCache.release(key);
        this.acquired.delete(id);
      }
    }
    for (const obj of objects) {
      if (!this.acquired.has(obj.id)) {
        this.meshCache.acquire(obj.geometryKey, obj.mesh);
        this.acquired.set(obj.id, obj.geometryKey);
      }
    }
    // Sort by geometry so identical meshes are drawn back-to-back (fewer buffer rebinds).
    objects.sort((a, b) =>
      a.geometryKey < b.geometryKey ? -1 : a.geometryKey > b.geometryKey ? 1 : 0,
    );
    this.drawList = objects;
    this.drawMeshes = objects.map((o) => this.meshCache.get(o.geometryKey)!);
    this.syncedScene = scene;
    this.syncedSceneVersion = scene.version;
    this.lastUploadedCount = -1;
  }

  private fillInstanceData(): void {
    const stride = this.instanceStride / 4;
    const L = INSTANCE_LAYOUT;
    for (let i = 0; i < this.drawList.length; i++) {
      const obj = this.drawList[i];
      const base = i * stride;
      const d = this.instanceData;
      d.set(obj.worldMatrix().elements, base + L.model);
      d.set(obj.normalMatrix().elements, base + L.normalMat);
      const m: MaterialParams = obj.material;
      d[base + L.baseColorRoughness] = m.baseColor[0];
      d[base + L.baseColorRoughness + 1] = m.baseColor[1];
      d[base + L.baseColorRoughness + 2] = m.baseColor[2];
      d[base + L.baseColorRoughness + 3] = m.roughness;
      d[base + L.emissiveMetalness] = m.emissive[0];
      d[base + L.emissiveMetalness + 1] = m.emissive[1];
      d[base + L.emissiveMetalness + 2] = m.emissive[2];
      d[base + L.emissiveMetalness + 3] = m.metalness;
      d[base + L.flags] = obj.receiveShadow ? 1 : 0;
      d[base + L.flags + 1] = obj.id === this.selectedId ? 1 : 0;
      d[base + L.flags + 2] = m.checker;
      d[base + L.flags + 3] = m.uvScale;
    }
  }

  /** Fill the frame uniform block. Returns whether the shadow pass should run this frame. */
  private fillFrameData(scene: Scene): boolean {
    const d = this.frameData;
    const L = FRAME_LAYOUT;
    d.fill(0);
    const camera = scene.camera;
    d.set(camera.viewProjectionMatrix().elements, L.viewProj);
    d.set(camera.position.toArray(), L.cameraPos);

    const dirLight = scene.lights.find(
      (l): l is DirectionalLightDefinition => l.type === "directional",
    );
    const points = scene.lights.filter((l): l is PointLightDefinition => l.type === "point");
    const mode = this.settings.mode;
    const shadowActive =
      this.settings.shadowsEnabled &&
      !!dirLight &&
      dirLight.castShadow &&
      (mode === "lit" || mode === "shadow");

    const sphere = scene.boundingSphere();
    if (dirLight) {
      const dir = normalizedLightDirection(dirLight);
      d.set(dir.toArray(), L.dirLightDir);
      d[L.dirLightColor] = dirLight.color[0] * dirLight.intensity;
      d[L.dirLightColor + 1] = dirLight.color[1] * dirLight.intensity;
      d[L.dirLightColor + 2] = dirLight.color[2] * dirLight.intensity;
      d[L.dirLightColor + 3] = shadowActive ? 1 : 0;
      const volume = computeDirectionalShadowMatrix(
        dir,
        sphere.center,
        sphere.radius,
        this.settings.shadowMapSize,
      );
      d.set(volume.viewProjection.elements, L.lightViewProj);
    } else {
      d[L.dirLightDir + 1] = -1;
    }

    d.set(scene.ambient, L.ambient);
    d.set(scene.background, L.background);
    const count = Math.min(L.maxPoints, points.length);
    d[L.params] = count;
    d[L.params + 1] = RENDER_MODE_INDEX[mode];
    d[L.params + 2] = 1 / this.settings.shadowMapSize;
    d[L.params + 3] = SHADER_DEPTH_BIAS;

    const dist = camera.position.distanceTo(sphere.center);
    d[L.depthRange] = Math.max(camera.near, dist - sphere.radius);
    d[L.depthRange + 1] = dist + sphere.radius;

    for (let i = 0; i < count; i++) {
      const p = points[i];
      const o = L.points + i * L.pointStride;
      d[o] = p.position[0];
      d[o + 1] = p.position[1];
      d[o + 2] = p.position[2];
      d[o + 3] = p.range;
      d[o + 4] = p.color[0] * p.intensity;
      d[o + 5] = p.color[1] * p.intensity;
      d[o + 6] = p.color[2] * p.intensity;
    }
    return shadowActive;
  }
}

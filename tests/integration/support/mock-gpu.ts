import { vi } from "vitest";

/**
 * A recording stand-in for the parts of the WebGPU API that `Renderer` uses.
 *
 * It does NOT execute shaders or rasterize anything. It exists so that renderer *behaviour* —
 * resource lifecycle, resize handling, upload decisions, device loss, draw-call bookkeeping — can
 * be verified on machines (such as CI runners) that have no GPU. Rendering correctness itself is
 * covered by the Playwright suite against a real adapter.
 */

export interface MockResource {
  kind: "buffer" | "texture" | "sampler" | "bindGroup" | "pipeline" | "other";
  label: string;
  descriptor: Record<string, unknown>;
  destroyed: boolean;
}

export interface MockGpu {
  adapter: GPUAdapter;
  device: GPUDevice;
  canvas: HTMLCanvasElement;
  resources: MockResource[];
  /** Every `queue.writeBuffer` call as `[label, byteLength]`. */
  bufferWrites: Array<[string, number]>;
  submits: number;
  /** One entry per render pass: how many `drawIndexed` calls it recorded. */
  passDraws: Array<{ label: string; draws: number }>;
  contextConfigured: { device: unknown; format: string } | null;
  contextUnconfigured: boolean;
  deviceDestroyed: boolean;
  /** Resolve the `device.lost` promise, as the browser does when the GPU is reset or removed. */
  loseDevice(reason?: GPUDeviceLostReason, message?: string): void;
  /** Make `queue.onSubmittedWorkDone()` return promises that stay pending until released. */
  holdSubmissions(): { release(): void };
  /** Make the shader module report a compilation error. */
  failShaderCompilation(message: string): void;
  /** Make `canvas.getContext("webgpu")` return null. */
  denyCanvasContext(): void;
  byKind(kind: MockResource["kind"]): MockResource[];
  live(kind: MockResource["kind"]): MockResource[];
}

const GLOBAL_CONSTANTS = {
  GPUShaderStage: { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 },
  GPUBufferUsage: {
    MAP_READ: 1,
    MAP_WRITE: 2,
    COPY_SRC: 4,
    COPY_DST: 8,
    INDEX: 16,
    VERTEX: 32,
    UNIFORM: 64,
    STORAGE: 128,
    INDIRECT: 256,
    QUERY_RESOLVE: 512,
  },
  GPUTextureUsage: {
    COPY_SRC: 1,
    COPY_DST: 2,
    TEXTURE_BINDING: 4,
    STORAGE_BINDING: 8,
    RENDER_ATTACHMENT: 16,
  },
  GPUColorWrite: { ALL: 15 },
} as const;

/** Install the WebGPU enum globals and `navigator.gpu` that the engine reads. */
export function installGpuGlobals(): void {
  for (const [name, value] of Object.entries(GLOBAL_CONSTANTS)) vi.stubGlobal(name, value);
  vi.stubGlobal("navigator", {
    gpu: { getPreferredCanvasFormat: () => "bgra8unorm" },
  });
}

export function removeGpuGlobals(): void {
  vi.unstubAllGlobals();
}

export function createMockGpu(options: { timestampQuery?: boolean } = {}): MockGpu {
  const resources: MockResource[] = [];
  const bufferWrites: Array<[string, number]> = [];
  const passDraws: Array<{ label: string; draws: number }> = [];
  const state = {
    submits: 0,
    shaderError: null as string | null,
    contextDenied: false,
    held: null as null | { pending: Array<() => void>; active: boolean },
  };

  let resolveLost!: (info: GPUDeviceLostInfo) => void;
  const lost = new Promise<GPUDeviceLostInfo>((resolve) => (resolveLost = resolve));

  const track = (
    kind: MockResource["kind"],
    descriptor: Record<string, unknown> | undefined,
  ): MockResource => {
    const resource: MockResource = {
      kind,
      label: String(descriptor?.label ?? kind),
      descriptor: descriptor ?? {},
      destroyed: false,
    };
    resources.push(resource);
    return resource;
  };

  const makeBuffer = (d: GPUBufferDescriptor) => {
    const r = track("buffer", d as unknown as Record<string, unknown>);
    return {
      label: r.label,
      size: d.size,
      destroy: () => {
        r.destroyed = true;
      },
    };
  };

  const makeTexture = (d: GPUTextureDescriptor) => {
    const r = track("texture", d as unknown as Record<string, unknown>);
    const size = d.size as number[];
    return {
      label: r.label,
      width: size[0],
      height: size[1],
      format: d.format,
      createView: () => ({ label: `${r.label}-view`, texture: r }),
      destroy: () => {
        r.destroyed = true;
      },
    };
  };

  const makePass = (label: string) => {
    const entry = { label, draws: 0 };
    passDraws.push(entry);
    return {
      setPipeline: () => {},
      setBindGroup: () => {},
      setVertexBuffer: () => {},
      setIndexBuffer: () => {},
      drawIndexed: () => {
        entry.draws++;
      },
      end: () => {},
    };
  };

  const bufferLabel = (buffer: unknown) => String((buffer as { label?: string }).label ?? "buffer");

  const device = {
    label: "mock-device",
    features: new Set<string>(options.timestampQuery ? ["timestamp-query"] : []),
    limits: { minUniformBufferOffsetAlignment: 256, maxTextureDimension2D: 8192 },
    lost,
    queue: {
      writeBuffer: (buffer: unknown, _offset: number, _data: unknown, _dOff: number, size = 0) => {
        bufferWrites.push([bufferLabel(buffer), size]);
      },
      writeTexture: () => {},
      submit: () => {
        state.submits++;
      },
      onSubmittedWorkDone: () => {
        if (state.held?.active) {
          return new Promise<void>((resolve) => state.held!.pending.push(resolve));
        }
        return Promise.resolve();
      },
    },
    createBuffer: makeBuffer,
    createTexture: makeTexture,
    createSampler: (d: GPUSamplerDescriptor) => {
      track("sampler", d as unknown as Record<string, unknown>);
      return {};
    },
    createBindGroupLayout: (d: GPUBindGroupLayoutDescriptor) => {
      track("other", d as unknown as Record<string, unknown>);
      return {};
    },
    createPipelineLayout: (d: GPUPipelineLayoutDescriptor) => {
      track("other", d as unknown as Record<string, unknown>);
      return {};
    },
    createRenderPipeline: (d: GPURenderPipelineDescriptor) => {
      track("pipeline", d as unknown as Record<string, unknown>);
      return {};
    },
    createBindGroup: (d: GPUBindGroupDescriptor) => {
      track("bindGroup", d as unknown as Record<string, unknown>);
      return {};
    },
    createQuerySet: (d: GPUQuerySetDescriptor) => {
      const r = track("other", d as unknown as Record<string, unknown>);
      return {
        destroy: () => {
          r.destroyed = true;
        },
      };
    },
    createShaderModule: () => ({
      getCompilationInfo: async () => ({
        messages: state.shaderError
          ? [{ type: "error", lineNum: 1, linePos: 1, message: state.shaderError }]
          : [],
      }),
    }),
    createCommandEncoder: () => ({
      beginRenderPass: (d: GPURenderPassDescriptor) => makePass(String(d.label ?? "pass")),
      resolveQuerySet: () => {},
      copyBufferToBuffer: () => {},
      finish: () => ({}),
    }),
    pushErrorScope: () => {},
    popErrorScope: async () => null,
    addEventListener: () => {},
    destroy: () => {
      gpu.deviceDestroyed = true;
      // The browser resolves `device.lost` with reason "destroyed" after an intentional destroy().
      resolveLost({ reason: "destroyed", message: "device destroyed" } as GPUDeviceLostInfo);
    },
  };

  const context = {
    configure: (config: { device: unknown; format: string }) => {
      gpu.contextConfigured = { device: config.device, format: config.format };
    },
    unconfigure: () => {
      gpu.contextUnconfigured = true;
    },
    getCurrentTexture: () =>
      makeTexture({ label: "swapchain", size: [1, 1], format: "bgra8unorm", usage: 16 }),
  };

  const canvas = {
    width: 300,
    height: 150,
    getContext: (type: string) => (type === "webgpu" && !state.contextDenied ? context : null),
    getBoundingClientRect: () => ({ width: 800, height: 600 }),
  } as unknown as HTMLCanvasElement;

  const adapter = {
    features: new Set<string>(options.timestampQuery ? ["timestamp-query"] : []),
    limits: { maxTextureDimension2D: 8192, minUniformBufferOffsetAlignment: 256 },
    info: {
      vendor: "mock",
      architecture: "mock-arch",
      device: "mock-device",
      description: "Mock adapter for tests",
      isFallbackAdapter: false,
    },
    requestDevice: async () => device,
  } as unknown as GPUAdapter;

  const gpu: MockGpu = {
    adapter,
    device: device as unknown as GPUDevice,
    canvas,
    resources,
    bufferWrites,
    get submits() {
      return state.submits;
    },
    passDraws,
    contextConfigured: null,
    contextUnconfigured: false,
    deviceDestroyed: false,
    loseDevice(reason = "unknown", message = "simulated GPU reset") {
      resolveLost({ reason, message } as GPUDeviceLostInfo);
    },
    holdSubmissions() {
      state.held = { pending: [], active: true };
      const held = state.held;
      return {
        release: () => {
          held.active = false;
          for (const resolve of held.pending.splice(0)) resolve();
        },
      };
    },
    failShaderCompilation(message: string) {
      state.shaderError = message;
    },
    denyCanvasContext() {
      state.contextDenied = true;
    },
    byKind: (kind) => resources.filter((r) => r.kind === kind),
    live: (kind) => resources.filter((r) => r.kind === kind && !r.destroyed),
  };
  return gpu;
}

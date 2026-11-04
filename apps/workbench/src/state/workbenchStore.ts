import {
  SCENARIOS,
  runSuite,
  BenchmarkAbortedError,
  type BenchmarkFile,
  type BenchmarkScenario,
} from "@lumenlab/benchmark";
import {
  DEFAULT_RENDER_SETTINGS,
  Engine,
  EngineError,
  radToDeg,
  SCENE_PRESETS,
  type FrameStats,
  type LightDefinition,
  type MaterialParams,
  type RenderSettings,
  type Scene,
  type ScenePresetId,
  type TransformPatch,
} from "@lumenlab/engine";
import type { LabState, ObjectDetail, ObjectSummary, SelectionKind, WorkbenchState } from "./types";

export const PRESET_OPTIONS: ReadonlyArray<{ id: ScenePresetId; label: string }> = [
  { id: "geometry-studio", label: "Geometry Studio" },
  { id: "material-gallery", label: "Material Gallery" },
  { id: "scale-test", label: "Scale Test (100 objects)" },
];

const IDLE_LAB: LabState = {
  phase: "idle",
  progress: null,
  completedFrames: 0,
  totalFrames: 0,
  file: null,
  error: null,
};

function initialState(): WorkbenchState {
  return {
    status: { kind: "initializing" },
    adapter: null,
    gpuTiming: false,
    presetId: "geometry-studio",
    sceneName: "",
    objectCount: 0,
    triangleCount: 0,
    objects: [],
    lights: [],
    selectionKind: null,
    selectedObject: null,
    selectedLight: null,
    camera: null,
    settings: { ...DEFAULT_RENDER_SETTINGS },
    stats: null,
    timing: null,
    resources: null,
    renderSize: null,
    log: [],
    lab: IDLE_LAB,
  };
}

/**
 * The only bridge between React and the engine. React components read immutable snapshots through
 * `useSyncExternalStore` and send typed commands; they never see GPU objects or run a render loop.
 */
export class WorkbenchStore {
  private state: WorkbenchState = initialState();
  private readonly listeners = new Set<() => void>();
  private chain: Promise<void> = Promise.resolve();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private latestFrame: FrameStats | null = null;
  private unsubs: Array<() => void> = [];
  private canvas: HTMLCanvasElement | null = null;
  private cachedScene: Scene | null = null;
  private cachedVersion = -1;
  private eulerCache = new Map<string, [number, number, number]>();
  private labAbort: AbortController | null = null;

  engine: Engine | null = null;

  // ---- external-store plumbing ------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): WorkbenchState => this.state;

  private set(patch: Partial<WorkbenchState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  // ---- lifecycle --------------------------------------------------------------------------

  /**
   * Create the engine for a canvas. Creation and disposal are serialised so React StrictMode's
   * mount → unmount → mount sequence can never configure one canvas twice at the same time.
   * Returns the unmount function.
   */
  mount(canvas: HTMLCanvasElement): () => void {
    let cancelled = false;
    let created: Engine | null = null;
    this.enqueue(async () => {
      if (cancelled) return;
      this.set({ status: { kind: "initializing" } });
      try {
        created = await Engine.create(canvas);
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof EngineError ? error.code : "unknown";
        const reason = error instanceof Error ? error.message : String(error);
        this.set({ status: { kind: "unsupported", code, reason } });
        return;
      }
      if (cancelled) {
        created.dispose();
        created = null;
        return;
      }
      this.bind(created, canvas);
    });
    return () => {
      cancelled = true;
      this.enqueue(async () => {
        if (created) {
          this.unbind(created);
          created = null;
        }
      });
    };
  }

  /** After a device loss: drop the dead engine and create a fresh one on the same canvas. */
  recover(): void {
    const canvas = this.canvas;
    const dead = this.engine;
    if (!canvas) return;
    this.enqueue(async () => {
      if (dead) this.unbind(dead);
      this.set({ status: { kind: "initializing" } });
      try {
        const engine = await Engine.create(canvas);
        this.bind(engine, canvas);
      } catch (error) {
        const code = error instanceof EngineError ? error.code : "unknown";
        this.set({
          status: {
            kind: "unsupported",
            code,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });
  }

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task, task).catch(() => undefined);
  }

  private bind(engine: Engine, canvas: HTMLCanvasElement): void {
    this.engine = engine;
    this.canvas = canvas;
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(canvas);
    this.unsubs = [
      () => ro.disconnect(),
      engine.onFrame.subscribe((s) => {
        this.latestFrame = s;
      }),
      engine.onSceneChanged.subscribe(() => this.refreshScene()),
      engine.onSelectionChanged.subscribe(() => this.refreshSelection()),
      engine.onDeviceLost.subscribe((reason) => this.set({ status: { kind: "lost", reason } })),
      engine.log.onEntry.subscribe(() => this.set({ log: [...engine.log.list()] })),
    ];
    engine.resize();
    this.set({
      status: { kind: "ready" },
      adapter: engine.adapter,
      gpuTiming: engine.gpuTimingAvailable,
      settings: engine.getRenderSettings(),
      log: [...engine.log.list()],
    });
    this.loadPreset(this.state.presetId as ScenePresetId);
    engine.start();
    this.statsTimer = setInterval(() => this.pollStats(), 250);
  }

  private unbind(engine: Engine): void {
    this.labAbort?.abort();
    this.labAbort = null;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    engine.dispose();
    if (this.engine === engine) {
      this.engine = null;
      this.cachedScene = null;
      this.cachedVersion = -1;
      this.latestFrame = null;
      this.set({ stats: null, timing: null, resources: null, lab: IDLE_LAB });
    }
  }

  private pollStats(): void {
    const engine = this.engine;
    if (!engine || engine.deviceLost) return;
    const o = engine.orbit;
    const camera = engine.scene?.camera;
    this.set({
      stats: this.latestFrame,
      timing: engine.timingSummary(),
      resources: engine.resourceStats(),
      renderSize: engine.renderSize,
      camera: camera
        ? {
            distance: o.distance,
            azimuthDegrees: radToDeg(o.azimuth),
            polarDegrees: radToDeg(o.polar),
            fovYDegrees: camera.fovYDegrees,
          }
        : null,
    });
  }

  // ---- scene ------------------------------------------------------------------------------

  loadPreset(id: ScenePresetId): void {
    const engine = this.engine;
    if (!engine) {
      this.set({ presetId: id });
      return;
    }
    this.eulerCache.clear();
    this.cachedScene = null;
    this.set({ presetId: id, selectionKind: null, selectedObject: null, selectedLight: null });
    engine.loadScene(SCENE_PRESETS[id]());
    engine.resetTiming();
    this.refreshScene();
  }

  private refreshScene(): void {
    const engine = this.engine;
    const scene = engine?.scene;
    if (!engine || !scene) return;
    const patch: Partial<WorkbenchState> = {};
    if (scene !== this.cachedScene || scene.version !== this.cachedVersion) {
      this.cachedScene = scene;
      this.cachedVersion = scene.version;
      const { objectCount, triangleCount } = scene.stats();
      const objects: ObjectSummary[] = scene.meshObjects().map((o) => ({
        id: o.id,
        name: o.name,
        geometry: o.geometrySpec.type,
        triangles: o.mesh.indices.length / 3,
      }));
      Object.assign(patch, {
        sceneName: scene.name,
        objectCount,
        triangleCount,
        objects,
        lights: scene.lights.map((l) => ({ id: l.id, name: l.name ?? l.id, type: l.type })),
      });
    }
    Object.assign(patch, this.selectionPatch());
    this.set(patch);
  }

  private refreshSelection(): void {
    const engine = this.engine;
    if (!engine) return;
    // Selecting an object in the viewport/tree takes precedence over a light/camera selection.
    if (engine.selectedId) this.set(this.selectionPatch("object"));
    else if (this.state.selectionKind === "object") this.set(this.selectionPatch("none"));
  }

  private selectionPatch(force?: "object" | "none"): Partial<WorkbenchState> {
    const engine = this.engine;
    const scene = engine?.scene;
    if (!engine || !scene) return {};
    let kind: SelectionKind = this.state.selectionKind;
    if (force === "object") kind = "object";
    if (force === "none") kind = null;
    const id = engine.selectedId;
    let selectedObject: ObjectDetail | null = null;
    if (kind === "object" && id) {
      const o = scene.getObject(id);
      if (o) {
        const euler =
          this.eulerCache.get(id) ??
          (o.rotation.toEuler().map(radToDeg) as [number, number, number]);
        selectedObject = {
          id: o.id,
          name: o.name,
          geometry: o.geometrySpec.type,
          triangles: o.mesh.indices.length / 3,
          position: o.position.toArray(),
          rotationDegrees: euler,
          scale: o.scale.toArray(),
          material: { ...o.material },
          castShadow: o.castShadow,
          receiveShadow: o.receiveShadow,
        };
      } else kind = null;
    } else if (kind === "object") kind = null;
    const selectedLight =
      kind === "light" && this.state.selectedLight
        ? (structuredClone(
            scene.getLight(this.state.selectedLight.id) ?? null,
          ) as LightDefinition | null)
        : null;
    if (kind === "light" && !selectedLight) kind = null;
    return { selectionKind: kind, selectedObject, selectedLight };
  }

  selectObject(id: string | null): void {
    const engine = this.engine;
    if (!engine) return;
    if (id === null) {
      engine.setSelection(null);
      this.set({ selectionKind: null, selectedObject: null, selectedLight: null });
      return;
    }
    this.set({ selectionKind: "object" });
    engine.setSelection(id);
    this.set(this.selectionPatch("object"));
  }

  selectLight(id: string): void {
    const engine = this.engine;
    const light = engine?.scene?.getLight(id);
    if (!engine || !light) return;
    engine.setSelection(null);
    this.set({
      selectionKind: "light",
      selectedObject: null,
      selectedLight: structuredClone(light),
    });
  }

  selectCamera(): void {
    this.engine?.setSelection(null);
    this.set({ selectionKind: "camera", selectedObject: null, selectedLight: null });
  }

  // ---- editing commands -------------------------------------------------------------------

  setMaterial(id: string, patch: Partial<MaterialParams>): void {
    this.engine?.setMaterial(id, patch);
  }

  setTransform(id: string, patch: TransformPatch): void {
    if (patch.rotationDegrees) this.eulerCache.set(id, [...patch.rotationDegrees]);
    this.engine?.setTransform(id, patch);
  }

  setObjectFlags(id: string, flags: { castShadow?: boolean; receiveShadow?: boolean }): void {
    this.engine?.setObjectFlags(id, flags);
  }

  setLight(
    id: string,
    patch: Partial<Pick<LightDefinition, "intensity" | "color">> & {
      direction?: [number, number, number];
    },
  ): void {
    this.engine?.setLight(id, patch);
    this.set(this.selectionPatch());
  }

  setRenderSettings(patch: Partial<RenderSettings>): void {
    const engine = this.engine;
    if (!engine) return;
    engine.setRenderSettings(patch);
    this.set({ settings: engine.getRenderSettings() });
  }

  setFov(degrees: number): void {
    this.engine?.setCameraFov(degrees);
    this.pollStats();
  }

  // ---- camera / pointer -------------------------------------------------------------------

  orbit(dxPixels: number, dyPixels: number): void {
    this.engine?.orbit.rotate(-dxPixels * 0.008, -dyPixels * 0.008);
  }

  pan(dxPixels: number, dyPixels: number): void {
    const engine = this.engine;
    if (!engine || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const fov = engine.scene?.camera.fovYDegrees ?? 50;
    const worldPerPixel =
      (2 * engine.orbit.distance * Math.tan((fov * Math.PI) / 360)) / Math.max(1, rect.height);
    engine.orbit.pan(-dxPixels * worldPerPixel, dyPixels * worldPerPixel);
  }

  zoom(wheelDeltaY: number): void {
    this.engine?.orbit.zoom(Math.exp(wheelDeltaY * 0.0012));
  }

  resetCamera(): void {
    this.engine?.resetCamera();
  }

  pick(x: number, y: number): void {
    const engine = this.engine;
    if (!engine) return;
    const id = engine.pickAt(x, y);
    this.set(this.selectionPatch(id ? "object" : "none"));
  }

  // ---- performance lab --------------------------------------------------------------------

  /** Benchmark scenarios available in the Performance Lab. */
  get scenarios(): readonly BenchmarkScenario[] {
    return SCENARIOS;
  }

  /**
   * Run the chosen scenarios on the live engine. The current scene is replaced by the benchmark
   * workloads and restored to the active preset afterwards.
   */
  async runLab(ids?: readonly string[]): Promise<BenchmarkFile | null> {
    const engine = this.engine;
    if (!engine || this.state.lab.phase === "running") return null;
    const chosen = SCENARIOS.filter((s) => !ids || ids.includes(s.id));
    if (chosen.length === 0) return null;
    const totalFrames = chosen.reduce(
      (n, s) => n + s.runs * (s.warmupFrames + s.measuredFrames),
      0,
    );
    const abort = new AbortController();
    this.labAbort = abort;
    let completed = 0;
    const setLab = (patch: Partial<LabState>) => this.set({ lab: { ...this.state.lab, ...patch } });
    this.set({ lab: { ...IDLE_LAB, phase: "running", totalFrames } });
    try {
      const file = await runSuite(engine, chosen, {
        signal: abort.signal,
        onProgress: (p) => {
          completed++;
          if (completed % 4 === 0 || p.frame === p.totalFrames)
            setLab({ progress: p, completedFrames: completed });
        },
      });
      setLab({ phase: "done", file, progress: null, completedFrames: totalFrames });
      return file;
    } catch (error) {
      if (error instanceof BenchmarkAbortedError) setLab({ phase: "aborted", progress: null });
      else
        setLab({
          phase: "error",
          error: error instanceof Error ? error.message : String(error),
          progress: null,
        });
      return null;
    } finally {
      this.labAbort = null;
      if (this.engine === engine && !engine.deviceLost)
        this.loadPreset(this.state.presetId as ScenePresetId);
    }
  }

  cancelLab(): void {
    this.labAbort?.abort();
  }

  clearLab(): void {
    if (this.state.lab.phase !== "running") this.set({ lab: IDLE_LAB });
  }
}

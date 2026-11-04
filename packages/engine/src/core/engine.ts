import { OrbitController } from "../camera/orbit-controller";
import { PerspectiveCamera } from "../camera/perspective-camera";
import { DiagnosticsLog } from "../diagnostics/log";
import { detectWebGPU } from "../diagnostics/support";
import { RollingWindow, median, percentile } from "../diagnostics/statistics";
import type { AdapterReport, FrameStats, GpuResourceStats } from "../diagnostics/types";
import type { MaterialParams } from "../materials/material";
import type { LightDefinition } from "../lighting/lights";
import { Renderer, type FrameTiming } from "../renderer/renderer";
import type { RenderSettings } from "../renderer/settings";
import { Scene } from "../scene/scene";
import type { SceneDefinition } from "../scene/definition";
import { pickObject } from "../scene/picking";
import { SceneNode } from "../scene/scene-node";
import { Quaternion } from "../math/quaternion";
import { degToRad } from "../math/scalar";
import { Vector3 } from "../math/vector3";
import { Emitter } from "./emitter";
import { EngineError } from "./errors";

export interface FrameTimingSummary {
  /** Median / p95 of requestAnimationFrame intervals (includes vsync pacing). */
  intervalMedianMs: number;
  intervalP95Ms: number;
  fps: number;
  /** Median CPU encode+submit time. */
  cpuMedianMs: number;
  samples: number;
}

export interface TransformPatch {
  position?: [number, number, number];
  /** Euler XYZ in degrees */
  rotationDegrees?: [number, number, number];
  scale?: [number, number, number];
}

/**
 * Public facade of the engine. The UI talks to this class only, using plain typed data, and never
 * touches GPU objects or runs its own render loop.
 */
/** Maximum frames queued on the GPU before the render loop skips an animation frame. */
export const MAX_FRAMES_IN_FLIGHT = 2;

export class Engine {
  readonly log: DiagnosticsLog;
  readonly onFrame = new Emitter<FrameStats>();
  readonly onSceneChanged = new Emitter<Scene>();
  readonly onSelectionChanged = new Emitter<string | null>();
  readonly onDeviceLost = new Emitter<string>();
  readonly adapter: AdapterReport;
  readonly orbit = new OrbitController();

  private _scene: Scene | null = null;
  private _definition: SceneDefinition | null = null;
  private _selectedId: string | null = null;
  private rafHandle: number | null = null;
  private lastFrameTime: number | null = null;
  private skippedFrames = 0;
  private readonly intervals = new RollingWindow(240);
  private readonly cpuTimes = new RollingWindow(240);
  private lastStats: FrameStats | null = null;
  private disposed = false;

  private constructor(
    private readonly renderer: Renderer,
    private readonly canvas: HTMLCanvasElement,
    log: DiagnosticsLog,
  ) {
    this.log = log;
    this.adapter = renderer.adapterReport;
    renderer.onDeviceLost.subscribe((message) => {
      this.stop();
      this.onDeviceLost.emit(message);
    });
  }

  /**
   * Create an engine bound to a canvas. Throws `EngineError` with a precise code when WebGPU is not
   * usable. There is intentionally no fallback renderer.
   */
  static async create(canvas: HTMLCanvasElement): Promise<Engine> {
    const support = await detectWebGPU();
    if (!support.supported) {
      throw new EngineError(
        support.reason.includes("no compatible GPU adapter")
          ? "adapter-unavailable"
          : "webgpu-unavailable",
        support.reason,
      );
    }
    const log = new DiagnosticsLog();
    const renderer = await Renderer.create(canvas, support.adapter, log);
    return new Engine(renderer, canvas, log);
  }

  // ---- scene ------------------------------------------------------------------------------

  get scene(): Scene | null {
    return this._scene;
  }

  loadScene(definition: SceneDefinition): Scene {
    const scene = Scene.fromDefinition(definition);
    this._scene = scene;
    this._definition = definition;
    this.renderer.setScene(scene);
    this.syncOrbitTo(scene.camera);
    this.setSelection(null);
    this.onSceneChanged.emit(scene);
    return scene;
  }

  private syncOrbitTo(camera: PerspectiveCamera): void {
    const synced = OrbitController.fromCamera(camera);
    this.orbit.azimuth = synced.azimuth;
    this.orbit.polar = synced.polar;
    this.orbit.distance = synced.distance;
    this.orbit.target = synced.target;
  }

  /** Put the orbit camera back to the loaded scene's authored viewpoint. */
  resetCamera(): void {
    if (!this._definition) return;
    this.syncOrbitTo(new PerspectiveCamera(this._definition.camera));
  }

  /** Vertical field of view in degrees, clamped to a sane range. */
  setCameraFov(degrees: number): void {
    if (!this._scene || !Number.isFinite(degrees)) return;
    this._scene.camera.fovYDegrees = Math.min(100, Math.max(20, degrees));
  }

  get selectedId(): string | null {
    return this._selectedId;
  }

  setSelection(id: string | null): void {
    const valid = id !== null && this._scene?.getObject(id) ? id : null;
    this._selectedId = valid;
    this.renderer.setSelectedId(valid);
    this.onSelectionChanged.emit(valid);
  }

  /** Select the object under a canvas-relative point (CSS pixels). Returns the picked id. */
  pickAt(x: number, y: number): string | null {
    if (!this._scene) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = (x / rect.width) * 2 - 1;
    const ndcY = 1 - (y / rect.height) * 2;
    this._scene.camera.setAspect(rect.width, rect.height);
    const id = pickObject(this._scene, ndcX, ndcY);
    // Picking the ground plane is rarely what the user wants; treat it as "deselect".
    this.setSelection(id === "ground" ? null : id);
    return this._selectedId;
  }

  setMaterial(objectId: string, material: Partial<MaterialParams>): void {
    const obj = this._scene?.getObject(objectId);
    if (!obj) throw new EngineError("invalid-argument", `Unknown object "${objectId}"`);
    obj.setMaterial(material);
    this.onSceneChanged.emit(this._scene!);
  }

  setTransform(objectId: string, patch: TransformPatch): void {
    const obj = this._scene?.getObject(objectId);
    if (!obj) throw new EngineError("invalid-argument", `Unknown object "${objectId}"`);
    if (patch.position) obj.position = Vector3.from(patch.position);
    if (patch.scale) obj.scale = Vector3.from(patch.scale);
    if (patch.rotationDegrees) {
      const [x, y, z] = patch.rotationDegrees;
      obj.rotation = Quaternion.fromEuler(degToRad(x), degToRad(y), degToRad(z));
    }
    this.onSceneChanged.emit(this._scene!);
  }

  setObjectFlags(objectId: string, flags: { castShadow?: boolean; receiveShadow?: boolean }): void {
    const obj = this._scene?.getObject(objectId);
    if (!obj) throw new EngineError("invalid-argument", `Unknown object "${objectId}"`);
    if (flags.castShadow !== undefined) obj.castShadow = flags.castShadow;
    if (flags.receiveShadow !== undefined) obj.receiveShadow = flags.receiveShadow;
    this.onSceneChanged.emit(this._scene!);
  }

  setLight(
    lightId: string,
    patch: Partial<Pick<LightDefinition, "intensity" | "color">> & {
      direction?: [number, number, number];
    },
  ): void {
    const light = this._scene?.getLight(lightId);
    if (!light) throw new EngineError("invalid-argument", `Unknown light "${lightId}"`);
    if (patch.intensity !== undefined && Number.isFinite(patch.intensity))
      light.intensity = Math.max(0, patch.intensity);
    if (patch.color) light.color = [...patch.color];
    if (patch.direction && light.type === "directional") light.direction = [...patch.direction];
    SceneNode.touch();
    this.onSceneChanged.emit(this._scene!);
  }

  // ---- render settings --------------------------------------------------------------------

  getRenderSettings(): RenderSettings {
    return this.renderer.getSettings();
  }

  setRenderSettings(partial: Partial<RenderSettings>): void {
    const before = this.renderer.getSettings();
    this.renderer.setSettings(partial);
    if (partial.renderScale !== undefined && partial.renderScale !== before.renderScale)
      this.applyCanvasSize();
  }

  /** Pin the render resolution (pixels). Pass null to follow the canvas size again. */
  setFixedRenderSize(size: { width: number; height: number } | null): void {
    this.renderer.setFixedSize(size);
    if (!size) this.applyCanvasSize();
  }

  /** Resize to the canvas's current CSS size. Call from a ResizeObserver. */
  resize(): void {
    this.applyCanvasSize();
  }

  private applyCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
  }

  // ---- loop -------------------------------------------------------------------------------

  get running(): boolean {
    return this.rafHandle !== null;
  }

  start(): void {
    if (this.rafHandle !== null || this.disposed || this.renderer.isLost) return;
    this.lastFrameTime = null;
    const tick = (now: number) => {
      this.rafHandle = requestAnimationFrame(tick);
      if (this.lastFrameTime !== null) this.intervals.push(now - this.lastFrameTime);
      this.lastFrameTime = now;
      if (this._scene) {
        this.orbit.apply(this._scene.camera);
        SceneNode.touch(); // camera moved; cheap, only forces matrix cache refresh
      }
      // Back-pressure: on slow (e.g. software) adapters, submitting every vsync grows the queue
      // without bound and makes every frame later than the last. Skip until the GPU catches up.
      if (this.renderer.framesInFlight >= MAX_FRAMES_IN_FLIGHT) {
        this.skippedFrames++;
        return;
      }
      const stats = this.renderer.render();
      if (stats) {
        this.cpuTimes.push(stats.cpuMs);
        this.lastStats = stats;
        this.onFrame.emit(stats);
      }
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
    this.lastFrameTime = null;
  }

  /** Render exactly one frame now (applies orbit state first). */
  renderOnce(): FrameStats | null {
    if (this._scene) this.orbit.apply(this._scene.camera);
    return this.renderer.render();
  }

  /** Render one frame and wait for GPU completion. Used by the benchmark runner. */
  async renderTimed(): Promise<FrameTiming | null> {
    if (this._scene) this.orbit.apply(this._scene.camera);
    return this.renderer.renderAndWait();
  }

  timingSummary(): FrameTimingSummary {
    const intervals = this.intervals.values();
    const med = median(intervals);
    return {
      intervalMedianMs: med,
      intervalP95Ms: percentile(intervals, 95),
      fps: med > 0 ? 1000 / med : 0,
      cpuMedianMs: median(this.cpuTimes.values()),
      samples: intervals.length,
    };
  }

  resetTiming(): void {
    this.intervals.clear();
    this.cpuTimes.clear();
  }

  /** Animation frames skipped because the GPU still had {@link MAX_FRAMES_IN_FLIGHT} queued. */
  get skippedFrameCount(): number {
    return this.skippedFrames;
  }

  get latestStats(): FrameStats | null {
    return this.lastStats;
  }

  resourceStats(): GpuResourceStats {
    return this.renderer.resourceStats();
  }

  get gpuTimingAvailable(): boolean {
    return this.renderer.gpuTimingAvailable;
  }

  get renderSize(): { width: number; height: number } {
    return this.renderer.renderSize;
  }

  get deviceLost(): boolean {
    return this.renderer.isLost;
  }

  /** Stop the loop and release every GPU resource. The engine cannot be used afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.renderer.dispose();
    this.onFrame.clear();
    this.onSceneChanged.clear();
    this.onSelectionChanged.clear();
    this.onDeviceLost.clear();
    this._scene = null;
  }
}

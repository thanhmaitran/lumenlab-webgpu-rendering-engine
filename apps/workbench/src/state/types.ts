import type { BenchmarkFile, BenchmarkProgress } from "@lumenlab/benchmark";
import type {
  AdapterReport,
  DiagnosticEntry,
  FrameStats,
  FrameTimingSummary,
  GpuResourceStats,
  LightDefinition,
  MaterialParams,
  RenderSettings,
} from "@lumenlab/engine";

export type EngineStatus =
  | { kind: "initializing" }
  | { kind: "ready" }
  | { kind: "unsupported"; code: string; reason: string }
  | { kind: "lost"; reason: string };

export interface ObjectSummary {
  id: string;
  name: string;
  geometry: string;
  triangles: number;
}

export interface LightSummary {
  id: string;
  name: string;
  type: LightDefinition["type"];
}

export interface ObjectDetail {
  id: string;
  name: string;
  geometry: string;
  triangles: number;
  position: [number, number, number];
  rotationDegrees: [number, number, number];
  scale: [number, number, number];
  material: MaterialParams;
  castShadow: boolean;
  receiveShadow: boolean;
}

export interface CameraInfo {
  distance: number;
  azimuthDegrees: number;
  polarDegrees: number;
  fovYDegrees: number;
}

export type LabPhase = "idle" | "running" | "done" | "aborted" | "error";

export interface LabState {
  phase: LabPhase;
  progress: BenchmarkProgress | null;
  /** Number of frames completed / total in the whole selection, for the progress bar. */
  completedFrames: number;
  totalFrames: number;
  file: BenchmarkFile | null;
  error: string | null;
}

export type SelectionKind = "object" | "light" | "camera" | null;

export interface WorkbenchState {
  status: EngineStatus;
  adapter: AdapterReport | null;
  gpuTiming: boolean;
  presetId: string;
  sceneName: string;
  objectCount: number;
  triangleCount: number;
  objects: ObjectSummary[];
  lights: LightSummary[];
  selectionKind: SelectionKind;
  selectedObject: ObjectDetail | null;
  selectedLight: LightDefinition | null;
  camera: CameraInfo | null;
  settings: RenderSettings;
  stats: FrameStats | null;
  timing: FrameTimingSummary | null;
  resources: GpuResourceStats | null;
  renderSize: { width: number; height: number } | null;
  log: DiagnosticEntry[];
  lab: LabState;
}

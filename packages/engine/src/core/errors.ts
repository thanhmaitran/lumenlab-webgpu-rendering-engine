export type EngineErrorCode =
  | "webgpu-unavailable"
  | "adapter-unavailable"
  | "device-request-failed"
  | "canvas-context-failed"
  | "shader-compilation-failed"
  | "pipeline-creation-failed"
  | "device-lost"
  | "invalid-argument";

/** Error with a machine-readable code so the UI can show a precise message. */
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EngineError";
  }
}

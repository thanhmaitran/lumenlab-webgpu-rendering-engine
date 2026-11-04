/**
 * CPU-side mirrors of the uniform structs in shaders/mesh.wgsl. Offsets are in 32-bit floats.
 * Unit tests assert these against the shader source so the two cannot silently drift apart.
 */
export const FRAME_LAYOUT = {
  viewProj: 0,
  lightViewProj: 16,
  cameraPos: 32,
  dirLightDir: 36,
  dirLightColor: 40,
  ambient: 44,
  background: 48,
  params: 52,
  depthRange: 56,
  points: 60,
  pointStride: 8,
  maxPoints: 4,
  totalFloats: 92,
} as const;

export const INSTANCE_LAYOUT = {
  model: 0,
  normalMat: 16,
  baseColorRoughness: 32,
  emissiveMetalness: 36,
  flags: 40,
  totalFloats: 44,
} as const;

export const FRAME_BYTES = FRAME_LAYOUT.totalFloats * 4;
export const INSTANCE_BYTES = INSTANCE_LAYOUT.totalFloats * 4;

export type RenderMode = "lit" | "wireframe" | "normals" | "depth" | "shadow";

export const RENDER_MODE_INDEX: Record<RenderMode, number> = {
  lit: 0,
  normals: 1,
  depth: 2,
  wireframe: 3,
  shadow: 4,
};

export function alignUp(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

/** sRGB OETF for a single linear channel; used to encode the clear colour. */
export function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

import { clamp } from "../math/scalar";

export interface MaterialParams {
  /** Linear RGB, each channel in [0, 1]. */
  baseColor: [number, number, number];
  /** 0 = mirror-smooth, 1 = fully rough. */
  roughness: number;
  /** 0 = dielectric, 1 = metal. */
  metalness: number;
  /** Linear RGB emission added after lighting. */
  emissive: [number, number, number];
  /** 0 = plain base colour, 1 = base colour fully modulated by the procedural checker texture. */
  checker: number;
  /** UV tiling factor applied when sampling the checker texture (1..32). */
  uvScale: number;
}

export const DEFAULT_MATERIAL: MaterialParams = {
  baseColor: [0.8, 0.8, 0.8],
  roughness: 0.5,
  metalness: 0,
  emissive: [0, 0, 0],
  checker: 0,
  uvScale: 4,
};

/** Clamp and complete a partial material so it is always safe to upload to the GPU. */
export function sanitizeMaterial(
  partial: Partial<MaterialParams>,
  base: MaterialParams = DEFAULT_MATERIAL,
): MaterialParams {
  const color = (c: [number, number, number] | undefined, fallback: [number, number, number]) =>
    (c ?? fallback).map((v) => clamp(Number.isFinite(v) ? v : 0, 0, 1)) as [number, number, number];
  const scalar = (v: number | undefined, fallback: number) =>
    clamp(Number.isFinite(v as number) ? (v as number) : fallback, 0, 1);
  return {
    baseColor: color(partial.baseColor, base.baseColor),
    roughness: scalar(partial.roughness, base.roughness),
    metalness: scalar(partial.metalness, base.metalness),
    emissive: color(partial.emissive, base.emissive),
    checker: scalar(partial.checker, base.checker),
    uvScale: clamp(
      Number.isFinite(partial.uvScale as number) ? (partial.uvScale as number) : base.uvScale,
      1,
      32,
    ),
  };
}

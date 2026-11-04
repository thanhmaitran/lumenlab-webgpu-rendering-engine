import { clamp } from "../math/scalar";
import type { RenderMode } from "./layout";

export interface RenderSettings {
  mode: RenderMode;
  shadowsEnabled: boolean;
  /** Multiplier on the canvas backing-store resolution, 0.25 .. 2. */
  renderScale: number;
  /** Shadow map resolution (texels per side). */
  shadowMapSize: 512 | 1024 | 2048 | 4096;
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  mode: "lit",
  shadowsEnabled: true,
  renderScale: 1,
  shadowMapSize: 2048,
};

const SHADOW_SIZES = [512, 1024, 2048, 4096] as const;

export function sanitizeRenderSettings(
  partial: Partial<RenderSettings>,
  base: RenderSettings = DEFAULT_RENDER_SETTINGS,
): RenderSettings {
  const size = partial.shadowMapSize ?? base.shadowMapSize;
  return {
    mode: partial.mode ?? base.mode,
    shadowsEnabled: partial.shadowsEnabled ?? base.shadowsEnabled,
    renderScale: clamp(
      Number.isFinite(partial.renderScale as number)
        ? (partial.renderScale as number)
        : base.renderScale,
      0.25,
      2,
    ),
    shadowMapSize: (SHADOW_SIZES as readonly number[]).includes(size) ? size : base.shadowMapSize,
  };
}

/** Backing-store size for a canvas of the given CSS size. Never returns less than 1 pixel. */
export function computeRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  renderScale: number,
  maxDimension = 8192,
): { width: number; height: number } {
  const factor = Math.max(0.01, devicePixelRatio) * renderScale;
  return {
    width: Math.min(maxDimension, Math.max(1, Math.floor(cssWidth * factor))),
    height: Math.min(maxDimension, Math.max(1, Math.floor(cssHeight * factor))),
  };
}

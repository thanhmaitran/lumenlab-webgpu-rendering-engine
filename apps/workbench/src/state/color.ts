/** sRGB <-> linear conversions. The engine stores material colours as linear RGB; <input type="color"> is sRGB. */

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

export function hexToLinearRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = (shift: number) => srgbToLinear(((n >> shift) & 255) / 255);
  return [ch(16), ch(8), ch(0)];
}

export function linearRgbToHex(rgb: readonly [number, number, number]): string {
  const part = (c: number) =>
    Math.round(linearToSrgb(c) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

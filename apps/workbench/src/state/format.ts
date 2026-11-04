export const EM_DASH = "—";

/** Milliseconds with fixed digits; null / NaN render as an em dash instead of a fake number. */
export function formatMs(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? EM_DASH
    : value.toFixed(digits);
}

export function formatInt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? EM_DASH
    : Math.round(value).toLocaleString("en-US");
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return EM_DASH;
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Parse a numeric text field. Returns null for empty or non-finite input. */
export function parseNumber(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Trim floating-point noise for display in an input (3 decimals max). */
export function displayNumber(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

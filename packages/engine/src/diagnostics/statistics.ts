/** Basic descriptive statistics used by frame-time tracking and benchmarks. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stddev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1)); // sample standard deviation
}

/** Linear-interpolated percentile, p in [0, 100]. Returns NaN for an empty sample. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, p));
  const rank = (clamped / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export interface SampleSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  stddev: number;
}

export function summarize(values: readonly number[]): SampleSummary {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : NaN,
    max: values.length ? Math.max(...values) : NaN,
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 95),
    stddev: stddev(values),
  };
}

/** Fixed-capacity ring buffer of numbers, used for rolling frame-time windows. */
export class RollingWindow {
  private readonly data: number[] = [];
  private next = 0;

  constructor(readonly capacity: number) {
    if (!(capacity >= 1)) throw new RangeError("capacity must be >= 1");
  }

  push(value: number): void {
    if (this.data.length < this.capacity) this.data.push(value);
    else {
      this.data[this.next] = value;
      this.next = (this.next + 1) % this.capacity;
    }
  }

  values(): number[] {
    return [...this.data];
  }

  get length(): number {
    return this.data.length;
  }

  clear(): void {
    this.data.length = 0;
    this.next = 0;
  }
}

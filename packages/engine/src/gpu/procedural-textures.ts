export interface ImageLevel {
  width: number;
  height: number;
  /** RGBA8 pixels */
  data: Uint8Array;
}

/** Generate a square checkerboard (RGBA8). `cells` is the number of squares per side. */
export function createCheckerImage(size = 256, cells = 8, a = 235, b = 60): ImageLevel {
  if (size < 2 || cells < 1) throw new RangeError("invalid checker parameters");
  const data = new Uint8Array(size * size * 4);
  const cell = size / cells;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? a : b;
      const o = (y * size + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}

/** Box-filter mip chain down to 1x1. Averaging is done on raw values (adequate for a greyscale checker). */
export function generateMipChain(base: ImageLevel): ImageLevel[] {
  const levels: ImageLevel[] = [base];
  let prev = base;
  while (prev.width > 1 || prev.height > 1) {
    const w = Math.max(1, prev.width >> 1);
    const h = Math.max(1, prev.height >> 1);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          let n = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const sx = Math.min(prev.width - 1, x * 2 + dx);
              const sy = Math.min(prev.height - 1, y * 2 + dy);
              sum += prev.data[(sy * prev.width + sx) * 4 + c];
              n++;
            }
          }
          data[(y * w + x) * 4 + c] = Math.round(sum / n);
        }
      }
    }
    prev = { width: w, height: h, data };
    levels.push(prev);
  }
  return levels;
}

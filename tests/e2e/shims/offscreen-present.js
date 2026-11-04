/**
 * Test-environment shim — NOT part of the product.
 *
 * Some headless/software-GPU environments (for example SwiftShader in a container) can run WebGPU
 * compute and render passes but destroy the device as soon as a frame is *presented* to a canvas.
 * This shim keeps the real renderer, real shaders and real GPU execution, but redirects the swap
 * chain texture to an offscreen texture, reads the pixels back and paints them onto a 2D overlay
 * canvas stacked above the WebGPU canvas. Screenshots and pixel assertions therefore see genuine
 * GPU output without depending on the browser's presentation path.
 *
 * Enabled only when the test runner sets PW_OFFSCREEN_PRESENT=1.
 */
(() => {
  if (!("GPUCanvasContext" in window)) return;
  const states = new WeakMap(); // GPUCanvasContext -> { device, format, texture, overlay }
  const contexts = new Set();

  const origConfigure = GPUCanvasContext.prototype.configure;
  const origUnconfigure = GPUCanvasContext.prototype.unconfigure;
  const origGetCurrent = GPUCanvasContext.prototype.getCurrentTexture;

  GPUCanvasContext.prototype.configure = function (config) {
    // Do NOT configure the real swap chain: that is what kills the device here.
    states.set(this, {
      device: config.device,
      format: config.format,
      texture: null,
      overlay: null,
    });
    contexts.add(this);
    void origConfigure; // keep reference for clarity
  };

  GPUCanvasContext.prototype.unconfigure = function () {
    const st = states.get(this);
    st?.texture?.destroy();
    st?.overlay?.remove();
    states.delete(this);
    contexts.delete(this);
    void origUnconfigure;
  };

  GPUCanvasContext.prototype.getCurrentTexture = function () {
    const st = states.get(this);
    if (!st) return origGetCurrent.call(this);
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    if (!st.texture || st.texture.width !== w || st.texture.height !== h) {
      st.texture?.destroy();
      st.texture = st.device.createTexture({
        label: "offscreen-swapchain",
        size: [w, h],
        format: st.format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.TEXTURE_BINDING,
      });
    }
    return st.texture;
  };

  async function readback(ctx) {
    const st = states.get(ctx);
    if (!st || !st.texture) return null;
    const tex = st.texture;
    const { width, height } = tex;
    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const buffer = st.device.createBuffer({
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = st.device.createCommandEncoder();
    enc.copyTextureToBuffer({ texture: tex }, { buffer, bytesPerRow }, [width, height]);
    st.device.queue.submit([enc.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8ClampedArray(width * height * 4);
    const bgra = st.format.startsWith("bgra");
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const s = y * bytesPerRow + x * 4;
        const d = (y * width + x) * 4;
        out[d] = bgra ? src[s + 2] : src[s];
        out[d + 1] = src[s + 1];
        out[d + 2] = bgra ? src[s] : src[s + 2];
        out[d + 3] = 255;
      }
    }
    buffer.unmap();
    buffer.destroy();
    return { width, height, data: out };
  }

  async function paintOverlay(ctx) {
    const frame = await readback(ctx);
    const st = states.get(ctx);
    if (!frame || !st) return;
    const canvas = ctx.canvas;
    if (!st.overlay) {
      const o = document.createElement("canvas");
      o.setAttribute("data-testid", "offscreen-overlay");
      o.style.cssText = "position:absolute;pointer-events:none;image-rendering:auto;";
      canvas.parentElement?.appendChild(o);
      st.overlay = o;
    }
    const o = st.overlay;
    o.width = frame.width;
    o.height = frame.height;
    o.style.left = canvas.offsetLeft + "px";
    o.style.top = canvas.offsetTop + "px";
    o.style.width = canvas.clientWidth + "px";
    o.style.height = canvas.clientHeight + "px";
    o.getContext("2d").putImageData(new ImageData(frame.data, frame.width, frame.height), 0, 0);
  }

  let inflight = null;
  window.__offscreenPresent = {
    /** Read the latest frame as RGBA bytes (for pixel assertions). */
    async capture() {
      for (const ctx of contexts) {
        const f = await readback(ctx);
        if (f) return { width: f.width, height: f.height, data: Array.from(f.data) };
      }
      return null;
    },
    async sync() {
      // If a paint is running, wait for it and then paint once more so the caller sees a frame
      // rendered after the call, not one that was already in flight.
      if (inflight) await inflight;
      inflight = (async () => {
        for (const ctx of contexts) await paintOverlay(ctx);
      })();
      try {
        await inflight;
      } finally {
        inflight = null;
      }
    },
  };
  // Benchmarks set this flag so the periodic read-back does not add GPU work during measurement.
  if (!window.__offscreenPresentNoAuto)
    setInterval(() => void window.__offscreenPresent.sync(), 200);
})();

# Rendering pipeline

All shading lives in `packages/engine/shaders/mesh.wgsl`. The CPU-side mirrors of its uniform
structs are in `packages/engine/src/renderer/layout.ts`; a unit test parses the shader and fails
when the two drift apart.

## Conventions

| Topic             | Convention                                                                      |
| ----------------- | ------------------------------------------------------------------------------- |
| Handedness        | Right-handed world and view space, +Y up, camera looks down −Z in view space    |
| Matrices          | Column-major `Float32Array(16)`, `v' = M · v`                                   |
| Clip-space depth  | `[0, 1]` (WebGPU), reversed-Z is **not** used                                   |
| Winding / culling | Counter-clockwise front faces, back-face culling                                |
| Colour            | Lighting in linear space; Narkowicz ACES tone map; sRGB encode in the shader    |
| Vertex format     | `position (vec3) · normal (vec3) · uv (vec2)`, 32-byte stride, `uint32` indices |

## Passes

1. **Shadow pass** (only when shadows are enabled and the directional light casts them)
   - Renders every shadow-casting object depth-only into a `depth32float` map (default 2048²).
   - The orthographic light matrix is fitted to the scene's bounding sphere and snapped to texel
     increments so shadows do not shimmer.
2. **Main pass**, one of:
   - `lit` — physically-inspired shading (below) with shadow lookup.
   - `normals` — world-space normals remapped to RGB. Written without gamma, so what you see is the
     data.
   - `depth` — linear view-space depth normalised by the camera's near/far.
   - `shadow` — visibility term of the shadow map as a colour ramp (shadowed = blue).
   - `wireframe` — WebGPU has no polygon-line mode, so triangle edges are drawn as a `line-list`
     from a unique-edge index buffer built on demand, over a background-coloured depth-writing fill
     so hidden edges are removed.

Diagnostic modes are produced by the real shader paths, not by recolouring the lit image.

## Shading model (`lit`)

- Base colour × `ambient`, plus per-light Cook–Torrance terms:
  GGX normal distribution, Smith–Schlick geometry (`k = (r+1)²/8`), Schlick Fresnel with
  `F0 = mix(0.04, albedo, metalness)`, and a Lambert diffuse weighted by `(1 − F)(1 − metalness)`.
- One directional light (optionally shadowed) and up to four point lights with a smooth range
  window `(1 − (d/r)⁴)² / (d² + 1)`.
- Emissive is added after lighting. Selection adds a rim highlight (editor aid only).
- Roughness is clamped to `[0.04, 1]` to avoid a degenerate specular lobe.
- Optional procedural checker albedo (mip-mapped, 4× anisotropic) blended by `checker`.

## Shadow filtering

3×3 percentage-closer filtering with a hardware comparison sampler, a constant depth bias and a
**normal-offset** that grows with the surface's angle to the light. Both are needed: constant bias
alone either leaves acne on grazing surfaces or detaches the shadow from its caster.

## Per-frame and per-object data

- `Frame` uniform (368 bytes): view-projection, light view-projection, camera, light, ambient,
  background, mode / point-light count / shadow texel size / bias, depth range, four point lights.
- `Instance` uniform per object (176 bytes, padded to the device's
  `minUniformBufferOffsetAlignment`), stored in **one** large buffer and addressed with dynamic
  offsets, so a scene of N objects costs one buffer and N draw calls, not N buffers.
- Instance data is re-uploaded only when the scene epoch, the selection or the object count changed.

## Render scale and resize

The canvas backing store is `css size × devicePixelRatio × renderScale`, clamped to the device's
`maxTextureDimension2D`. Whenever it changes the depth texture is destroyed and recreated at the
same size (a depth buffer that does not match the colour target is a validation error). Benchmarks
pin the size with `setFixedRenderSize` so the pixel count is identical in every run.

## Frame pacing and back-pressure

The loop tracks submissions with `queue.onSubmittedWorkDone()` and skips an animation frame when two
frames are already in flight. Without this, an adapter that needs 100 ms per frame is fed a new
frame every 16 ms and the queue — and therefore input latency — grows without bound. Skipped
frames are counted (`Engine.skippedFrameCount`).

## Timing

- **CPU time**: encode + submit, from `performance.now()`.
- **Frame time (loop)**: median/p95 of `requestAnimationFrame` intervals — includes vsync pacing.
- **GPU time**: sum of timestamp-query pass durations when the adapter exposes `timestamp-query`;
  otherwise reported as `n/a`. It is never estimated.
- **Benchmark frame time**: CPU submit → `onSubmittedWorkDone`, independent of display refresh.

## Known limitations

- No MSAA or post-process anti-aliasing; edges alias at low resolutions.
- One shadow-casting directional light; point lights do not cast shadows.
- Shadow map covers the whole scene bounding sphere (no cascades), so large scenes lose texel density.
- No image-based lighting, no transparency, no skinned or imported meshes (geometry is procedural).
- Picking is CPU ray-casting against bounding volumes and triangles, not GPU ID-buffer picking.

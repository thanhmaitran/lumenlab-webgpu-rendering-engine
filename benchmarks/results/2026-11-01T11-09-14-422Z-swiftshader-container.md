# LumenLab benchmark report

Generated: 2026-11-01T11:09:14.422Z  
Engine version: 0.1.0  
Schema version: 1

## Environment

- Browser: Chrome (headless) 153
- Platform: Linux x86_64
- GPU adapter: google swiftshader (fallback adapter)
- Device pixel ratio: 1
- Logical CPU cores: 2
- GPU timestamp queries: supported

> **Warning:** these results were produced by a software/fallback adapter. They validate the
> measurement pipeline but must not be read as hardware GPU performance.

## Results

| Scenario | Runs | Resolution | Objects | Triangles | Draw calls | Frame time median (ms) | Run-to-run range (ms) | Worst p95 (ms) | CPU median (ms) | GPU median (ms) |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| baseline-small | 3 | 1280x720 | 11 | 1490 | 11 | 50.30 | 48.05 – 52.50 | 77.61 | 0.30 | 48.11 |
| geometry-medium | 3 | 1280x720 | 101 | 16250 | 101 | 94.85 | 82.30 – 105.55 | 127.54 | 0.40 | 91.40 |
| geometry-large | 3 | 1280x720 | 401 | 65450 | 401 | 154.80 | 147.75 – 168.45 | 220.57 | 0.85 | 151.98 |
| resolution-low | 3 | 640x360 | 101 | 16250 | 101 | 42.00 | 40.55 – 46.10 | 64.89 | 0.40 | 39.58 |
| resolution-high | 3 | 1920x1080 | 101 | 16250 | 101 | 156.75 | 142.00 – 165.30 | 221.50 | 0.40 | 155.61 |
| shadow-on | 3 | 1280x720 | 101 | 16250 | 101 | 84.10 | 78.40 – 91.35 | 117.48 | 0.40 | 81.81 |
| shadow-off | 3 | 1280x720 | 101 | 16250 | 101 | 46.95 | 43.15 – 48.05 | 72.12 | 0.30 | 44.07 |

## Controlled comparisons

| Comparison | Baseline | Candidate | Δ (ms) | Ratio |
| --- | --- | --- | ---: | ---: |
| Shadow pass cost (same scene, camera, resolution) | shadow-off (46.95 ms) | shadow-on (84.10 ms) | 37.15 | 1.79× |
| Resolution sensitivity (same scene) | resolution-low (42.00 ms) | resolution-high (156.75 ms) | 114.75 | 3.73× |
| Object-count scaling | geometry-medium (94.85 ms) | geometry-large (154.80 ms) | 59.95 | 1.63× |

## How to read this

- **Frame time** is CPU submit until the GPU queue reports the work complete. It does not depend on display refresh pacing, but it includes driver and queue latency.
- **CPU time** is encode + submit only.
- **GPU time** comes from timestamp queries and is `n/a` when the adapter or browser does not provide them.
- Compare numbers only within one environment. The scenarios vary one factor at a time; see `variedFactor` in the scenario definitions.

## Scenario definitions

- `baseline-small` – A small scene (10 objects) to establish the fixed cost of a frame. (varies: object count (reference))
- `geometry-medium` – 100 objects: evaluates how cost scales with draw calls and triangles. (varies: object count)
- `geometry-large` – 400 objects: looks for the point where per-draw overhead starts to dominate. (varies: object count)
- `resolution-low` – Same 100-object scene at 640x360 to isolate the per-pixel workload. (varies: render resolution)
- `resolution-high` – Same 100-object scene at 1920x1080 to measure sensitivity to pixel count. (varies: render resolution)
- `shadow-on` – 100 objects at 1280x720 with the shadow pass enabled. (varies: shadow mapping)
- `shadow-off` – Identical to shadow-on but with the shadow pass disabled, to estimate its cost. (varies: shadow mapping)

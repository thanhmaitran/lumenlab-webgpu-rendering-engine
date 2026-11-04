import { describe, expect, it } from "vitest";
import {
  Vector3,
  computeDirectionalShadowMatrix,
  normalizedLightDirection,
  type DirectionalLightDefinition,
} from "../src";

describe("directional shadow volume", () => {
  const dir = new Vector3(-0.5, -1, -0.6).normalize();
  const center = new Vector3(1, 0.5, -2);
  const radius = 6;
  const { viewProjection } = computeDirectionalShadowMatrix(dir, center, radius, 2048);

  it("fits the whole bounding sphere inside the shadow map, with depth in [0, 1]", () => {
    const samples: Vector3[] = [];
    for (const sx of [-1, 0, 1])
      for (const sy of [-1, 0, 1])
        for (const sz of [-1, 0, 1]) {
          const d = new Vector3(sx, sy, sz).normalize();
          samples.push(center.add(d.scale(radius * 0.999)));
        }
    samples.push(center);
    for (const p of samples) {
      const q = viewProjection.transformPoint(p);
      // Texel snapping may shift the volume by < 1 texel; allow a tiny margin.
      expect(Math.abs(q.x)).toBeLessThanOrEqual(1.002);
      expect(Math.abs(q.y)).toBeLessThanOrEqual(1.002);
      expect(q.z).toBeGreaterThanOrEqual(0);
      expect(q.z).toBeLessThanOrEqual(1);
    }
  });

  it("places points closer to the light at smaller depth", () => {
    const near = viewProjection.transformPoint(center.sub(dir.scale(radius * 0.5)));
    const far = viewProjection.transformPoint(center.add(dir.scale(radius * 0.5)));
    expect(near.z).toBeLessThan(far.z);
  });

  it("is finite for a straight-down light (up vector parallel to direction)", () => {
    const down = computeDirectionalShadowMatrix(new Vector3(0, -1, 0), Vector3.ZERO, 5);
    expect(down.viewProjection.isFinite()).toBe(true);
  });

  it("survives a zero radius", () => {
    expect(computeDirectionalShadowMatrix(dir, center, 0).viewProjection.isFinite()).toBe(true);
  });
});

describe("normalizedLightDirection", () => {
  it("normalises and falls back to straight down for a zero vector", () => {
    const base: Omit<DirectionalLightDefinition, "direction"> = {
      type: "directional",
      id: "l",
      color: [1, 1, 1],
      intensity: 1,
      castShadow: true,
    };
    expect(normalizedLightDirection({ ...base, direction: [0, -10, 0] }).toArray()).toEqual([
      0, -1, 0,
    ]);
    expect(normalizedLightDirection({ ...base, direction: [0, 0, 0] }).toArray()).toEqual([
      0, -1, 0,
    ]);
  });
});

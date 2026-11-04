import { describe, expect, it } from "vitest";
import { SCENARIOS, buildSceneDefinition, getScenario, resolveScene } from "../src";

describe("scenario matrix", () => {
  it("has unique ids and sane parameters", () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENARIOS) {
      expect(s.warmupFrames).toBeGreaterThanOrEqual(1);
      expect(s.measuredFrames).toBeGreaterThanOrEqual(30);
      expect(s.runs).toBeGreaterThanOrEqual(3);
      expect(s.resolution.width).toBeGreaterThan(0);
      expect(s.resolution.height).toBeGreaterThan(0);
    }
  });

  it("covers every scenario named in the project plan", () => {
    for (const id of [
      "baseline-small",
      "geometry-medium",
      "geometry-large",
      "resolution-low",
      "resolution-high",
      "shadow-on",
      "shadow-off",
    ]) {
      expect(() => getScenario(id)).not.toThrow();
    }
    expect(() => getScenario("nope")).toThrow(/Unknown benchmark scenario/);
  });

  it("is deterministic: the same reference always yields the same scene", () => {
    for (const s of SCENARIOS) {
      expect(buildSceneDefinition(s.scene)).toEqual(buildSceneDefinition(s.scene));
    }
  });

  it("pins the workload so silent changes fail the build", () => {
    // object count includes the ground plane
    const counts = Object.fromEntries(
      SCENARIOS.map((s) => {
        const r = resolveScene(s.scene);
        return [s.id, [r.objectCount, r.drawCalls]];
      }),
    );
    expect(counts).toEqual({
      "baseline-small": [11, 11],
      "geometry-medium": [101, 101],
      "geometry-large": [401, 401],
      "resolution-low": [101, 101],
      "resolution-high": [101, 101],
      "shadow-on": [101, 101],
      "shadow-off": [101, 101],
    });
    expect(resolveScene(getScenario("geometry-medium").scene).triangleCount).toBe(
      resolveScene(getScenario("shadow-on").scene).triangleCount,
    );
  });

  it("varies exactly one factor within comparison pairs", () => {
    const strip = (id: string, omit: string[]) => {
      const { id: _id, name: _n, description: _d, variedFactor: _v, ...rest } = getScenario(id);
      const copy: Record<string, unknown> = { ...rest };
      for (const key of omit) delete copy[key];
      return copy;
    };
    expect(strip("resolution-low", ["resolution"])).toEqual(
      strip("resolution-high", ["resolution"]),
    );
    expect(strip("shadow-on", ["shadowsEnabled"])).toEqual(strip("shadow-off", ["shadowsEnabled"]));
    expect(strip("geometry-medium", ["scene"])).toEqual(strip("geometry-large", ["scene"]));
  });
});

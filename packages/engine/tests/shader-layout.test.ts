import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FRAME_BYTES,
  FRAME_LAYOUT,
  INSTANCE_BYTES,
  INSTANCE_LAYOUT,
  RENDER_MODE_INDEX,
  alignUp,
  linearToSrgb,
} from "../src";

const wgsl = readFileSync(new URL("../shaders/mesh.wgsl", import.meta.url), "utf8");

/** Extract `name: type` fields of a WGSL struct, in declaration order. */
function structFields(name: string): Array<{ name: string; type: string }> {
  const match = new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`, "m").exec(wgsl);
  if (!match) throw new Error(`struct ${name} not found`);
  return (
    match[1]
      .replace(/\/\/.*$/gm, "")
      // Split on newlines/semicolons and on commas that start a new `name:` field (not `array<T, N>`).
      .split(/[;\n]|,(?=\s*\w+\s*:)/)
      .map((l) => l.trim().replace(/,$/, ""))
      .filter(Boolean)
      .map((l) => {
        const [n, ...t] = l.split(":");
        return { name: n.trim(), type: t.join(":").trim() };
      })
  );
}

/** std140-ish size in floats for the handful of types used in uniform blocks. */
function floatsOf(type: string): number {
  if (type === "mat4x4<f32>") return 16;
  if (type === "vec4<f32>") return 4;
  const arr = /^array<(\w+),\s*(\d+)>$/.exec(type);
  if (arr) {
    const elem = structFields(arr[1]).reduce((s, f) => s + floatsOf(f.type), 0);
    return elem * Number(arr[2]);
  }
  throw new Error(`unsupported uniform type ${type}`);
}

function offsets(struct: string): Record<string, number> {
  let offset = 0;
  const out: Record<string, number> = {};
  for (const f of structFields(struct)) {
    out[f.name] = offset;
    offset += floatsOf(f.type);
  }
  out.__total = offset;
  return out;
}

describe("WGSL <-> TypeScript uniform layout", () => {
  it("Frame struct matches FRAME_LAYOUT field by field", () => {
    const o = offsets("Frame");
    expect(o.viewProj).toBe(FRAME_LAYOUT.viewProj);
    expect(o.lightViewProj).toBe(FRAME_LAYOUT.lightViewProj);
    expect(o.cameraPos).toBe(FRAME_LAYOUT.cameraPos);
    expect(o.dirLightDir).toBe(FRAME_LAYOUT.dirLightDir);
    expect(o.dirLightColor).toBe(FRAME_LAYOUT.dirLightColor);
    expect(o.ambient).toBe(FRAME_LAYOUT.ambient);
    expect(o.background).toBe(FRAME_LAYOUT.background);
    expect(o.params).toBe(FRAME_LAYOUT.params);
    expect(o.depthRange).toBe(FRAME_LAYOUT.depthRange);
    expect(o.points).toBe(FRAME_LAYOUT.points);
    expect(o.__total).toBe(FRAME_LAYOUT.totalFloats);
    expect(FRAME_BYTES).toBe(FRAME_LAYOUT.totalFloats * 4);
  });

  it("Instance struct matches INSTANCE_LAYOUT field by field", () => {
    const o = offsets("Instance");
    expect(o.model).toBe(INSTANCE_LAYOUT.model);
    expect(o.normalMat).toBe(INSTANCE_LAYOUT.normalMat);
    expect(o.baseColorRoughness).toBe(INSTANCE_LAYOUT.baseColorRoughness);
    expect(o.emissiveMetalness).toBe(INSTANCE_LAYOUT.emissiveMetalness);
    expect(o.flags).toBe(INSTANCE_LAYOUT.flags);
    expect(o.__total).toBe(INSTANCE_LAYOUT.totalFloats);
    expect(INSTANCE_BYTES).toBe(INSTANCE_LAYOUT.totalFloats * 4);
  });

  it("PointLight stride and array length match the TypeScript constants", () => {
    expect(floatsOf("PointLight".length ? "vec4<f32>" : "")).toBe(4);
    const pl = structFields("PointLight").reduce((s, f) => s + floatsOf(f.type), 0);
    expect(pl).toBe(FRAME_LAYOUT.pointStride);
    expect(wgsl).toContain(`array<PointLight, ${FRAME_LAYOUT.maxPoints}>`);
    expect(wgsl).toContain(`i < ${FRAME_LAYOUT.maxPoints}`);
  });

  it("uniform block sizes are multiples of 16 bytes", () => {
    expect(FRAME_BYTES % 16).toBe(0);
    expect(INSTANCE_BYTES % 16).toBe(0);
  });

  it("declares every entry point the renderer requests", () => {
    for (const entry of ["vs_main", "vs_shadow", "fs_main", "fs_wire_fill", "fs_wire_line"]) {
      expect(wgsl).toMatch(new RegExp(`fn\\s+${entry}\\s*\\(`));
    }
  });

  it("declares the bindings used by the bind group layouts", () => {
    expect(wgsl).toMatch(/@group\(0\)\s*@binding\(0\)\s*var<uniform>\s*fr/);
    expect(wgsl).toMatch(/@group\(0\)\s*@binding\(1\)\s*var\s+shadowMap:\s*texture_depth_2d/);
    expect(wgsl).toMatch(/@group\(0\)\s*@binding\(2\)\s*var\s+shadowSampler:\s*sampler_comparison/);
    expect(wgsl).toMatch(/@group\(0\)\s*@binding\(3\)\s*var\s+albedoTex:\s*texture_2d<f32>/);
    expect(wgsl).toMatch(/@group\(0\)\s*@binding\(4\)\s*var\s+albedoSampler:\s*sampler/);
    expect(wgsl).toMatch(/@group\(1\)\s*@binding\(0\)\s*var<uniform>\s*inst/);
  });

  it("the shadow vertex entry point does not reference the shadow map it renders into", () => {
    const body = /fn vs_shadow[\s\S]*?\n}/.exec(wgsl)![0];
    expect(body).not.toMatch(/shadowMap|shadowSampler|albedo/);
  });

  it("render mode indices match the shader's mode checks", () => {
    expect(RENDER_MODE_INDEX).toEqual({ lit: 0, normals: 1, depth: 2, wireframe: 3, shadow: 4 });
    expect(wgsl).toMatch(/mode == 1\)/); // normals
    expect(wgsl).toMatch(/mode == 2\)/); // depth
    expect(wgsl).toMatch(/mode == 4\)/); // shadow view
  });

  it("uses textureSampleCompareLevel (legal inside non-uniform control flow)", () => {
    expect(wgsl).toContain("textureSampleCompareLevel");
    expect(wgsl).not.toMatch(/textureSampleCompare\(/);
  });
});

describe("helpers", () => {
  it("alignUp rounds to the next multiple", () => {
    expect(alignUp(176, 256)).toBe(256);
    expect(alignUp(256, 256)).toBe(256);
    expect(alignUp(257, 256)).toBe(512);
  });

  it("linearToSrgb matches known values", () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1, 6);
    expect(linearToSrgb(0.2140411)).toBeCloseTo(0.5, 3);
    expect(linearToSrgb(-1)).toBe(0);
    expect(linearToSrgb(5)).toBeCloseTo(1, 6);
  });
});

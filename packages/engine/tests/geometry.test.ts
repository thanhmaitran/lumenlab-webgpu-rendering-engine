import { describe, expect, it } from "vitest";
import {
  VERTEX_FLOATS,
  Vector3,
  computeBounds,
  computeNormals,
  createCube,
  createPlane,
  createSphere,
  createTorus,
  createWireframeIndices,
  interleaveVertices,
  triangleCount,
  validateMesh,
  vertexCount,
  type MeshData,
} from "../src";

const MESHES: Array<[string, MeshData]> = [
  ["cube", createCube(2)],
  ["plane 1x1", createPlane(4, 4, 1, 1)],
  ["plane 5x3", createPlane(4, 2, 5, 3)],
  ["sphere default", createSphere(1)],
  ["sphere 3x2 (minimum)", createSphere(1, 3, 2)],
  ["sphere 12x6", createSphere(0.5, 12, 6)],
  ["torus default", createTorus()],
  ["torus 8x4", createTorus(1, 0.3, 8, 4)],
];

function vertex(mesh: MeshData, i: number): Vector3 {
  return new Vector3(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]);
}

function vertexNormal(mesh: MeshData, i: number): Vector3 {
  return new Vector3(mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]);
}

describe.each(MESHES)("procedural mesh: %s", (_name, mesh) => {
  it("passes structural validation", () => {
    const report = validateMesh(mesh);
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("has every index inside the vertex buffer", () => {
    const n = vertexCount(mesh);
    for (const index of mesh.indices) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(n);
    }
  });

  it("has unit-length normals and UVs in [0, 1]", () => {
    for (let i = 0; i < vertexCount(mesh); i++) {
      expect(vertexNormal(mesh, i).length()).toBeCloseTo(1, 4);
    }
    for (const uv of mesh.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-1e-6);
      expect(uv).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it("contains no degenerate (zero-area) triangles", () => {
    for (let t = 0; t < triangleCount(mesh); t++) {
      const a = vertex(mesh, mesh.indices[t * 3]);
      const b = vertex(mesh, mesh.indices[t * 3 + 1]);
      const c = vertex(mesh, mesh.indices[t * 3 + 2]);
      expect(b.sub(a).cross(c.sub(a)).length()).toBeGreaterThan(1e-9);
    }
  });

  it("winds counter-clockwise: geometric face normal agrees with the vertex normals", () => {
    for (let t = 0; t < triangleCount(mesh); t++) {
      const ia = mesh.indices[t * 3];
      const ib = mesh.indices[t * 3 + 1];
      const ic = mesh.indices[t * 3 + 2];
      const a = vertex(mesh, ia);
      const face = vertex(mesh, ib).sub(a).cross(vertex(mesh, ic).sub(a)).normalize();
      const average = vertexNormal(mesh, ia)
        .add(vertexNormal(mesh, ib))
        .add(vertexNormal(mesh, ic))
        .normalize();
      expect(face.dot(average)).toBeGreaterThan(0.2);
    }
  });
});

describe("closed primitives face outward", () => {
  it.each([
    ["cube", createCube(1), Vector3.ZERO],
    ["sphere", createSphere(0.5, 16, 8), Vector3.ZERO],
  ] as const)("%s: every face normal points away from the centre", (_name, mesh, centre) => {
    for (let t = 0; t < triangleCount(mesh); t++) {
      const a = vertex(mesh, mesh.indices[t * 3]);
      const b = vertex(mesh, mesh.indices[t * 3 + 1]);
      const c = vertex(mesh, mesh.indices[t * 3 + 2]);
      const face = b.sub(a).cross(c.sub(a)).normalize();
      const centroid = a
        .add(b)
        .add(c)
        .scale(1 / 3);
      expect(face.dot(centroid.sub(centre))).toBeGreaterThan(0);
    }
  });

  it("torus: face normals point away from the tube centre line", () => {
    const radius = 1;
    const mesh = createTorus(radius, 0.3, 12, 8);
    for (let t = 0; t < triangleCount(mesh); t++) {
      const a = vertex(mesh, mesh.indices[t * 3]);
      const b = vertex(mesh, mesh.indices[t * 3 + 1]);
      const c = vertex(mesh, mesh.indices[t * 3 + 2]);
      const face = b.sub(a).cross(c.sub(a)).normalize();
      const centroid = a
        .add(b)
        .add(c)
        .scale(1 / 3);
      const ringPoint = new Vector3(centroid.x, 0, centroid.z).normalize().scale(radius);
      expect(face.dot(centroid.sub(ringPoint))).toBeGreaterThan(0);
    }
  });
});

describe("primitive shapes and counts", () => {
  it("cube has 24 vertices (flat normals) and 12 triangles", () => {
    const cube = createCube(1);
    expect(vertexCount(cube)).toBe(24);
    expect(triangleCount(cube)).toBe(12);
  });

  it("cube bounds equal ± size / 2", () => {
    const { min, max } = computeBounds(createCube(3));
    expect(min.toArray()).toEqual([-1.5, -1.5, -1.5]);
    expect(max.toArray()).toEqual([1.5, 1.5, 1.5]);
  });

  it("plane lies in y = 0, faces +Y and is centred", () => {
    const plane = createPlane(6, 4, 3, 2);
    const { min, max } = computeBounds(plane);
    expect(min.toArray()).toEqual([-3, 0, -2]);
    expect(max.toArray()).toEqual([3, 0, 2]);
    expect(vertexCount(plane)).toBe((3 + 1) * (2 + 1));
    expect(triangleCount(plane)).toBe(3 * 2 * 2);
    for (let i = 0; i < vertexCount(plane); i++) {
      expect(vertexNormal(plane, i).toArray()).toEqual([0, 1, 0]);
    }
  });

  it("sphere vertices lie on the requested radius and bounds match", () => {
    const radius = 2.5;
    const sphere = createSphere(radius, 24, 12);
    for (let i = 0; i < vertexCount(sphere); i++) {
      expect(vertex(sphere, i).length()).toBeCloseTo(radius, 4);
    }
    const { min, max } = computeBounds(sphere);
    expect(max.y).toBeCloseTo(radius, 4);
    expect(min.y).toBeCloseTo(-radius, 4);
  });

  it("sphere omits the degenerate pole triangles", () => {
    const ws = 10;
    const hs = 6;
    // Each of the (hs - 2) middle rings has 2 triangles per segment; the two polar rings have 1.
    expect(triangleCount(createSphere(1, ws, hs))).toBe(ws * 2 * (hs - 2) + ws * 2);
  });

  it("clamps degenerate segment counts instead of producing broken meshes", () => {
    expect(validateMesh(createSphere(1, 0, 0)).valid).toBe(true);
    expect(validateMesh(createTorus(1, 0.2, 0, 0)).valid).toBe(true);
  });

  it("torus stays within its outer radius", () => {
    const { min, max } = computeBounds(createTorus(1, 0.25, 32, 16));
    expect(max.x).toBeLessThanOrEqual(1.25 + 1e-5);
    expect(min.x).toBeGreaterThanOrEqual(-1.25 - 1e-5);
    expect(max.y).toBeLessThanOrEqual(0.25 + 1e-5);
  });
});

describe("validateMesh catches broken data", () => {
  const good = (): MeshData => ({
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  });

  it("accepts a valid triangle", () => {
    expect(validateMesh(good()).valid).toBe(true);
  });

  it("rejects an index outside the vertex buffer", () => {
    const mesh = good();
    mesh.indices = new Uint32Array([0, 1, 3]);
    const report = validateMesh(mesh);
    expect(report.valid).toBe(false);
    expect(report.errors.join(" ")).toMatch(/out of range/);
  });

  it("rejects non-normalised normals", () => {
    const mesh = good();
    mesh.normals = new Float32Array([0, 0, 2, 0, 0, 1, 0, 0, 1]);
    expect(validateMesh(mesh).errors.join(" ")).toMatch(/not unit length/);
  });

  it("rejects mismatched attribute lengths and a ragged index list", () => {
    const mesh = good();
    mesh.uvs = new Float32Array([0, 0]);
    mesh.indices = new Uint32Array([0, 1]);
    const text = validateMesh(mesh).errors.join(" ");
    expect(text).toMatch(/uvs length/);
    expect(text).toMatch(/multiple of 3/);
  });

  it("rejects non-finite positions", () => {
    const mesh = good();
    mesh.positions[4] = Number.NaN;
    expect(validateMesh(mesh).errors.join(" ")).toMatch(/not finite/);
  });
});

describe("mesh utilities", () => {
  it("interleaves position, normal and uv in the documented order", () => {
    const mesh = createCube(1);
    const data = interleaveVertices(mesh);
    expect(data.length).toBe(vertexCount(mesh) * VERTEX_FLOATS);
    for (const i of [0, 7, 23]) {
      const o = i * VERTEX_FLOATS;
      expect([data[o], data[o + 1], data[o + 2]]).toEqual([
        ...mesh.positions.subarray(i * 3, i * 3 + 3),
      ]);
      expect([data[o + 3], data[o + 4], data[o + 5]]).toEqual([
        ...mesh.normals.subarray(i * 3, i * 3 + 3),
      ]);
      expect([data[o + 6], data[o + 7]]).toEqual([...mesh.uvs.subarray(i * 2, i * 2 + 2)]);
    }
  });

  it("builds a line list that contains every triangle edge exactly once", () => {
    const mesh = createCube(1);
    const lines = createWireframeIndices(mesh);
    expect(lines.length % 2).toBe(0);
    // Faces do not share vertices: each quad has 4 border edges + 1 diagonal = 5 edges, 6 faces.
    expect(lines.length / 2).toBe(30);
    const seen = new Set<string>();
    for (let i = 0; i < lines.length; i += 2) {
      const key = `${Math.min(lines[i], lines[i + 1])}-${Math.max(lines[i], lines[i + 1])}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("shares edges between neighbouring triangles on a connected mesh", () => {
    const plane = createPlane(1, 1, 2, 2); // 9 vertices, 8 triangles
    const edges = createWireframeIndices(plane).length / 2;
    // 3 rows x 2 horizontal + 2 columns x 3 vertical + 4 diagonals = 16, not 8 * 3 = 24.
    expect(edges).toBe(16);
  });

  it("computeNormals reproduces the analytic normal of a flat triangle", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = computeNormals(positions, new Uint32Array([0, 1, 2]));
    for (let i = 0; i < 3; i++) {
      expect([...normals.subarray(i * 3, i * 3 + 3)]).toEqual([0, 0, 1]);
    }
  });
});

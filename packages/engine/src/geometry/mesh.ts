import { Vector3 } from "../math/vector3";

/** CPU-side indexed triangle mesh. All arrays are tightly packed. */
export interface MeshData {
  /** xyz per vertex */
  positions: Float32Array;
  /** xyz per vertex, unit length */
  normals: Float32Array;
  /** uv per vertex */
  uvs: Float32Array;
  /** three indices per triangle, counter-clockwise winding when viewed from outside */
  indices: Uint32Array;
}

export const VERTEX_FLOATS = 8; // position(3) + normal(3) + uv(2)
export const VERTEX_STRIDE_BYTES = VERTEX_FLOATS * 4;

export function vertexCount(mesh: MeshData): number {
  return mesh.positions.length / 3;
}

export function triangleCount(mesh: MeshData): number {
  return mesh.indices.length / 3;
}

/** Interleave attributes as [px py pz nx ny nz u v] for upload to a single GPU vertex buffer. */
export function interleaveVertices(mesh: MeshData): Float32Array {
  const n = vertexCount(mesh);
  const out = new Float32Array(n * VERTEX_FLOATS);
  for (let i = 0; i < n; i++) {
    const o = i * VERTEX_FLOATS;
    out[o] = mesh.positions[i * 3];
    out[o + 1] = mesh.positions[i * 3 + 1];
    out[o + 2] = mesh.positions[i * 3 + 2];
    out[o + 3] = mesh.normals[i * 3];
    out[o + 4] = mesh.normals[i * 3 + 1];
    out[o + 5] = mesh.normals[i * 3 + 2];
    out[o + 6] = mesh.uvs[i * 2];
    out[o + 7] = mesh.uvs[i * 2 + 1];
  }
  return out;
}

/** Convert a triangle index list into a line-list index buffer (each edge once). */
export function createWireframeIndices(mesh: MeshData): Uint32Array {
  const seen = new Set<number>();
  const lines: number[] = [];
  const n = vertexCount(mesh);
  const addEdge = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = lo * n + hi;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(lo, hi);
  };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i],
      b = mesh.indices[i + 1],
      c = mesh.indices[i + 2];
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  return new Uint32Array(lines);
}

export interface Bounds {
  min: Vector3;
  max: Vector3;
}

export function computeBounds(mesh: MeshData): Bounds {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i],
      y = mesh.positions[i + 1],
      z = mesh.positions[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: new Vector3(minX, minY, minZ), max: new Vector3(maxX, maxY, maxZ) };
}

export interface MeshValidationReport {
  valid: boolean;
  errors: string[];
}

/** Structural validation: attribute lengths, index range, finite values, unit normals. */
export function validateMesh(mesh: MeshData, normalTolerance = 1e-3): MeshValidationReport {
  const errors: string[] = [];
  const n = vertexCount(mesh);

  if (mesh.positions.length % 3 !== 0) errors.push("positions length is not a multiple of 3");
  if (mesh.normals.length !== mesh.positions.length)
    errors.push("normals length != positions length");
  if (mesh.uvs.length !== n * 2) errors.push("uvs length != vertexCount * 2");
  if (mesh.indices.length % 3 !== 0) errors.push("indices length is not a multiple of 3");

  for (let i = 0; i < mesh.indices.length; i++) {
    if (mesh.indices[i] >= n) {
      errors.push(`index ${i} (${mesh.indices[i]}) is out of range for ${n} vertices`);
      break;
    }
  }
  for (let i = 0; i < mesh.positions.length; i++) {
    if (!Number.isFinite(mesh.positions[i])) {
      errors.push(`position component ${i} is not finite`);
      break;
    }
  }
  for (let i = 0; i + 2 < mesh.normals.length; i += 3) {
    const len = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
    if (Math.abs(len - 1) > normalTolerance) {
      errors.push(`normal of vertex ${i / 3} is not unit length (${len})`);
      break;
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Area-weighted smooth vertex normals computed from triangle geometry. */
export function computeNormals(positions: Float32Array, indices: Uint32Array): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3,
      ib = indices[i + 1] * 3,
      ic = indices[i + 2] * 3;
    const a = new Vector3(positions[ia], positions[ia + 1], positions[ia + 2]);
    const b = new Vector3(positions[ib], positions[ib + 1], positions[ib + 2]);
    const c = new Vector3(positions[ic], positions[ic + 1], positions[ic + 2]);
    const faceNormal = b.sub(a).cross(c.sub(a)); // length = 2 * area, so larger faces weigh more
    for (const idx of [ia, ib, ic]) {
      normals[idx] += faceNormal.x;
      normals[idx + 1] += faceNormal.y;
      normals[idx + 2] += faceNormal.z;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = new Vector3(normals[i], normals[i + 1], normals[i + 2]).normalize();
    normals[i] = n.x;
    normals[i + 1] = n.y;
    normals[i + 2] = n.z;
  }
  return normals;
}

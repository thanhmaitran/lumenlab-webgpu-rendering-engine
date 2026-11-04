import type { MeshData } from "./mesh";

/** Axis-aligned cube centred on the origin, 24 vertices (4 per face) so normals stay flat. */
export function createCube(size = 1): MeshData {
  const h = size / 2;
  // face: normal, tangent(u direction), bitangent(v direction)
  const faces: Array<[number[], number[], number[]]> = [
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ], // +Z
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ], // -Z
    [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ], // +X
    [
      [-1, 0, 0],
      [0, 0, 1],
      [0, 1, 0],
    ], // -X
    [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, -1],
    ], // +Y
    [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ], // -Y
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  faces.forEach(([n, t, b], f) => {
    const corners: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [cu, cv] of corners) {
      positions.push(
        (n[0] + t[0] * cu + b[0] * cv) * h,
        (n[1] + t[1] * cu + b[1] * cv) * h,
        (n[2] + t[2] * cu + b[2] * cv) * h,
      );
      normals.push(n[0], n[1], n[2]);
      uvs.push((cu + 1) / 2, 1 - (cv + 1) / 2);
    }
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Plane on the XZ axes facing +Y, centred on the origin. */
export function createPlane(width = 1, depth = 1, segmentsX = 1, segmentsZ = 1): MeshData {
  const sx = Math.max(1, Math.floor(segmentsX));
  const sz = Math.max(1, Math.floor(segmentsZ));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iz = 0; iz <= sz; iz++) {
    for (let ix = 0; ix <= sx; ix++) {
      const u = ix / sx;
      const v = iz / sz;
      positions.push((u - 0.5) * width, 0, (v - 0.5) * depth);
      normals.push(0, 1, 0);
      uvs.push(u, v);
    }
  }
  for (let iz = 0; iz < sz; iz++) {
    for (let ix = 0; ix < sx; ix++) {
      const a = iz * (sx + 1) + ix;
      const b = a + 1;
      const c = a + (sx + 1);
      const d = c + 1;
      // CCW seen from +Y
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** UV sphere with poles on the Y axis. */
export function createSphere(radius = 0.5, widthSegments = 32, heightSegments = 16): MeshData {
  const ws = Math.max(3, Math.floor(widthSegments));
  const hs = Math.max(2, Math.floor(heightSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= hs; iy++) {
    const v = iy / hs;
    const phi = v * Math.PI; // 0 at north pole
    for (let ix = 0; ix <= ws; ix++) {
      const u = ix / ws;
      const theta = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }
  const row = ws + 1;
  for (let iy = 0; iy < hs; iy++) {
    for (let ix = 0; ix < ws; ix++) {
      const a = iy * row + ix;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (iy !== 0) indices.push(a, b, c);
      if (iy !== hs - 1) indices.push(b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

/** Torus around the Y axis; useful for visibly checking normals and shadows. */
export function createTorus(
  radius = 0.5,
  tube = 0.2,
  radialSegments = 32,
  tubularSegments = 16,
): MeshData {
  const rs = Math.max(3, Math.floor(radialSegments));
  const ts = Math.max(3, Math.floor(tubularSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= ts; j++) {
    const v = (j / ts) * Math.PI * 2;
    for (let i = 0; i <= rs; i++) {
      const u = (i / rs) * Math.PI * 2;
      const cx = Math.cos(u) * radius;
      const cz = Math.sin(u) * radius;
      const x = (radius + tube * Math.cos(v)) * Math.cos(u);
      const y = tube * Math.sin(v);
      const z = (radius + tube * Math.cos(v)) * Math.sin(u);
      positions.push(x, y, z);
      const nx = x - cx,
        ny = y,
        nz = z - cz;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
      uvs.push(i / rs, j / ts);
    }
  }
  const row = rs + 1;
  for (let j = 0; j < ts; j++) {
    for (let i = 0; i < rs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
  };
}

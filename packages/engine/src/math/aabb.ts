import type { Matrix4 } from "./matrix4";
import { Vector3 } from "./vector3";

export interface Aabb {
  min: Vector3;
  max: Vector3;
}

/**
 * Transform an AABB by an affine matrix without enumerating all 8 corners (Arvo's method).
 * Exact for affine transforms: new extents = |M3x3| * extents.
 */
export function transformAabb(m: Matrix4, box: Aabb): Aabb {
  const e = m.elements;
  const cx = (box.min.x + box.max.x) / 2,
    cy = (box.min.y + box.max.y) / 2,
    cz = (box.min.z + box.max.z) / 2;
  const hx = (box.max.x - box.min.x) / 2,
    hy = (box.max.y - box.min.y) / 2,
    hz = (box.max.z - box.min.z) / 2;
  const ncx = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
  const ncy = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
  const ncz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
  const nhx = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
  const nhy = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
  const nhz = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
  return {
    min: new Vector3(ncx - nhx, ncy - nhy, ncz - nhz),
    max: new Vector3(ncx + nhx, ncy + nhy, ncz + nhz),
  };
}

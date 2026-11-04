import type { Quaternion } from "./quaternion";
import { Vector3 } from "./vector3";
import { EPSILON } from "./scalar";

/**
 * 4x4 matrix stored in COLUMN-MAJOR order, matching WGSL's mat4x4<f32> memory layout:
 * element (row r, column c) lives at index `c * 4 + r`.
 *
 * Conventions:
 *  - Right-handed world space, +Y up, camera looks down -Z in view space.
 *  - Clip-space depth range is [0, 1] (WebGPU), not OpenGL's [-1, 1].
 *  - `a.multiply(b)` computes `a * b`, i.e. `b` is applied first when transforming a column vector.
 */
export class Matrix4 {
  readonly elements: Float32Array;

  constructor(elements?: ArrayLike<number>) {
    this.elements = new Float32Array(16);
    if (elements) {
      if (elements.length !== 16) throw new RangeError("Matrix4 requires exactly 16 elements");
      this.elements.set(elements);
    } else {
      this.elements[0] = this.elements[5] = this.elements[10] = this.elements[15] = 1;
    }
  }

  static identity(): Matrix4 {
    return new Matrix4();
  }

  /** Build from row-major nested values (convenient for tests and readability). */
  static fromRows(rows: ArrayLike<number>): Matrix4 {
    const m = new Matrix4();
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m.elements[c * 4 + r] = rows[r * 4 + c];
    return m;
  }

  get(row: number, col: number): number {
    return this.elements[col * 4 + row];
  }

  clone(): Matrix4 {
    return new Matrix4(this.elements);
  }

  multiply(b: Matrix4): Matrix4 {
    const a = this.elements;
    const be = b.elements;
    const out = new Matrix4();
    const o = out.elements;
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * be[c * 4 + k];
        o[c * 4 + r] = sum;
      }
    }
    return out;
  }

  transpose(): Matrix4 {
    const out = new Matrix4();
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) out.elements[r * 4 + c] = this.elements[c * 4 + r];
    return out;
  }

  determinant(): number {
    const m = this.elements;
    const [a00, a01, a02, a03] = [m[0], m[1], m[2], m[3]];
    const [a10, a11, a12, a13] = [m[4], m[5], m[6], m[7]];
    const [a20, a21, a22, a23] = [m[8], m[9], m[10], m[11]];
    const [a30, a31, a32, a33] = [m[12], m[13], m[14], m[15]];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  }

  /** Returns the inverse, or `null` when the matrix is singular. */
  invert(): Matrix4 | null {
    const m = this.elements;
    const a00 = m[0],
      a01 = m[1],
      a02 = m[2],
      a03 = m[3];
    const a10 = m[4],
      a11 = m[5],
      a12 = m[6],
      a13 = m[7];
    const a20 = m[8],
      a21 = m[9],
      a22 = m[10],
      a23 = m[11];
    const a30 = m[12],
      a31 = m[13],
      a32 = m[14],
      a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;

    const out = new Matrix4();
    const o = out.elements;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * inv;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * inv;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * inv;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * inv;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * inv;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * inv;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * inv;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * inv;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * inv;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * inv;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * inv;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * inv;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * inv;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * inv;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * inv;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * inv;
    return out;
  }

  /** Transform a point (w = 1) with perspective divide. */
  transformPoint(p: Vector3): Vector3 {
    const e = this.elements;
    const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
    const iw = Math.abs(w) < EPSILON ? 1 : 1 / w;
    return new Vector3(
      (e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) * iw,
      (e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) * iw,
      (e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]) * iw,
    );
  }

  /** Transform a direction (w = 0): translation is ignored. */
  transformDirection(d: Vector3): Vector3 {
    const e = this.elements;
    return new Vector3(
      e[0] * d.x + e[4] * d.y + e[8] * d.z,
      e[1] * d.x + e[5] * d.y + e[9] * d.z,
      e[2] * d.x + e[6] * d.y + e[10] * d.z,
    );
  }

  /**
   * Matrix used to transform normals: the inverse-transpose of the model matrix.
   * Falls back to identity for singular matrices.
   */
  normalMatrix(): Matrix4 {
    const inv = this.invert();
    return inv ? inv.transpose() : Matrix4.identity();
  }

  equals(m: Matrix4, epsilon = 1e-5): boolean {
    for (let i = 0; i < 16; i++)
      if (Math.abs(this.elements[i] - m.elements[i]) > epsilon) return false;
    return true;
  }

  isFinite(): boolean {
    return this.elements.every(Number.isFinite);
  }

  // ---- factories ---------------------------------------------------------------------------

  static translation(x: number, y: number, z: number): Matrix4 {
    const m = new Matrix4();
    m.elements[12] = x;
    m.elements[13] = y;
    m.elements[14] = z;
    return m;
  }

  static scaling(x: number, y: number, z: number): Matrix4 {
    const m = new Matrix4();
    m.elements[0] = x;
    m.elements[5] = y;
    m.elements[10] = z;
    return m;
  }

  static rotationX(rad: number): Matrix4 {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    return Matrix4.fromRows([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1]);
  }

  static rotationY(rad: number): Matrix4 {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    return Matrix4.fromRows([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1]);
  }

  static rotationZ(rad: number): Matrix4 {
    const c = Math.cos(rad),
      s = Math.sin(rad);
    return Matrix4.fromRows([c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  static fromQuaternion(q: Quaternion): Matrix4 {
    const { x, y, z, w } = q.normalize();
    const xx = x * x,
      yy = y * y,
      zz = z * z;
    const xy = x * y,
      xz = x * z,
      yz = y * z;
    const wx = w * x,
      wy = w * y,
      wz = w * z;
    return Matrix4.fromRows([
      1 - 2 * (yy + zz),
      2 * (xy - wz),
      2 * (xz + wy),
      0,
      2 * (xy + wz),
      1 - 2 * (xx + zz),
      2 * (yz - wx),
      0,
      2 * (xz - wy),
      2 * (yz + wx),
      1 - 2 * (xx + yy),
      0,
      0,
      0,
      0,
      1,
    ]);
  }

  /** Model matrix = T * R * S. */
  static compose(position: Vector3, rotation: Quaternion, scale: Vector3): Matrix4 {
    return Matrix4.translation(position.x, position.y, position.z)
      .multiply(Matrix4.fromQuaternion(rotation))
      .multiply(Matrix4.scaling(scale.x, scale.y, scale.z));
  }

  /**
   * Right-handed perspective projection mapping view-space depth to [0, 1] (WebGPU clip space).
   * @param fovY vertical field of view in radians
   */
  static perspective(fovY: number, aspect: number, near: number, far: number): Matrix4 {
    if (!(fovY > 0 && fovY < Math.PI)) throw new RangeError("fovY must be in (0, PI) radians");
    if (!(aspect > 0)) throw new RangeError("aspect must be positive");
    if (!(near > 0 && far > near)) throw new RangeError("require 0 < near < far");
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return Matrix4.fromRows([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      far * nf,
      far * near * nf,
      0,
      0,
      -1,
      0,
    ]);
  }

  /** Right-handed orthographic projection mapping view-space depth to [0, 1]. */
  static orthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ): Matrix4 {
    if (right === left || top === bottom || far === near) {
      throw new RangeError("orthographic volume must have non-zero extent");
    }
    const rl = 1 / (right - left);
    const tb = 1 / (top - bottom);
    const nf = 1 / (near - far);
    return Matrix4.fromRows([
      2 * rl,
      0,
      0,
      -(right + left) * rl,
      0,
      2 * tb,
      0,
      -(top + bottom) * tb,
      0,
      0,
      nf,
      near * nf,
      0,
      0,
      0,
      1,
    ]);
  }

  /**
   * View matrix for a camera at `eye` looking at `target`.
   * If `up` is (nearly) parallel to the viewing direction, an alternate up axis is chosen
   * instead of producing a degenerate (NaN) basis.
   */
  static lookAt(eye: Vector3, target: Vector3, up: Vector3 = Vector3.UNIT_Y): Matrix4 {
    const forward = target.sub(eye).normalize();
    if (forward.lengthSquared() === 0) return Matrix4.translation(-eye.x, -eye.y, -eye.z);

    let right = forward.cross(up);
    if (right.length() < 1e-4) {
      const alt = Math.abs(forward.y) > 0.99 ? Vector3.UNIT_Z : Vector3.UNIT_Y;
      right = forward.cross(alt);
    }
    right = right.normalize();
    const trueUp = right.cross(forward);

    return Matrix4.fromRows([
      right.x,
      right.y,
      right.z,
      -right.dot(eye),
      trueUp.x,
      trueUp.y,
      trueUp.z,
      -trueUp.dot(eye),
      -forward.x,
      -forward.y,
      -forward.z,
      forward.dot(eye),
      0,
      0,
      0,
      1,
    ]);
  }
}

import { Vector3 } from "./vector3";
import { EPSILON } from "./scalar";

/** Unit quaternion (x, y, z, w) for rotations. */
export class Quaternion {
  constructor(
    public readonly x = 0,
    public readonly y = 0,
    public readonly z = 0,
    public readonly w = 1,
  ) {}

  static readonly IDENTITY = new Quaternion(0, 0, 0, 1);

  static fromAxisAngle(axis: Vector3, radians: number): Quaternion {
    const a = axis.normalize();
    const half = radians / 2;
    const s = Math.sin(half);
    return new Quaternion(a.x * s, a.y * s, a.z * s, Math.cos(half));
  }

  /** Euler angles in radians, applied in X, then Y, then Z order (intrinsic XYZ). */
  static fromEuler(x: number, y: number, z: number): Quaternion {
    const qx = Quaternion.fromAxisAngle(Vector3.UNIT_X, x);
    const qy = Quaternion.fromAxisAngle(Vector3.UNIT_Y, y);
    const qz = Quaternion.fromAxisAngle(Vector3.UNIT_Z, z);
    return qx.multiply(qy).multiply(qz);
  }

  /**
   * Inverse of `fromEuler`: Euler angles in radians (x, y, z) such that
   * `Quaternion.fromEuler(...q.toEuler())` represents the same rotation. At gimbal lock
   * (|y| = 90 degrees) z is set to 0 and x absorbs the remaining rotation.
   */
  toEuler(): [number, number, number] {
    const { x, y, z, w } = this.normalize();
    const r00 = 1 - 2 * (y * y + z * z);
    const r01 = 2 * (x * y - z * w);
    const r02 = 2 * (x * z + y * w);
    const r11 = 1 - 2 * (x * x + z * z);
    const r12 = 2 * (y * z - x * w);
    const r21 = 2 * (y * z + x * w);
    const r22 = 1 - 2 * (x * x + y * y);
    const sinB = Math.min(1, Math.max(-1, r02));
    const b = Math.asin(sinB);
    if (Math.abs(sinB) > 0.999999) return [Math.atan2(r21, r11), b, 0];
    return [Math.atan2(-r12, r22), b, Math.atan2(-r01, r00)];
  }

  /** Hamilton product: applying (this * q) rotates by q first, then by this. */
  multiply(q: Quaternion): Quaternion {
    return new Quaternion(
      this.w * q.x + this.x * q.w + this.y * q.z - this.z * q.y,
      this.w * q.y - this.x * q.z + this.y * q.w + this.z * q.x,
      this.w * q.z + this.x * q.y - this.y * q.x + this.z * q.w,
      this.w * q.w - this.x * q.x - this.y * q.y - this.z * q.z,
    );
  }

  conjugate(): Quaternion {
    return new Quaternion(-this.x, -this.y, -this.z, this.w);
  }

  length(): number {
    return Math.hypot(this.x, this.y, this.z, this.w);
  }

  normalize(): Quaternion {
    const len = this.length();
    if (len < EPSILON) return Quaternion.IDENTITY;
    return new Quaternion(this.x / len, this.y / len, this.z / len, this.w / len);
  }

  rotateVector(v: Vector3): Vector3 {
    const qv = new Quaternion(v.x, v.y, v.z, 0);
    const r = this.multiply(qv).multiply(this.conjugate());
    return new Vector3(r.x, r.y, r.z);
  }
}

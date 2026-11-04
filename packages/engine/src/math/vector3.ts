import { EPSILON } from "./scalar";

export type Vec3Tuple = readonly [number, number, number];

/** Immutable-style 3D vector. Every operation returns a new instance. */
export class Vector3 {
  constructor(
    public readonly x = 0,
    public readonly y = 0,
    public readonly z = 0,
  ) {}

  static readonly ZERO = new Vector3(0, 0, 0);
  static readonly ONE = new Vector3(1, 1, 1);
  static readonly UNIT_X = new Vector3(1, 0, 0);
  static readonly UNIT_Y = new Vector3(0, 1, 0);
  static readonly UNIT_Z = new Vector3(0, 0, 1);

  static from(tuple: Vec3Tuple): Vector3 {
    return new Vector3(tuple[0], tuple[1], tuple[2]);
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  sub(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  scale(s: number): Vector3 {
    return new Vector3(this.x * s, this.y * s, this.z * s);
  }

  negate(): Vector3 {
    return new Vector3(-this.x, -this.y, -this.z);
  }

  /** Component-wise multiplication. */
  multiply(v: Vector3): Vector3 {
    return new Vector3(this.x * v.x, this.y * v.y, this.z * v.z);
  }

  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x,
    );
  }

  lengthSquared(): number {
    return this.dot(this);
  }

  length(): number {
    return Math.sqrt(this.lengthSquared());
  }

  distanceTo(v: Vector3): number {
    return this.sub(v).length();
  }

  /** Returns a unit vector. A zero-length vector normalizes to zero (never NaN). */
  normalize(): Vector3 {
    const len = this.length();
    if (len < EPSILON) return Vector3.ZERO;
    return this.scale(1 / len);
  }

  lerp(v: Vector3, t: number): Vector3 {
    return new Vector3(
      this.x + (v.x - this.x) * t,
      this.y + (v.y - this.y) * t,
      this.z + (v.z - this.z) * t,
    );
  }

  equals(v: Vector3, epsilon = EPSILON): boolean {
    return (
      Math.abs(this.x - v.x) <= epsilon &&
      Math.abs(this.y - v.y) <= epsilon &&
      Math.abs(this.z - v.z) <= epsilon
    );
  }

  isFinite(): boolean {
    return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z);
  }
}

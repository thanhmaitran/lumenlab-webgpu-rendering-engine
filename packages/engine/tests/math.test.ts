import { describe, expect, it } from "vitest";
import { Matrix4, Quaternion, Vector3, degToRad, transformAabb } from "../src";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe("Vector3", () => {
  it("adds, subtracts and scales", () => {
    expect(
      v(1, 2, 3)
        .add(v(4, 5, 6))
        .toArray(),
    ).toEqual([5, 7, 9]);
    expect(
      v(4, 5, 6)
        .sub(v(1, 2, 3))
        .toArray(),
    ).toEqual([3, 3, 3]);
    expect(v(1, 2, 3).scale(2).toArray()).toEqual([2, 4, 6]);
  });

  it("computes dot and cross products", () => {
    expect(v(1, 0, 0).dot(v(0, 1, 0))).toBe(0);
    expect(v(1, 2, 3).dot(v(4, 5, 6))).toBe(32);
    expect(
      v(1, 0, 0)
        .cross(v(0, 1, 0))
        .toArray(),
    ).toEqual([0, 0, 1]);
    expect(
      v(0, 1, 0)
        .cross(v(1, 0, 0))
        .toArray(),
    ).toEqual([0, 0, -1]);
  });

  it("normalizes to unit length and never produces NaN for zero vectors", () => {
    expect(v(3, 4, 0).normalize().length()).toBeCloseTo(1, 6);
    const z = Vector3.ZERO.normalize();
    expect(z.isFinite()).toBe(true);
    expect(z.length()).toBe(0);
  });

  it("is immutable", () => {
    const a = v(1, 1, 1);
    a.add(v(1, 1, 1));
    expect(a.toArray()).toEqual([1, 1, 1]);
  });
});

describe("Matrix4", () => {
  it("identity leaves points unchanged", () => {
    expect(
      Matrix4.identity()
        .transformPoint(v(1, 2, 3))
        .toArray(),
    ).toEqual([1, 2, 3]);
  });

  it("stores elements column-major (translation in 12..14)", () => {
    const m = Matrix4.translation(1, 2, 3);
    expect(Array.from(m.elements.slice(12, 15))).toEqual([1, 2, 3]);
    expect(m.get(0, 3)).toBe(1);
  });

  it("multiplies in the correct order: (A*B) applies B first", () => {
    const t = Matrix4.translation(10, 0, 0);
    const s = Matrix4.scaling(2, 2, 2);
    // scale then translate
    expect(
      t
        .multiply(s)
        .transformPoint(v(1, 0, 0))
        .toArray(),
    ).toEqual([12, 0, 0]);
    // translate then scale
    expect(
      s
        .multiply(t)
        .transformPoint(v(1, 0, 0))
        .toArray(),
    ).toEqual([22, 0, 0]);
  });

  it("is associative", () => {
    const a = Matrix4.rotationX(0.3);
    const b = Matrix4.translation(1, 2, 3);
    const c = Matrix4.scaling(2, 3, 4);
    expect(
      a
        .multiply(b)
        .multiply(c)
        .equals(a.multiply(b.multiply(c))),
    ).toBe(true);
  });

  it("rotates right-handed: +X rotated 90deg about +Z becomes +Y", () => {
    const p = Matrix4.rotationZ(Math.PI / 2).transformPoint(v(1, 0, 0));
    expect(p.equals(v(0, 1, 0), 1e-5)).toBe(true);
    const q = Matrix4.rotationY(Math.PI / 2).transformPoint(v(0, 0, 1));
    expect(q.equals(v(1, 0, 0), 1e-5)).toBe(true);
    const r = Matrix4.rotationX(Math.PI / 2).transformPoint(v(0, 1, 0));
    expect(r.equals(v(0, 0, 1), 1e-5)).toBe(true);
  });

  it("inverts: M * M^-1 = I", () => {
    const m = Matrix4.compose(v(1, 2, 3), Quaternion.fromEuler(0.4, 0.5, 0.6), v(2, 3, 4));
    const inv = m.invert();
    expect(inv).not.toBeNull();
    expect(m.multiply(inv!).equals(Matrix4.identity(), 1e-4)).toBe(true);
  });

  it("returns null when inverting a singular matrix", () => {
    expect(Matrix4.scaling(1, 0, 1).invert()).toBeNull();
  });

  it("transpose is an involution", () => {
    const m = Matrix4.compose(v(1, 2, 3), Quaternion.fromEuler(0.1, 0.2, 0.3), v(1, 2, 3));
    expect(m.transpose().transpose().equals(m)).toBe(true);
  });

  it("transformDirection ignores translation", () => {
    expect(
      Matrix4.translation(5, 5, 5)
        .transformDirection(v(1, 0, 0))
        .toArray(),
    ).toEqual([1, 0, 0]);
  });

  it("normal matrix keeps normals perpendicular under non-uniform scale", () => {
    const model = Matrix4.scaling(4, 1, 1);
    // A surface with tangent (1,1,0) has normal (1,-1,0); after scaling the tangent is (4,1,0).
    const tangent = model.transformDirection(v(1, 1, 0));
    const normal = model.normalMatrix().transformDirection(v(1, -1, 0));
    expect(Math.abs(tangent.dot(normal))).toBeLessThan(1e-5);
    // Using the model matrix directly would be wrong:
    expect(Math.abs(tangent.dot(model.transformDirection(v(1, -1, 0))))).toBeGreaterThan(1);
  });

  it("compose = T * R * S", () => {
    const m = Matrix4.compose(v(1, 0, 0), Quaternion.IDENTITY, v(2, 2, 2));
    expect(m.transformPoint(v(1, 1, 1)).toArray()).toEqual([3, 2, 2]);
  });

  it("determinant of a scale is the product of its factors", () => {
    expect(Matrix4.scaling(2, 3, 4).determinant()).toBeCloseTo(24, 5);
  });

  it("rejects wrong element counts", () => {
    expect(() => new Matrix4([1, 2, 3])).toThrow(RangeError);
  });
});

describe("perspective projection (WebGPU depth 0..1)", () => {
  const near = 0.5;
  const far = 50;
  const proj = Matrix4.perspective(degToRad(60), 16 / 9, near, far);

  it("maps the near plane to depth 0 and the far plane to depth 1", () => {
    expect(proj.transformPoint(v(0, 0, -near)).z).toBeCloseTo(0, 5);
    expect(proj.transformPoint(v(0, 0, -far)).z).toBeCloseTo(1, 4);
  });

  it("keeps depth monotonic between near and far", () => {
    let prev = -Infinity;
    for (let d = near; d <= far; d += 1.7) {
      const z = proj.transformPoint(v(0, 0, -d)).z;
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });

  it("maps the frustum edge at the near plane to NDC x = 1", () => {
    const halfHeight = near * Math.tan(degToRad(60) / 2);
    const halfWidth = halfHeight * (16 / 9);
    const p = proj.transformPoint(v(halfWidth, halfHeight, -near));
    expect(p.x).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(1, 5);
  });

  it("validates its parameters", () => {
    expect(() => Matrix4.perspective(0, 1, 0.1, 10)).toThrow(RangeError);
    expect(() => Matrix4.perspective(1, 0, 0.1, 10)).toThrow(RangeError);
    expect(() => Matrix4.perspective(1, 1, 0, 10)).toThrow(RangeError);
    expect(() => Matrix4.perspective(1, 1, 10, 1)).toThrow(RangeError);
  });
});

describe("orthographic projection", () => {
  it("maps near to 0 and far to 1", () => {
    const m = Matrix4.orthographic(-2, 2, -2, 2, 1, 9);
    expect(m.transformPoint(v(0, 0, -1)).z).toBeCloseTo(0, 6);
    expect(m.transformPoint(v(0, 0, -9)).z).toBeCloseTo(1, 6);
    expect(
      m
        .transformPoint(v(2, -2, -5))
        .toArray()
        .slice(0, 2),
    ).toEqual([1, -1]);
  });
});

describe("lookAt", () => {
  it("puts the eye at the origin and looks down -Z", () => {
    const view = Matrix4.lookAt(v(0, 0, 5), v(0, 0, 0));
    expect(view.transformPoint(v(0, 0, 5)).equals(v(0, 0, 0), 1e-5)).toBe(true);
    expect(view.transformPoint(v(0, 0, 0)).equals(v(0, 0, -5), 1e-5)).toBe(true);
  });

  it("produces an orthonormal rotation", () => {
    const view = Matrix4.lookAt(v(3, 4, 5), v(0, 1, 0));
    const x = view.transformDirection(v(1, 0, 0));
    const y = view.transformDirection(v(0, 1, 0));
    const z = view.transformDirection(v(0, 0, 1));
    expect(x.length()).toBeCloseTo(1, 5);
    expect(x.dot(y)).toBeCloseTo(0, 5);
    expect(x.cross(y).equals(z, 1e-5)).toBe(true);
  });

  it("does not produce NaN when up is parallel to the viewing direction", () => {
    const straightDown = Matrix4.lookAt(v(0, 10, 0), v(0, 0, 0), v(0, 1, 0));
    expect(straightDown.isFinite()).toBe(true);
    const straightUp = Matrix4.lookAt(v(0, -10, 0), v(0, 0, 0), v(0, 1, 0));
    expect(straightUp.isFinite()).toBe(true);
    // The target must still land on the view axis, 10 units ahead.
    const p = straightDown.transformPoint(v(0, 0, 0));
    expect(p.equals(v(0, 0, -10), 1e-4)).toBe(true);
  });

  it("handles eye == target without NaN", () => {
    expect(Matrix4.lookAt(v(1, 1, 1), v(1, 1, 1)).isFinite()).toBe(true);
  });
});

describe("Quaternion", () => {
  it("rotates vectors like the equivalent rotation matrix", () => {
    const q = Quaternion.fromAxisAngle(v(0, 1, 0), 0.9);
    const viaQ = q.rotateVector(v(1, 2, 3));
    const viaM = Matrix4.fromQuaternion(q).transformPoint(v(1, 2, 3));
    expect(viaQ.equals(viaM, 1e-5)).toBe(true);
    expect(viaQ.equals(Matrix4.rotationY(0.9).transformPoint(v(1, 2, 3)), 1e-5)).toBe(true);
  });

  it("composes rotations: (a*b) applies b first", () => {
    const a = Quaternion.fromAxisAngle(v(0, 0, 1), Math.PI / 2);
    const b = Quaternion.fromAxisAngle(v(1, 0, 0), Math.PI / 2);
    const p = a.multiply(b).rotateVector(v(0, 1, 0));
    const expected = a.rotateVector(b.rotateVector(v(0, 1, 0)));
    expect(p.equals(expected, 1e-5)).toBe(true);
  });

  it("normalizes a zero quaternion to identity", () => {
    expect(new Quaternion(0, 0, 0, 0).normalize()).toBe(Quaternion.IDENTITY);
  });
});

describe("transformAabb", () => {
  it("matches brute-force corner transformation", () => {
    const box = { min: v(-1, -2, -3), max: v(2, 1, 4) };
    const m = Matrix4.compose(v(3, -1, 2), Quaternion.fromEuler(0.5, 1.1, -0.3), v(1, 2, 0.5));
    const fast = transformAabb(m, box);
    let min = v(Infinity, Infinity, Infinity);
    let max = v(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < 8; i++) {
      const p = m.transformPoint(
        v(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        ),
      );
      min = v(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z));
      max = v(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z));
    }
    expect(fast.min.equals(min, 1e-4)).toBe(true);
    expect(fast.max.equals(max, 1e-4)).toBe(true);
  });
});

describe("Quaternion.toEuler", () => {
  it("round-trips fromEuler for generic angles", () => {
    for (const [x, y, z] of [
      [0.3, 0.5, -0.7],
      [-1.2, 0.2, 2.1],
      [0, 0, 0],
      [3.0, -1.0, 0.4],
    ]) {
      const q = Quaternion.fromEuler(x, y, z);
      const back = Quaternion.fromEuler(...q.toEuler());
      // q and -q are the same rotation, so compare the rotated vector instead of components
      const probe = new Vector3(1, 2, 3);
      const a = q.rotateVector(probe);
      const b = back.rotateVector(probe);
      expect(b.x).toBeCloseTo(a.x, 5);
      expect(b.y).toBeCloseTo(a.y, 5);
      expect(b.z).toBeCloseTo(a.z, 5);
    }
  });

  it("recovers simple single-axis angles", () => {
    const [x, y, z] = Quaternion.fromEuler(0, degToRad(30), 0).toEuler();
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(degToRad(30), 6);
    expect(z).toBeCloseTo(0, 6);
  });

  it("handles gimbal lock without producing NaN", () => {
    const q = Quaternion.fromEuler(0.4, Math.PI / 2, 0.9);
    const e = q.toEuler();
    expect(e.every(Number.isFinite)).toBe(true);
    const probe = new Vector3(0.3, -1, 2);
    const a = q.rotateVector(probe);
    const b = Quaternion.fromEuler(...e).rotateVector(probe);
    expect(b.x).toBeCloseTo(a.x, 4);
    expect(b.y).toBeCloseTo(a.y, 4);
    expect(b.z).toBeCloseTo(a.z, 4);
  });
});

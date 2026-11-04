import { describe, expect, it } from "vitest";
import { OrbitController, PerspectiveCamera, Vector3 } from "../src";

const makeCamera = () =>
  new PerspectiveCamera({
    position: [4, 3, 5],
    target: [0, 1, 0],
    fovYDegrees: 50,
    near: 0.1,
    far: 100,
  });

describe("PerspectiveCamera", () => {
  it("falls back to aspect 1 for a zero-sized canvas", () => {
    const camera = makeCamera();
    camera.setAspect(800, 400);
    expect(camera.aspect).toBe(2);
    camera.setAspect(0, 0);
    expect(camera.aspect).toBe(1);
    camera.setAspect(100, 0);
    expect(camera.aspect).toBe(1);
  });

  it("projects its own target to the middle of the screen at a valid depth", () => {
    const camera = makeCamera();
    camera.setAspect(16, 9);
    const ndc = camera.viewProjectionMatrix().transformPoint(camera.target);
    expect(ndc.x).toBeCloseTo(0, 5);
    expect(ndc.y).toBeCloseTo(0, 5);
    expect(ndc.z).toBeGreaterThan(0);
    expect(ndc.z).toBeLessThan(1);
  });

  it("maps points on the near and far planes to depth 0 and 1", () => {
    const camera = new PerspectiveCamera({
      position: [0, 0, 0],
      target: [0, 0, -1],
      fovYDegrees: 60,
      near: 0.5,
      far: 20,
    });
    const vp = camera.viewProjectionMatrix();
    expect(vp.transformPoint(new Vector3(0, 0, -0.5)).z).toBeCloseTo(0, 5);
    expect(vp.transformPoint(new Vector3(0, 0, -20)).z).toBeCloseTo(1, 5);
  });

  it("keeps points to the right of the camera on the right of the screen", () => {
    const camera = new PerspectiveCamera({
      position: [0, 0, 5],
      target: [0, 0, 0],
      fovYDegrees: 60,
      near: 0.1,
      far: 50,
    });
    camera.setAspect(1, 1);
    const vp = camera.viewProjectionMatrix();
    expect(vp.transformPoint(new Vector3(1, 0, 0)).x).toBeGreaterThan(0);
    expect(vp.transformPoint(new Vector3(0, 1, 0)).y).toBeGreaterThan(0);
  });

  it("round-trips through toDefinition", () => {
    const camera = makeCamera();
    const copy = new PerspectiveCamera(camera.toDefinition());
    expect(copy.position.equals(camera.position)).toBe(true);
    expect(copy.target.equals(camera.target)).toBe(true);
    expect(copy.fovYDegrees).toBe(50);
  });

  it("produces a finite view matrix when looking straight down (up parallel to view)", () => {
    const camera = new PerspectiveCamera({
      position: [0, 10, 0],
      target: [0, 0, 0],
      fovYDegrees: 50,
      near: 0.1,
      far: 100,
    });
    expect(camera.viewMatrix().isFinite()).toBe(true);
    expect(camera.viewProjectionMatrix().isFinite()).toBe(true);
  });
});

describe("OrbitController", () => {
  it("keeps the camera exactly `distance` away from the target", () => {
    const orbit = new OrbitController();
    orbit.target = new Vector3(1, 2, 3);
    orbit.distance = 7;
    orbit.rotate(1.3, -0.4);
    const camera = makeCamera();
    orbit.apply(camera);
    expect(camera.position.distanceTo(camera.target)).toBeCloseTo(7, 5);
    expect(camera.target.equals(orbit.target)).toBe(true);
  });

  it("clamps the polar angle away from the poles so the view never aligns with up", () => {
    const orbit = new OrbitController();
    orbit.rotate(0, -100);
    expect(orbit.polar).toBeGreaterThan(0);
    orbit.rotate(0, 100);
    expect(orbit.polar).toBeLessThan(Math.PI);

    for (const extreme of [-100, 100]) {
      const o = new OrbitController();
      o.rotate(0, extreme);
      const camera = makeCamera();
      o.apply(camera);
      const forward = camera.target.sub(camera.position).normalize();
      expect(Math.abs(forward.dot(Vector3.UNIT_Y))).toBeLessThan(1);
      expect(camera.viewMatrix().isFinite()).toBe(true);
    }
  });

  it("wraps azimuth freely but never changes distance when rotating", () => {
    const orbit = new OrbitController();
    const before = orbit.distance;
    orbit.rotate(20, 0);
    expect(orbit.distance).toBe(before);
    expect(orbit.offset().length()).toBeCloseTo(before, 5);
  });

  it("zooms multiplicatively and clamps to its limits", () => {
    const orbit = new OrbitController();
    orbit.distance = 10;
    orbit.zoom(0.5);
    expect(orbit.distance).toBeCloseTo(5, 6);
    orbit.zoom(1e-6);
    expect(orbit.distance).toBe(orbit.minDistance);
    orbit.zoom(1e9);
    expect(orbit.distance).toBe(orbit.maxDistance);
  });

  it("pans in the screen plane: the target moves perpendicular to the view direction", () => {
    const orbit = new OrbitController();
    const before = orbit.target;
    const forward = orbit.offset().negate().normalize();
    orbit.pan(1, 0.5);
    const moved = orbit.target.sub(before);
    expect(moved.length()).toBeGreaterThan(0);
    expect(moved.dot(forward)).toBeCloseTo(0, 5);
    expect(moved.length()).toBeCloseTo(Math.hypot(1, 0.5), 5);
  });

  it("fromCamera + apply reproduces the camera position", () => {
    const camera = makeCamera();
    const orbit = OrbitController.fromCamera(camera);
    const copy = makeCamera();
    copy.position = new Vector3(100, 100, 100);
    orbit.apply(copy);
    expect(copy.position.equals(camera.position, 1e-4)).toBe(true);
    expect(copy.target.equals(camera.target)).toBe(true);
  });

  it("fromCamera survives a camera placed exactly above its target", () => {
    const camera = new PerspectiveCamera({
      position: [0, 5, 0],
      target: [0, 0, 0],
      fovYDegrees: 50,
      near: 0.1,
      far: 100,
    });
    const orbit = OrbitController.fromCamera(camera);
    expect(Number.isFinite(orbit.azimuth)).toBe(true);
    expect(orbit.polar).toBeGreaterThan(0);
    orbit.apply(camera);
    expect(camera.viewMatrix().isFinite()).toBe(true);
  });
});

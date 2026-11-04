import { Vector3 } from "../math/vector3";
import { clamp } from "../math/scalar";
import type { PerspectiveCamera } from "./perspective-camera";

const MIN_POLAR = 0.01;
const MAX_POLAR = Math.PI - 0.01;

/**
 * Orbit camera controller expressed purely as math (no DOM). The UI layer translates pointer
 * events into `rotate`, `pan` and `zoom` calls. The polar angle is clamped away from the poles so
 * the view direction never becomes parallel to the world up vector.
 */
export class OrbitController {
  azimuth = 0.6;
  polar = 1.1;
  distance = 8;
  target = Vector3.ZERO;
  minDistance = 0.5;
  maxDistance = 200;

  static fromCamera(camera: PerspectiveCamera): OrbitController {
    const c = new OrbitController();
    c.target = camera.target;
    const offset = camera.position.sub(camera.target);
    c.distance = Math.max(c.minDistance, offset.length());
    c.polar = clamp(Math.acos(clamp(offset.y / (c.distance || 1), -1, 1)), MIN_POLAR, MAX_POLAR);
    c.azimuth = Math.atan2(offset.z, offset.x);
    return c;
  }

  rotate(deltaAzimuth: number, deltaPolar: number): void {
    this.azimuth += deltaAzimuth;
    this.polar = clamp(this.polar + deltaPolar, MIN_POLAR, MAX_POLAR);
  }

  /** Multiplicative zoom: factor > 1 moves away, factor < 1 moves closer. */
  zoom(factor: number): void {
    this.distance = clamp(this.distance * factor, this.minDistance, this.maxDistance);
  }

  /** Pan in the camera's screen plane. Units are world units at the target distance. */
  pan(dx: number, dy: number): void {
    const offset = this.offset();
    const forward = offset.negate().normalize();
    const right = forward.cross(Vector3.UNIT_Y).normalize();
    const up = right.cross(forward);
    this.target = this.target.add(right.scale(dx)).add(up.scale(dy));
  }

  offset(): Vector3 {
    const sp = Math.sin(this.polar);
    return new Vector3(
      this.distance * sp * Math.cos(this.azimuth),
      this.distance * Math.cos(this.polar),
      this.distance * sp * Math.sin(this.azimuth),
    );
  }

  apply(camera: PerspectiveCamera): void {
    camera.target = this.target;
    camera.position = this.target.add(this.offset());
  }
}

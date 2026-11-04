import { Matrix4 } from "../math/matrix4";
import { Vector3 } from "../math/vector3";
import { degToRad } from "../math/scalar";

export interface CameraDefinition {
  position: [number, number, number];
  target: [number, number, number];
  fovYDegrees: number;
  near: number;
  far: number;
}

export class PerspectiveCamera {
  position: Vector3;
  target: Vector3;
  up: Vector3 = Vector3.UNIT_Y;
  fovYDegrees: number;
  near: number;
  far: number;
  aspect = 1;

  constructor(def: CameraDefinition) {
    this.position = Vector3.from(def.position);
    this.target = Vector3.from(def.target);
    this.fovYDegrees = def.fovYDegrees;
    this.near = def.near;
    this.far = def.far;
  }

  setAspect(width: number, height: number): void {
    this.aspect = height > 0 && width > 0 ? width / height : 1;
  }

  viewMatrix(): Matrix4 {
    return Matrix4.lookAt(this.position, this.target, this.up);
  }

  projectionMatrix(): Matrix4 {
    return Matrix4.perspective(degToRad(this.fovYDegrees), this.aspect, this.near, this.far);
  }

  viewProjectionMatrix(): Matrix4 {
    return this.projectionMatrix().multiply(this.viewMatrix());
  }

  toDefinition(): CameraDefinition {
    return {
      position: this.position.toArray(),
      target: this.target.toArray(),
      fovYDegrees: this.fovYDegrees,
      near: this.near,
      far: this.far,
    };
  }
}

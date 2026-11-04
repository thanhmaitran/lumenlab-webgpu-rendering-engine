import type { PerspectiveCamera } from "../camera/perspective-camera";
import { Vector3 } from "../math/vector3";
import type { Scene } from "./scene";

export interface Ray {
  origin: Vector3;
  direction: Vector3;
}

/** Build a world-space ray through normalised device coordinates (x, y in [-1, 1], y up). */
export function screenRay(camera: PerspectiveCamera, ndcX: number, ndcY: number): Ray | null {
  const inv = camera.viewProjectionMatrix().invert();
  if (!inv) return null;
  // WebGPU clip space: near plane z = 0, far plane z = 1.
  const near = inv.transformPoint(new Vector3(ndcX, ndcY, 0));
  const far = inv.transformPoint(new Vector3(ndcX, ndcY, 1));
  const direction = far.sub(near).normalize();
  if (direction.lengthSquared() === 0) return null;
  return { origin: near, direction };
}

/** Slab test. Returns the entry distance along the ray, or null on a miss. */
export function intersectRayAabb(ray: Ray, min: Vector3, max: Vector3): number | null {
  let tMin = 0;
  let tMax = Infinity;
  const o = [ray.origin.x, ray.origin.y, ray.origin.z];
  const d = [ray.direction.x, ray.direction.y, ray.direction.z];
  const lo = [min.x, min.y, min.z];
  const hi = [max.x, max.y, max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }
  }
  return tMin;
}

/** Return the id of the nearest object whose world AABB is hit by the ray. Ground planes are included. */
export function pickObject(scene: Scene, ndcX: number, ndcY: number): string | null {
  const ray = screenRay(scene.camera, ndcX, ndcY);
  if (!ray) return null;
  let bestId: string | null = null;
  let bestT = Infinity;
  for (const obj of scene.meshObjects()) {
    const { min, max } = obj.worldBounds();
    // Give flat objects (planes) a little thickness so the slab test is stable.
    const pad = new Vector3(1e-4, 1e-4, 1e-4);
    const t = intersectRayAabb(ray, min.sub(pad), max.add(pad));
    if (t !== null && t < bestT) {
      bestT = t;
      bestId = obj.id;
    }
  }
  return bestId;
}

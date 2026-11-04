import { Matrix4 } from "../math/matrix4";
import { Vector3 } from "../math/vector3";

export interface ShadowVolume {
  viewProjection: Matrix4;
  /** Orthographic half extent that covers the bounding sphere. */
  extent: number;
}

/**
 * Build the light-space view-projection matrix for a directional light so that a bounding sphere
 * (centre, radius) of the scene is fully inside the shadow map. Depth maps to [0, 1].
 *
 * The matrix is snapped to shadow-map texel increments to avoid shimmering when the camera moves
 * (only meaningful if the sphere moves; for a static scene this is a no-op).
 */
export function computeDirectionalShadowMatrix(
  lightDirection: Vector3,
  sceneCenter: Vector3,
  sceneRadius: number,
  shadowMapSize = 2048,
): ShadowVolume {
  const dir = lightDirection.normalize();
  const radius = Math.max(sceneRadius, 1e-3);
  const eye = sceneCenter.sub(dir.scale(radius * 2));
  const view = Matrix4.lookAt(eye, sceneCenter, Vector3.UNIT_Y);

  // Snap centre to texel grid in light space.
  const texel = (2 * radius) / shadowMapSize;
  const centerLS = view.transformPoint(sceneCenter);
  const snapX = Math.round(centerLS.x / texel) * texel - centerLS.x;
  const snapY = Math.round(centerLS.y / texel) * texel - centerLS.y;

  const proj = Matrix4.orthographic(
    -radius + snapX,
    radius + snapX,
    -radius + snapY,
    radius + snapY,
    0.01,
    radius * 4,
  );
  return { viewProjection: proj.multiply(view), extent: radius };
}

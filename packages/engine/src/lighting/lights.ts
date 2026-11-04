import { Vector3 } from "../math/vector3";

export interface DirectionalLightDefinition {
  type: "directional";
  id: string;
  name?: string;
  /** Direction the light travels (from the light towards the scene). */
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
  castShadow: boolean;
}

export interface PointLightDefinition {
  type: "point";
  id: string;
  name?: string;
  position: [number, number, number];
  color: [number, number, number];
  intensity: number;
  /** Distance at which the light's contribution reaches zero. */
  range: number;
}

export type LightDefinition = DirectionalLightDefinition | PointLightDefinition;

export const MAX_POINT_LIGHTS = 4;

export function normalizedLightDirection(light: DirectionalLightDefinition): Vector3 {
  const d = Vector3.from(light.direction).normalize();
  return d.lengthSquared() === 0 ? new Vector3(0, -1, 0) : d;
}

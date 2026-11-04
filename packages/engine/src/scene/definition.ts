import type { CameraDefinition } from "../camera/perspective-camera";
import type { LightDefinition } from "../lighting/lights";
import type { MaterialParams } from "../materials/material";

export type GeometrySpec =
  | { type: "cube"; size?: number }
  | { type: "plane"; width?: number; depth?: number; segmentsX?: number; segmentsZ?: number }
  | { type: "sphere"; radius?: number; widthSegments?: number; heightSegments?: number }
  | {
      type: "torus";
      radius?: number;
      tube?: number;
      radialSegments?: number;
      tubularSegments?: number;
    };

export interface SceneObjectDefinition {
  id: string;
  name: string;
  geometry: GeometrySpec;
  material: Partial<MaterialParams>;
  position: [number, number, number];
  /** Euler angles in degrees (XYZ). */
  rotationDegrees?: [number, number, number];
  scale?: [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** Declarative, serialisable description of a scene. */
export interface SceneDefinition {
  id: string;
  name: string;
  objects: SceneObjectDefinition[];
  lights: LightDefinition[];
  camera: CameraDefinition;
  ambient: [number, number, number];
  background: [number, number, number];
}

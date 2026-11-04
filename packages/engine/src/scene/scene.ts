import { PerspectiveCamera } from "../camera/perspective-camera";
import type { LightDefinition } from "../lighting/lights";
import { DEFAULT_MATERIAL, sanitizeMaterial, type MaterialParams } from "../materials/material";
import { Quaternion } from "../math/quaternion";
import { degToRad } from "../math/scalar";
import { Vector3 } from "../math/vector3";
import { computeBounds, type MeshData } from "../geometry/mesh";
import { transformAabb, type Aabb } from "../math/aabb";
import { createCube, createPlane, createSphere, createTorus } from "../geometry/primitives";
import type { GeometrySpec, SceneDefinition, SceneObjectDefinition } from "./definition";
import { SceneNode } from "./scene-node";

export function createGeometry(spec: GeometrySpec): MeshData {
  switch (spec.type) {
    case "cube":
      return createCube(spec.size);
    case "plane":
      return createPlane(spec.width, spec.depth, spec.segmentsX, spec.segmentsZ);
    case "sphere":
      return createSphere(spec.radius, spec.widthSegments, spec.heightSegments);
    case "torus":
      return createTorus(spec.radius, spec.tube, spec.radialSegments, spec.tubularSegments);
  }
}

/** A drawable object: a node plus geometry and material. */
export class MeshObject extends SceneNode {
  private _material: MaterialParams;
  private _castShadow: boolean;
  private _receiveShadow: boolean;
  private _bounds: Aabb | null = null;
  /** Stable key shared by objects with identical geometry (used for GPU buffer sharing). */
  readonly geometryKey: string;

  constructor(
    id: string,
    name: string,
    readonly geometrySpec: GeometrySpec,
    readonly mesh: MeshData,
    material: Partial<MaterialParams>,
    castShadow = true,
    receiveShadow = true,
  ) {
    super(id, name);
    this._material = sanitizeMaterial(material, DEFAULT_MATERIAL);
    this._castShadow = castShadow;
    this._receiveShadow = receiveShadow;
    this.geometryKey = JSON.stringify(geometrySpec);
  }

  get material(): MaterialParams {
    return this._material;
  }

  /** Merge a partial material. Values are clamped to valid ranges. */
  setMaterial(partial: Partial<MaterialParams>): void {
    this._material = sanitizeMaterial(partial, this._material);
    SceneNode.touch();
  }

  get castShadow(): boolean {
    return this._castShadow;
  }
  set castShadow(value: boolean) {
    this._castShadow = value;
    SceneNode.touch();
  }

  get receiveShadow(): boolean {
    return this._receiveShadow;
  }
  set receiveShadow(value: boolean) {
    this._receiveShadow = value;
    SceneNode.touch();
  }

  /** Local-space bounds, computed once. */
  localBounds(): Aabb {
    this._bounds ??= computeBounds(this.mesh);
    return this._bounds;
  }

  worldBounds(): Aabb {
    return transformAabb(this.worldMatrix(), this.localBounds());
  }
}

export class Scene {
  readonly root = new SceneNode("root", "Root");
  readonly camera: PerspectiveCamera;
  readonly lights: LightDefinition[];
  ambient: [number, number, number];
  background: [number, number, number];
  private readonly objects = new Map<string, MeshObject>();
  /** Incremented whenever objects are added or removed so renderers know when to resync GPU resources. */
  version = 0;

  constructor(
    readonly id: string,
    readonly name: string,
    camera: PerspectiveCamera,
    lights: LightDefinition[],
  ) {
    this.camera = camera;
    this.lights = lights;
    this.ambient = [0.03, 0.03, 0.035];
    this.background = [0.05, 0.05, 0.06];
  }

  static fromDefinition(def: SceneDefinition): Scene {
    const scene = new Scene(
      def.id,
      def.name,
      new PerspectiveCamera(def.camera),
      structuredClone(def.lights),
    );
    scene.ambient = [...def.ambient];
    scene.background = [...def.background];
    for (const o of def.objects) scene.addObject(o);
    return scene;
  }

  addObject(def: SceneObjectDefinition, parent: SceneNode = this.root): MeshObject {
    if (this.objects.has(def.id)) throw new Error(`Duplicate object id "${def.id}"`);
    const obj = new MeshObject(
      def.id,
      def.name,
      def.geometry,
      createGeometry(def.geometry),
      def.material,
      def.castShadow ?? true,
      def.receiveShadow ?? true,
    );
    obj.position = Vector3.from(def.position);
    if (def.rotationDegrees) {
      const [rx, ry, rz] = def.rotationDegrees;
      obj.rotation = Quaternion.fromEuler(degToRad(rx), degToRad(ry), degToRad(rz));
    }
    if (def.scale) obj.scale = Vector3.from(def.scale);
    obj.setParent(parent);
    this.objects.set(def.id, obj);
    this.version++;
    return obj;
  }

  removeObject(id: string): boolean {
    const obj = this.objects.get(id);
    if (!obj) return false;
    obj.setParent(null);
    this.objects.delete(id);
    this.version++;
    return true;
  }

  getObject(id: string): MeshObject | undefined {
    return this.objects.get(id);
  }

  meshObjects(): MeshObject[] {
    return [...this.objects.values()];
  }

  getLight(id: string): LightDefinition | undefined {
    return this.lights.find((l) => l.id === id);
  }

  /** World-space bounding sphere over all meshes, derived from world AABBs. */
  boundingSphere(): { center: Vector3; radius: number } {
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const obj of this.objects.values()) {
      const { min, max } = obj.worldBounds();
      minX = Math.min(minX, min.x);
      minY = Math.min(minY, min.y);
      minZ = Math.min(minZ, min.z);
      maxX = Math.max(maxX, max.x);
      maxY = Math.max(maxY, max.y);
      maxZ = Math.max(maxZ, max.z);
    }
    if (!Number.isFinite(minX)) return { center: Vector3.ZERO, radius: 1 };
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const radius = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2;
    return { center, radius: Math.max(radius, 1e-3) };
  }

  stats(): { objectCount: number; triangleCount: number } {
    let triangleCount = 0;
    for (const o of this.objects.values()) triangleCount += o.mesh.indices.length / 3;
    return { objectCount: this.objects.size, triangleCount };
  }
}

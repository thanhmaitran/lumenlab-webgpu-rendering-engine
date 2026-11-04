import { describe, expect, it } from "vitest";
import {
  Matrix4,
  Quaternion,
  SCENE_PRESETS,
  Scene,
  SceneNode,
  Vector3,
  degToRad,
  geometryStudioScene,
  intersectRayAabb,
  materialGalleryScene,
  pickObject,
  scaleTestScene,
  screenRay,
  validateMesh,
  type SceneDefinition,
} from "../src";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

function emptyScene(): Scene {
  return Scene.fromDefinition({
    id: "empty",
    name: "Empty",
    objects: [],
    lights: [],
    camera: { position: [0, 0, 5], target: [0, 0, 0], fovYDegrees: 60, near: 0.1, far: 50 },
    ambient: [0, 0, 0],
    background: [0, 0, 0],
  });
}

function cubeDef(id: string, position: [number, number, number], size = 1) {
  return {
    id,
    name: id,
    geometry: { type: "cube" as const, size },
    material: {},
    position,
  };
}

describe("scene graph transforms", () => {
  it("composes parent and child translation", () => {
    const parent = new SceneNode("p");
    const child = new SceneNode("c");
    parent.position = v(1, 0, 0);
    child.position = v(0, 2, 0);
    child.setParent(parent);
    expect(child.worldMatrix().transformPoint(Vector3.ZERO).toArray()).toEqual([1, 2, 0]);
  });

  it("applies the parent's scale to the child's offset (parent * child order)", () => {
    const parent = new SceneNode("p");
    const child = new SceneNode("c");
    parent.position = v(1, 0, 0);
    parent.scale = v(2, 2, 2);
    child.position = v(0, 2, 0);
    child.setParent(parent);
    expect(child.worldMatrix().transformPoint(Vector3.ZERO).toArray()).toEqual([1, 4, 0]);
  });

  it("applies the parent's rotation to the child's offset", () => {
    const parent = new SceneNode("p");
    const child = new SceneNode("c");
    parent.rotation = Quaternion.fromAxisAngle(Vector3.UNIT_Y, degToRad(90));
    child.position = v(1, 0, 0);
    child.setParent(parent);
    const p = child.worldMatrix().transformPoint(Vector3.ZERO);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(-1, 5); // +X rotated 90° about +Y lands on -Z (right-handed)
  });

  it("invalidates a child's cached world matrix when the parent moves", () => {
    const parent = new SceneNode("p");
    const child = new SceneNode("c");
    child.position = v(0, 1, 0);
    child.setParent(parent);
    expect(child.worldMatrix().transformPoint(Vector3.ZERO).toArray()).toEqual([0, 1, 0]);
    parent.position = v(5, 0, 0);
    expect(child.worldMatrix().transformPoint(Vector3.ZERO).toArray()).toEqual([5, 1, 0]);
  });

  it("re-parenting moves the node between children lists", () => {
    const a = new SceneNode("a");
    const b = new SceneNode("b");
    const child = new SceneNode("c");
    child.setParent(a);
    expect(a.children).toContain(child);
    child.setParent(b);
    expect(a.children).not.toContain(child);
    expect(b.children).toContain(child);
    expect(child.parent).toBe(b);
    child.setParent(null);
    expect(b.children).toHaveLength(0);
  });

  it("rejects cycles", () => {
    const a = new SceneNode("a");
    const b = new SceneNode("b");
    b.setParent(a);
    expect(() => a.setParent(b)).toThrow(/descendant/);
    expect(() => a.setParent(a)).toThrow(/descendant/);
  });

  it("traverses depth-first including the node itself", () => {
    const root = new SceneNode("root");
    const a = new SceneNode("a");
    const b = new SceneNode("b");
    const a1 = new SceneNode("a1");
    a.setParent(root);
    b.setParent(root);
    a1.setParent(a);
    expect([...root.traverse()].map((n) => n.id)).toEqual(["root", "a", "a1", "b"]);
  });

  it("normal matrix of a non-uniform scale keeps normals perpendicular to the surface", () => {
    const node = new SceneNode("n");
    node.scale = v(4, 1, 1);
    // A 45° surface in the XY plane: tangent (1,1,0), normal (-1,1,0).
    const tangent = node.worldMatrix().transformDirection(v(1, 1, 0));
    const normal = node.normalMatrix().transformDirection(v(-1, 1, 0));
    expect(tangent.dot(normal)).toBeCloseTo(0, 5);
    expect(node.worldMatrix().multiply(Matrix4.identity()).isFinite()).toBe(true);
  });
});

describe("Scene", () => {
  it("builds objects, lights and camera from a definition", () => {
    const def = geometryStudioScene();
    const scene = Scene.fromDefinition(def);
    expect(scene.meshObjects().map((o) => o.id)).toEqual(def.objects.map((o) => o.id));
    expect(scene.lights).toHaveLength(def.lights.length);
    expect(scene.camera.position.toArray()).toEqual(def.camera.position);
    expect(scene.getLight("key-light")?.type).toBe("directional");
  });

  it("does not alias the definition's lights", () => {
    const def = geometryStudioScene();
    const scene = Scene.fromDefinition(def);
    scene.lights[0].intensity = 99;
    expect(def.lights[0].intensity).not.toBe(99);
  });

  it("rejects duplicate object ids", () => {
    const scene = emptyScene();
    scene.addObject(cubeDef("a", [0, 0, 0]));
    expect(() => scene.addObject(cubeDef("a", [1, 0, 0]))).toThrow(/Duplicate object id/);
  });

  it("bumps `version` on add and remove so the renderer resyncs GPU resources", () => {
    const scene = emptyScene();
    const v0 = scene.version;
    scene.addObject(cubeDef("a", [0, 0, 0]));
    expect(scene.version).toBe(v0 + 1);
    expect(scene.removeObject("a")).toBe(true);
    expect(scene.version).toBe(v0 + 2);
    expect(scene.removeObject("a")).toBe(false);
    expect(scene.version).toBe(v0 + 2);
    expect(scene.getObject("a")).toBeUndefined();
  });

  it("converts definition rotations from degrees", () => {
    const scene = emptyScene();
    const obj = scene.addObject({ ...cubeDef("a", [0, 0, 0]), rotationDegrees: [0, 90, 0] });
    const p = obj.worldMatrix().transformPoint(v(1, 0, 0));
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(-1, 5);
  });

  it("computes world bounds from the transform", () => {
    const scene = emptyScene();
    const obj = scene.addObject({ ...cubeDef("a", [10, 0, 0], 2), scale: [2, 1, 1] });
    const { min, max } = obj.worldBounds();
    expect(min.toArray()).toEqual([8, -1, -1]);
    expect(max.toArray()).toEqual([12, 1, 1]);
  });

  it("bounding sphere encloses every object", () => {
    const scene = emptyScene();
    scene.addObject(cubeDef("a", [-5, 0, 0]));
    scene.addObject(cubeDef("b", [5, 0, 0]));
    const { center, radius } = scene.boundingSphere();
    expect(center.x).toBeCloseTo(0, 5);
    for (const obj of scene.meshObjects()) {
      const { min, max } = obj.worldBounds();
      for (const corner of [min, max])
        expect(corner.distanceTo(center)).toBeLessThanOrEqual(radius + 1e-5);
    }
  });

  it("returns a safe bounding sphere for an empty scene", () => {
    const { radius } = emptyScene().boundingSphere();
    expect(radius).toBeGreaterThan(0);
  });

  it("counts objects and triangles", () => {
    const scene = emptyScene();
    scene.addObject(cubeDef("a", [0, 0, 0]));
    scene.addObject(cubeDef("b", [2, 0, 0]));
    expect(scene.stats()).toEqual({ objectCount: 2, triangleCount: 24 });
  });

  it("material edits sanitise their input", () => {
    const scene = emptyScene();
    const obj = scene.addObject(cubeDef("a", [0, 0, 0]));
    obj.setMaterial({ roughness: 7, metalness: -3 });
    expect(obj.material.roughness).toBeLessThanOrEqual(1);
    expect(obj.material.metalness).toBeGreaterThanOrEqual(0);
  });
});

describe("scene presets", () => {
  const presets: Array<[string, SceneDefinition]> = [
    ["geometry-studio", geometryStudioScene()],
    ["material-gallery", materialGalleryScene()],
    ["scale-test 25", scaleTestScene(25)],
  ];

  it.each(presets)("%s has unique ids, valid meshes and at least one light", (_name, def) => {
    const ids = def.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(def.lights.length).toBeGreaterThan(0);
    const scene = Scene.fromDefinition(def);
    for (const obj of scene.meshObjects()) expect(validateMesh(obj.mesh).valid).toBe(true);
  });

  it("registers the three presets used by the workbench", () => {
    expect(Object.keys(SCENE_PRESETS).sort()).toEqual([
      "geometry-studio",
      "material-gallery",
      "scale-test",
    ]);
    for (const make of Object.values(SCENE_PRESETS))
      expect(make().objects.length).toBeGreaterThan(0);
  });

  it("scale test is deterministic and contains count objects plus the ground", () => {
    const a = scaleTestScene(40);
    const b = scaleTestScene(40);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.objects).toHaveLength(41);
    expect(scaleTestScene(0).objects).toHaveLength(2); // clamped to at least one object
  });
});

describe("picking", () => {
  it("builds a ray through the screen centre along the camera's forward axis", () => {
    const scene = emptyScene();
    scene.camera.setAspect(1, 1);
    const ray = screenRay(scene.camera, 0, 0);
    expect(ray).not.toBeNull();
    expect(ray!.direction.x).toBeCloseTo(0, 5);
    expect(ray!.direction.y).toBeCloseTo(0, 5);
    expect(ray!.direction.z).toBeCloseTo(-1, 5);
    expect(ray!.origin.z).toBeCloseTo(5 - scene.camera.near, 4); // starts on the near plane
  });

  it("slab test: hit, miss, inside, and parallel-outside", () => {
    const min = v(-1, -1, -1);
    const max = v(1, 1, 1);
    expect(intersectRayAabb({ origin: v(0, 0, 5), direction: v(0, 0, -1) }, min, max)).toBeCloseTo(
      4,
      6,
    );
    expect(intersectRayAabb({ origin: v(3, 0, 5), direction: v(0, 0, -1) }, min, max)).toBeNull();
    expect(intersectRayAabb({ origin: v(0, 0, 0), direction: v(0, 0, -1) }, min, max)).toBe(0);
    expect(intersectRayAabb({ origin: v(0, 2, 5), direction: v(1, 0, 0) }, min, max)).toBeNull();
    // pointing away from the box
    expect(intersectRayAabb({ origin: v(0, 0, 5), direction: v(0, 0, 1) }, min, max)).toBeNull();
  });

  it("selects the object under the cursor and nothing in empty space", () => {
    const scene = emptyScene();
    scene.addObject(cubeDef("target", [0, 0, 0]));
    scene.camera.setAspect(1, 1);
    expect(pickObject(scene, 0, 0)).toBe("target");
    expect(pickObject(scene, 0.95, 0.95)).toBeNull();
  });

  it("returns the nearest of several objects along the ray", () => {
    const scene = emptyScene();
    scene.addObject(cubeDef("far", [0, 0, -3]));
    scene.addObject(cubeDef("near", [0, 0, 1]));
    scene.camera.setAspect(1, 1);
    expect(pickObject(scene, 0, 0)).toBe("near");
  });

  it("follows an object when it is moved", () => {
    const scene = emptyScene();
    const cube = scene.addObject(cubeDef("c", [0, 0, 0]));
    scene.camera.setAspect(1, 1);
    expect(pickObject(scene, 0, 0)).toBe("c");
    cube.position = v(0, 3, 0);
    expect(pickObject(scene, 0, 0)).toBeNull();
  });
});

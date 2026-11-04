import { Matrix4 } from "../math/matrix4";
import { Quaternion } from "../math/quaternion";
import { Vector3 } from "../math/vector3";

export class SceneNode {
  private static _epoch = 1;

  /**
   * Global content epoch. It increments whenever any node transform, hierarchy link, or mesh
   * appearance changes, which lets renderers cheaply detect "nothing changed since last frame".
   */
  static get epoch(): number {
    return SceneNode._epoch;
  }

  /** Mark scene content as changed. */
  static touch(): void {
    SceneNode._epoch++;
  }

  readonly id: string;
  name: string;
  private _position = Vector3.ZERO;
  private _rotation = Quaternion.IDENTITY;
  private _scale = Vector3.ONE;
  private _parent: SceneNode | null = null;
  private readonly _children: SceneNode[] = [];
  private _localDirty = true;
  private _local = Matrix4.identity();
  private _world: Matrix4 | null = null;
  private _worldEpoch = 0;
  private _normal: Matrix4 | null = null;
  private _normalEpoch = 0;

  constructor(id: string, name = id) {
    this.id = id;
    this.name = name;
  }

  get position(): Vector3 {
    return this._position;
  }
  set position(v: Vector3) {
    this._position = v;
    this._localDirty = true;
    SceneNode.touch();
  }

  get rotation(): Quaternion {
    return this._rotation;
  }
  set rotation(q: Quaternion) {
    this._rotation = q.normalize();
    this._localDirty = true;
    SceneNode.touch();
  }

  get scale(): Vector3 {
    return this._scale;
  }
  set scale(v: Vector3) {
    this._scale = v;
    this._localDirty = true;
    SceneNode.touch();
  }

  get parent(): SceneNode | null {
    return this._parent;
  }

  get children(): readonly SceneNode[] {
    return this._children;
  }

  /** Re-parent this node. Throws if the operation would create a cycle. */
  setParent(parent: SceneNode | null): void {
    if (parent === this._parent) return;
    for (let p: SceneNode | null = parent; p; p = p._parent) {
      if (p === this) throw new Error(`Cannot parent node "${this.id}" to its own descendant`);
    }
    if (this._parent) {
      const i = this._parent._children.indexOf(this);
      if (i >= 0) this._parent._children.splice(i, 1);
    }
    this._parent = parent;
    parent?._children.push(this);
    SceneNode.touch();
  }

  localMatrix(): Matrix4 {
    if (this._localDirty) {
      this._local = Matrix4.compose(this._position, this._rotation, this._scale);
      this._localDirty = false;
    }
    return this._local;
  }

  /** World matrix = parent.world * local, cached until the next epoch change. */
  worldMatrix(): Matrix4 {
    if (this._world && this._worldEpoch === SceneNode._epoch) return this._world;
    const local = this.localMatrix();
    this._world = this._parent ? this._parent.worldMatrix().multiply(local) : local;
    this._worldEpoch = SceneNode._epoch;
    return this._world;
  }

  /** Inverse-transpose of the world matrix, cached per epoch. */
  normalMatrix(): Matrix4 {
    if (this._normal && this._normalEpoch === SceneNode._epoch) return this._normal;
    this._normal = this.worldMatrix().normalMatrix();
    this._normalEpoch = SceneNode._epoch;
    return this._normal;
  }

  *traverse(): Generator<SceneNode> {
    yield this;
    for (const child of this._children) yield* child.traverse();
  }
}

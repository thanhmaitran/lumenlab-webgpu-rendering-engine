import { Section, Row, Slider, Toggle, Vec3Field } from "../components/controls";
import { hexToLinearRgb, linearRgbToHex } from "../state/color";
import { formatInt } from "../state/format";
import { useStore, useWorkbench } from "../state/useWorkbench";
import type { MaterialParams } from "@lumenlab/engine";

function ColorInput(props: {
  label: string;
  value: readonly [number, number, number];
  onChange: (rgb: [number, number, number]) => void;
}) {
  return (
    <Row label={props.label} hint="Edited in sRGB, stored as linear RGB">
      <input
        type="color"
        className="color"
        aria-label={props.label}
        value={linearRgbToHex(props.value)}
        onChange={(e) => {
          const rgb = hexToLinearRgb(e.target.value);
          if (rgb) props.onChange(rgb);
        }}
      />
      <output className="mono">{linearRgbToHex(props.value)}</output>
    </Row>
  );
}

export function InspectorPanel() {
  const store = useStore();
  const s = useWorkbench();

  if (s.status.kind !== "ready") return <p className="empty">The engine is not running.</p>;

  if (s.selectedObject) {
    const o = s.selectedObject;
    const patchMaterial = (p: Partial<MaterialParams>) => store.setMaterial(o.id, p);
    return (
      <div data-testid="inspector-object">
        <Section
          title={o.name}
          aside={
            <span className="muted mono">
              {o.geometry} · {formatInt(o.triangles)} tri
            </span>
          }
        >
          <Toggle
            label="Cast shadow"
            checked={o.castShadow}
            onChange={(v) => store.setObjectFlags(o.id, { castShadow: v })}
          />
          <Toggle
            label="Receive shadow"
            checked={o.receiveShadow}
            onChange={(v) => store.setObjectFlags(o.id, { receiveShadow: v })}
          />
        </Section>
        <Section title="Transform">
          <Vec3Field
            label="Position"
            value={o.position}
            step={0.1}
            onChange={(position) => store.setTransform(o.id, { position })}
          />
          <Vec3Field
            label="Rotation °"
            value={o.rotationDegrees}
            step={5}
            onChange={(rotationDegrees) => store.setTransform(o.id, { rotationDegrees })}
          />
          <Vec3Field
            label="Scale"
            value={o.scale}
            step={0.1}
            min={0.01}
            onChange={(scale) => store.setTransform(o.id, { scale })}
          />
        </Section>
        <Section title="Material">
          <ColorInput
            label="Base color"
            value={o.material.baseColor}
            onChange={(baseColor) => patchMaterial({ baseColor })}
          />
          <Slider
            label="Roughness"
            value={o.material.roughness}
            min={0}
            max={1}
            onChange={(roughness) => patchMaterial({ roughness })}
          />
          <Slider
            label="Metalness"
            value={o.material.metalness}
            min={0}
            max={1}
            onChange={(metalness) => patchMaterial({ metalness })}
          />
          <ColorInput
            label="Emissive"
            value={o.material.emissive}
            onChange={(emissive) => patchMaterial({ emissive })}
          />
          <Slider
            label="Checker mix"
            hint="Blend of the procedural checker texture into the base color"
            value={o.material.checker}
            min={0}
            max={1}
            onChange={(checker) => patchMaterial({ checker })}
          />
          <Slider
            label="UV scale"
            value={o.material.uvScale}
            min={1}
            max={32}
            step={1}
            digits={0}
            onChange={(uvScale) => patchMaterial({ uvScale })}
          />
        </Section>
      </div>
    );
  }

  if (s.selectedLight) {
    const l = s.selectedLight;
    return (
      <div data-testid="inspector-light">
        <Section title={l.name ?? l.id} aside={<span className="muted mono">{l.type}</span>}>
          <Slider
            label="Intensity"
            value={l.intensity}
            min={0}
            max={l.type === "point" ? 40 : 10}
            step={0.1}
            digits={1}
            onChange={(intensity) => store.setLight(l.id, { intensity })}
          />
          <ColorInput
            label="Color"
            value={l.color}
            onChange={(color) => store.setLight(l.id, { color })}
          />
          {l.type === "directional" && (
            <Vec3Field
              label="Direction"
              value={l.direction}
              step={0.1}
              onChange={(direction) => store.setLight(l.id, { direction })}
            />
          )}
          {l.type === "point" && (
            <p className="muted small">
              Position {l.position.map((v) => v.toFixed(1)).join(", ")} · range {l.range}
            </p>
          )}
        </Section>
      </div>
    );
  }

  if (s.selectionKind === "camera" && s.camera) {
    const c = s.camera;
    return (
      <div data-testid="inspector-camera">
        <Section title="Camera">
          <Slider
            label="Field of view"
            value={c.fovYDegrees}
            min={20}
            max={100}
            step={1}
            digits={0}
            unit="°"
            onChange={(v) => store.setFov(v)}
          />
          <dl className="kv mono">
            <dt>Distance</dt>
            <dd>{c.distance.toFixed(2)}</dd>
            <dt>Azimuth</dt>
            <dd>{c.azimuthDegrees.toFixed(1)}°</dd>
            <dt>Polar</dt>
            <dd>{c.polarDegrees.toFixed(1)}°</dd>
          </dl>
          <button type="button" className="btn" onClick={() => store.resetCamera()}>
            Reset camera
          </button>
        </Section>
      </div>
    );
  }

  return (
    <p className="empty" data-testid="inspector-empty">
      Select an object in the viewport or the hierarchy to edit its transform and material.
    </p>
  );
}

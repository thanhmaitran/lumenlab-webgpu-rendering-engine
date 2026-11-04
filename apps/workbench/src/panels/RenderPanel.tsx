import type { RenderMode, RenderSettings } from "@lumenlab/engine";
import { Section, Segmented, Slider, Toggle } from "../components/controls";
import { useStore, useWorkbench } from "../state/useWorkbench";

const MODES: ReadonlyArray<{ value: RenderMode; label: string; title: string }> = [
  { value: "lit", label: "Lit", title: "Physically-inspired shading with shadows" },
  { value: "wireframe", label: "Wire", title: "Triangle edges" },
  { value: "normals", label: "Normals", title: "World-space normals as colour" },
  { value: "depth", label: "Depth", title: "Linear depth" },
  { value: "shadow", label: "Shadow", title: "Shadow visibility visualisation" },
];

const SHADOW_SIZES: RenderSettings["shadowMapSize"][] = [512, 1024, 2048, 4096];

export function RenderPanel() {
  const store = useStore();
  const s = useWorkbench();
  const { settings } = s;
  const disabled = s.status.kind !== "ready";
  return (
    <div data-testid="render-panel" className={disabled ? "is-disabled" : ""}>
      <Section title="View mode">
        <Segmented
          ariaLabel="Render view mode"
          value={settings.mode}
          options={MODES}
          onChange={(mode) => store.setRenderSettings({ mode })}
        />
        <p className="muted small">
          Diagnostic modes show what the renderer actually computes, not a recolouring of the lit
          image.
        </p>
      </Section>
      <Section title="Shadows">
        <Toggle
          label="Shadow mapping"
          checked={settings.shadowsEnabled}
          onChange={(shadowsEnabled) => store.setRenderSettings({ shadowsEnabled })}
        />
        <label className="row">
          <span className="row__label">Shadow map</span>
          <span className="row__control">
            <select
              value={settings.shadowMapSize}
              aria-label="Shadow map size"
              onChange={(e) =>
                store.setRenderSettings({
                  shadowMapSize: Number(e.target.value) as RenderSettings["shadowMapSize"],
                })
              }
            >
              {SHADOW_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} × {n}
                </option>
              ))}
            </select>
          </span>
        </label>
      </Section>
      <Section title="Resolution">
        <Slider
          label="Render scale"
          value={settings.renderScale}
          min={0.25}
          max={2}
          step={0.25}
          digits={2}
          unit="×"
          hint="Multiplier on the canvas backing-store resolution"
          onChange={(renderScale) => store.setRenderSettings({ renderScale })}
        />
        <p className="muted small mono">
          Backing store {s.renderSize ? `${s.renderSize.width} × ${s.renderSize.height}` : "—"} px
        </p>
      </Section>
    </div>
  );
}

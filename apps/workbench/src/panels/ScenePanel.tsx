import { PRESET_OPTIONS } from "../state/workbenchStore";
import { formatInt } from "../state/format";
import { useStore, useWorkbench } from "../state/useWorkbench";
import type { ScenePresetId } from "@lumenlab/engine";

const ICON: Record<string, string> = { cube: "▣", sphere: "●", plane: "▭", torus: "◎" };

export function ScenePanel() {
  const store = useStore();
  const s = useWorkbench();
  const ready = s.status.kind === "ready";
  return (
    <aside className="panel panel--left" aria-label="Scene hierarchy">
      <header className="panel__head">
        <h2>Scene</h2>
        <span className="muted mono">
          {formatInt(s.objectCount)} obj · {formatInt(s.triangleCount)} tri
        </span>
      </header>
      <div className="panel__body">
        <label className="field">
          <span className="field__label">Preset</span>
          <select
            value={s.presetId}
            disabled={!ready || s.lab.phase === "running"}
            aria-label="Scene preset"
            onChange={(e) => store.loadPreset(e.target.value as ScenePresetId)}
          >
            {PRESET_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <h3 className="tree__title">Hierarchy</h3>
        <ul className="tree" role="tree" data-testid="scene-tree">
          <li role="treeitem" aria-selected={s.selectionKind === "camera"}>
            <button
              type="button"
              className={`tree__item ${s.selectionKind === "camera" ? "is-selected" : ""}`}
              onClick={() => store.selectCamera()}
              disabled={!ready}
            >
              <span className="tree__icon">◈</span> Camera
            </button>
          </li>
          {s.lights.map((l) => (
            <li key={l.id} role="treeitem" aria-selected={s.selectedLight?.id === l.id}>
              <button
                type="button"
                className={`tree__item ${s.selectedLight?.id === l.id ? "is-selected" : ""}`}
                onClick={() => store.selectLight(l.id)}
              >
                <span className="tree__icon">☀</span> {l.name}
                <span className="tree__meta">{l.type}</span>
              </button>
            </li>
          ))}
          {s.objects.map((o) => (
            <li key={o.id} role="treeitem" aria-selected={s.selectedObject?.id === o.id}>
              <button
                type="button"
                className={`tree__item ${s.selectedObject?.id === o.id ? "is-selected" : ""}`}
                onClick={() => store.selectObject(o.id)}
                data-object-id={o.id}
              >
                <span className="tree__icon">{ICON[o.geometry] ?? "▣"}</span> {o.name}
                <span className="tree__meta">{formatInt(o.triangles)} tri</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

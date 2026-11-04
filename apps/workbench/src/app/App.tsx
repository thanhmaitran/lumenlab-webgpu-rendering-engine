import { useState } from "react";
import { Viewport } from "../components/Viewport";
import { DiagnosticsPanel } from "../panels/DiagnosticsPanel";
import { InspectorPanel } from "../panels/InspectorPanel";
import { LabPanel } from "../panels/LabPanel";
import { RenderPanel } from "../panels/RenderPanel";
import { ScenePanel } from "../panels/ScenePanel";
import { Header } from "./Header";

const TABS = [
  { id: "inspect", label: "Inspect" },
  { id: "render", label: "Render" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "lab", label: "Perf Lab" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App() {
  const [tab, setTab] = useState<TabId>("inspect");
  return (
    <div className="app">
      <Header />
      <main className="workspace">
        <ScenePanel />
        <Viewport />
        <aside className="panel panel--right" aria-label="Inspector">
          <div className="tabs" role="tablist" aria-label="Sidebar">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                className={tab === t.id ? "is-active" : ""}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="panel__body"
            role="tabpanel"
            id={`tabpanel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "inspect" && <InspectorPanel />}
            {tab === "render" && <RenderPanel />}
            {tab === "diagnostics" && <DiagnosticsPanel />}
            {tab === "lab" && <LabPanel />}
          </div>
        </aside>
      </main>
    </div>
  );
}

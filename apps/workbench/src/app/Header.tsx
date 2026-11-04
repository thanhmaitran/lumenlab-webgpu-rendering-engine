import { formatMs } from "../state/format";
import { useWorkbench } from "../state/useWorkbench";

const STATUS_LABEL: Record<string, string> = {
  initializing: "INITIALIZING",
  ready: "GPU READY",
  unsupported: "WEBGPU UNAVAILABLE",
  lost: "DEVICE LOST",
};

/** GPU pass time with its unit, or an em dash when no sample has arrived yet. */
function gpuLabel(ms: number | null | undefined): string {
  const text = formatMs(ms, 2);
  return text === "—" ? text : `${text} ms`;
}

export function Header() {
  const s = useWorkbench();
  const kind = s.status.kind;
  const adapter = s.adapter
    ? [s.adapter.vendor, s.adapter.architecture, s.adapter.device].filter(Boolean).join(" ")
    : "";
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          ⬡
        </span>
        <div>
          <h1>LUMENLAB</h1>
          <p>REAL-TIME RENDERING WORKBENCH</p>
        </div>
      </div>
      <div className="metrics">
        <div className="metric">
          <span className="metric__label">STATUS</span>
          <span className={`metric__value pill pill--${kind}`} data-testid="gpu-status">
            {STATUS_LABEL[kind]}
          </span>
          {adapter && <span className="metric__sub mono">{adapter}</span>}
        </div>
        <div className="metric">
          <span className="metric__label">SCENE</span>
          <span className="metric__value">{s.sceneName || "—"}</span>
        </div>
        <div className="metric">
          <span className="metric__label">RENDER SCALE</span>
          <span className="metric__value mono">{Math.round(s.settings.renderScale * 100)}%</span>
        </div>
        <div className="metric">
          <span className="metric__label">FRAME TIME</span>
          <span className="metric__value mono" data-testid="frame-time">
            {formatMs(s.timing?.intervalMedianMs, 1)} ms
          </span>
          <span className="metric__sub mono">
            CPU {formatMs(s.stats?.cpuMs, 2)} ms · GPU{" "}
            {s.gpuTiming ? gpuLabel(s.stats?.gpuMs) : "n/a"}
          </span>
        </div>
      </div>
    </header>
  );
}

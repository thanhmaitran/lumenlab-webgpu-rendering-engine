import { Section, Stat } from "../components/controls";
import { formatBytes, formatInt, formatMs } from "../state/format";
import { useWorkbench } from "../state/useWorkbench";

export function DiagnosticsPanel() {
  const s = useWorkbench();
  const stats = s.stats;
  const t = s.timing;
  const a = s.adapter;
  return (
    <div data-testid="diagnostics-panel">
      <Section title="Frame">
        <div className="stats">
          <Stat
            label="Frame interval"
            value={formatMs(t?.intervalMedianMs)}
            unit=" ms"
            title="Median requestAnimationFrame interval (display-paced)"
          />
          <Stat label="p95 interval" value={formatMs(t?.intervalP95Ms)} unit=" ms" />
          <Stat label="FPS" value={t && t.fps > 0 ? t.fps.toFixed(0) : "—"} />
          <Stat
            label="CPU submit"
            value={formatMs(stats?.cpuMs)}
            unit=" ms"
            title="Encode + submit time of the last frame"
          />
          <Stat
            label="GPU time"
            value={s.gpuTiming ? formatMs(stats?.gpuMs) : "n/a"}
            title={
              s.gpuTiming
                ? "Timestamp queries around the render passes"
                : "timestamp-query is not available on this adapter"
            }
            unit=" ms"
          />
        </div>
      </Section>
      <Section title="Workload (last frame)">
        <div className="stats">
          <Stat label="Draw calls" value={formatInt(stats?.drawCalls)} />
          <Stat label="Shadow draws" value={formatInt(stats?.shadowDrawCalls)} />
          <Stat label="Triangles" value={formatInt(stats?.triangles)} />
          <Stat label="Objects" value={formatInt(stats?.objects)} />
          <Stat label="Upload" value={formatBytes(stats?.uploadedBytes)} />
          <Stat label="Target" value={stats ? `${stats.renderWidth}×${stats.renderHeight}` : "—"} />
        </div>
      </Section>
      <Section title="GPU resources">
        <div className="stats">
          <Stat label="Buffers" value={formatInt(s.resources?.buffers)} />
          <Stat label="Textures" value={formatInt(s.resources?.textures)} />
          <Stat label="Memory" value={formatBytes(s.resources?.bytes)} />
        </div>
      </Section>
      <Section title="Adapter">
        {a ? (
          <dl className="kv mono">
            <dt>Vendor</dt>
            <dd>{a.vendor || "—"}</dd>
            <dt>Architecture</dt>
            <dd>{a.architecture || "—"}</dd>
            <dt>Device</dt>
            <dd>{a.device || a.description || "—"}</dd>
            <dt>Fallback</dt>
            <dd>{a.isFallbackAdapter ? "yes (software)" : "no"}</dd>
            <dt>timestamp-query</dt>
            <dd>{s.gpuTiming ? "enabled" : "unavailable"}</dd>
          </dl>
        ) : (
          <p className="muted small">No adapter yet.</p>
        )}
      </Section>
      <Section title="Diagnostics log">
        {s.log.length === 0 ? (
          <p className="muted small">No GPU errors or warnings recorded.</p>
        ) : (
          <ul className="log mono" data-testid="diagnostics-log">
            {s.log
              .slice(-30)
              .reverse()
              .map((e, i) => (
                <li key={`${e.timestamp}-${i}`} className={`log__${e.severity}`}>
                  <span>{new Date(e.timestamp).toLocaleTimeString()}</span> {e.message}
                </li>
              ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

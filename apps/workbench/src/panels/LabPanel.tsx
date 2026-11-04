import { useMemo, useState } from "react";
import { aggregateResults, toCsv, toJson, toMarkdownReport } from "@lumenlab/benchmark";
import { Section } from "../components/controls";
import { downloadText } from "../state/download";
import { formatInt, formatMs } from "../state/format";
import { useStore, useWorkbench } from "../state/useWorkbench";

export function LabPanel() {
  const store = useStore();
  const s = useWorkbench();
  const scenarios = store.scenarios;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(scenarios.map((x) => x.id)));
  const lab = s.lab;
  const running = lab.phase === "running";
  const ready = s.status.kind === "ready";

  const aggregates = useMemo(
    () => (lab.file ? aggregateResults(lab.file.results) : []),
    [lab.file],
  );
  const percent =
    lab.totalFrames > 0
      ? Math.min(100, Math.round((lab.completedFrames / lab.totalFrames) * 100))
      : 0;
  const stamp = lab.file ? lab.file.generatedAt.replace(/[:.]/g, "-") : "";

  return (
    <div data-testid="lab-panel">
      <Section title="Scenarios">
        <ul className="checklist">
          {scenarios.map((sc) => (
            <li key={sc.id}>
              <label title={sc.description}>
                <input
                  type="checkbox"
                  checked={selected.has(sc.id)}
                  disabled={running}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(sc.id);
                    else next.delete(sc.id);
                    setSelected(next);
                  }}
                />
                <span>
                  <strong>{sc.name}</strong>
                  <small className="muted mono">
                    {" "}
                    {sc.resolution.width}×{sc.resolution.height} · {sc.runs}×{sc.measuredFrames}{" "}
                    frames
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Each run reloads the scene, pins the resolution, discards warm-up frames and records frame
          time as submit → GPU-idle. Running a benchmark replaces the current scene; it is restored
          afterwards.
        </p>
        <div className="btn-row">
          {!running ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={!ready || selected.size === 0}
              onClick={() => void store.runLab([...selected])}
              data-testid="run-benchmark"
            >
              Run benchmark
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => store.cancelLab()}>
              Cancel
            </button>
          )}
        </div>
        {running && (
          <div
            className="progress"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress__bar" style={{ width: `${percent}%` }} />
            <span className="mono small">
              {lab.progress
                ? `${lab.progress.scenarioId} · run ${lab.progress.run + 1}/${lab.progress.runs} · ${lab.progress.phase}`
                : "starting…"}{" "}
              · {percent}%
            </span>
          </div>
        )}
        {lab.phase === "aborted" && (
          <p className="muted small">Benchmark cancelled. No results were recorded.</p>
        )}
        {lab.phase === "error" && (
          <p className="error small" role="alert">
            {lab.error}
          </p>
        )}
      </Section>

      {lab.file && (
        <Section title="Results">
          {lab.file.results.some((r) => r.softwareAdapter) && (
            <p className="warning small" role="note">
              Measured on a software/fallback adapter. This validates the pipeline but does not
              represent hardware GPU performance.
            </p>
          )}
          <div className="table-wrap">
            <table className="table mono" data-testid="lab-results">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Draws</th>
                  <th>Median ms</th>
                  <th>p95 ms</th>
                  <th>CPU ms</th>
                  <th>GPU ms</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.map((a) => (
                  <tr key={a.scenarioId}>
                    <td>{a.scenarioId}</td>
                    <td>{formatInt(a.drawCalls)}</td>
                    <td>{formatMs(a.frameTimeMedianMs)}</td>
                    <td>{formatMs(a.frameTimeP95Ms)}</td>
                    <td>{formatMs(a.cpuTimeMedianMs)}</td>
                    <td>{a.gpuTimeMedianMs === null ? "n/a" : formatMs(a.gpuTimeMedianMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadText(
                  `lumenlab-benchmark-${stamp}.json`,
                  toJson(lab.file!),
                  "application/json",
                )
              }
            >
              Export JSON
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadText(
                  `lumenlab-benchmark-${stamp}.csv`,
                  toCsv(lab.file!.results),
                  "text/csv",
                )
              }
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn"
              onClick={() =>
                downloadText(
                  `lumenlab-benchmark-${stamp}.md`,
                  toMarkdownReport(lab.file!),
                  "text/markdown",
                )
              }
            >
              Export report
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

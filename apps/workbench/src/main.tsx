import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toCsv, toJson, toMarkdownReport, validateBenchmarkFile } from "@lumenlab/benchmark";
import { App } from "./app/App";
import { StoreContext } from "./state/useWorkbench";
import { WorkbenchStore } from "./state/workbenchStore";
import "./styles/app.css";

const store = new WorkbenchStore();

// `?debug` exposes the store for end-to-end tests and the CLI scripts (scripts/bench-cli.mjs).
if (new URLSearchParams(window.location.search).has("debug")) {
  window.__lumenlab = {
    store,
    report: { toCsv, toJson, toMarkdownReport, validateBenchmarkFile },
  };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);

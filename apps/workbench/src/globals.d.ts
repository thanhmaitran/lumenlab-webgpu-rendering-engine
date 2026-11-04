import type { toCsv, toJson, toMarkdownReport, validateBenchmarkFile } from "@lumenlab/benchmark";
import type { WorkbenchStore } from "./state/workbenchStore";

declare global {
  interface Window {
    /** Present only when the page is opened with `?debug`. */
    __lumenlab?: {
      store: WorkbenchStore;
      report: {
        toCsv: typeof toCsv;
        toJson: typeof toJson;
        toMarkdownReport: typeof toMarkdownReport;
        validateBenchmarkFile: typeof validateBenchmarkFile;
      };
    };
  }
}

export {};

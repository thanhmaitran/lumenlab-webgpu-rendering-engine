#!/usr/bin/env node
// Run the benchmark scenarios in a real browser and write JSON + CSV + Markdown results.
//
//   npm run bench -- [--scenarios a,b,c] [--out benchmarks/results] [--label my-gpu]
//                    [--runs N] [--warmup N] [--frames N] [--screenshot file.png]
//                    [--url http://localhost:5173] [--headed] [--build]
//   Software-GPU containers only: --software --offscreen-present --no-sandbox
//
// Numbers are only meaningful on the machine that produced them; the report records the browser,
// the adapter and whether it was a software adapter.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  launchBrowser,
  openWorkbench,
  parseArgs,
  ROOT,
  serveWorkbench,
  syncFrame,
} from "./lib/browser.mjs";

const args = parseArgs(process.argv.slice(2));
args["no-auto-sync"] = true; // never let the test shim add GPU work while measuring
const outDir = resolve(ROOT, typeof args.out === "string" ? args.out : "benchmarks/results");
const label = typeof args.label === "string" ? args.label.replace(/[^a-z0-9-_]/gi, "-") : "run";
const ids = typeof args.scenarios === "string" ? args.scenarios.split(",") : undefined;
const num = (v) => (typeof v === "string" ? Number(v) : undefined);

const server = await serveWorkbench(args);
const browser = await launchBrowser(args);
let exitCode = 0;
try {
  const { page } = await openWorkbench(browser, server.url, args, { width: 1600, height: 900 });
  await page.getByRole("tab", { name: "Perf Lab" }).click();

  // Optional workload overrides (e.g. a quick smoke run). They are recorded in the result file.
  await page.evaluate(
    ({ runs, warmup, frames }) => {
      for (const s of window.__lumenlab.store.scenarios) {
        if (runs) s.runs = runs;
        if (warmup !== undefined) s.warmupFrames = warmup;
        if (frames) s.measuredFrames = frames;
      }
    },
    { runs: num(args.runs), warmup: num(args.warmup), frames: num(args.frames) },
  );

  console.log(`Running ${ids ? ids.join(", ") : "all scenarios"} ...`);
  const started = Date.now();
  const handle = await page.evaluateHandle((chosen) => window.__lumenlab.store.runLab(chosen), ids);
  const timer = setInterval(async () => {
    const lab = await page.evaluate(() => {
      const l = window.__lumenlab.store.getState().lab;
      return { phase: l.phase, done: l.completedFrames, total: l.totalFrames };
    });
    process.stdout.write(
      `\r  ${lab.done}/${lab.total} frames (${Math.round((Date.now() - started) / 1000)} s)   `,
    );
  }, 2000);
  const file = await handle.jsonValue();
  clearInterval(timer);
  process.stdout.write("\n");
  if (!file) throw new Error("The benchmark did not produce a result file (aborted or errored).");

  const problems = await page.evaluate(
    (f) => window.__lumenlab.report.validateBenchmarkFile(f),
    file,
  );
  if (problems.length > 0)
    throw new Error(`Result file failed schema validation:\n${problems.join("\n")}`);

  const [json, csv, markdown] = await page.evaluate((f) => {
    const r = window.__lumenlab.report;
    return [r.toJson(f), r.toCsv(f.results), r.toMarkdownReport(f)];
  }, file);
  mkdirSync(outDir, { recursive: true });
  const stamp = file.generatedAt.replace(/[:.]/g, "-");
  const base = resolve(outDir, `${stamp}-${label}`);
  writeFileSync(`${base}.json`, json);
  writeFileSync(`${base}.csv`, csv);
  writeFileSync(`${base}.md`, markdown);
  console.log(`Wrote ${base}.{json,csv,md}`);

  if (typeof args.screenshot === "string") {
    await syncFrame(page, 500);
    await page.screenshot({ path: resolve(ROOT, args.screenshot) });
    console.log(`Wrote ${args.screenshot}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await browser.close();
  server.stop();
}
process.exit(exitCode);

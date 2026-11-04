import { expect, test } from "@playwright/test";
import { openWorkbench } from "./helpers";

test.describe("performance lab (requires a WebGPU adapter)", () => {
  test("runs a benchmark scenario and produces schema-valid, honestly labelled results", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const status = await openWorkbench(page);
    test.skip(status === "unsupported", "No WebGPU adapter available in this environment.");

    await page.getByRole("tab", { name: "Perf Lab" }).click();
    // Run only the small baseline so the test stays fast; the full matrix is run by scripts/run-benchmarks.ts.
    const boxes = page.locator('[data-testid="lab-panel"] input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) await boxes.nth(i).uncheck();
    await boxes.first().check();
    await page.evaluate(() => {
      // Shrink the workload for the test without changing what is being validated.
      for (const s of window.__lumenlab!.store.scenarios as unknown as Array<{
        runs: number;
        warmupFrames: number;
        measuredFrames: number;
      }>) {
        s.runs = 1;
        s.warmupFrames = 3;
        s.measuredFrames = 12;
      }
    });
    await page.getByTestId("run-benchmark").click();
    await expect(page.getByTestId("lab-results")).toBeVisible({ timeout: 120_000 });

    const file = await page.evaluate(() => window.__lumenlab!.store.getState().lab.file);
    expect(file).not.toBeNull();
    expect(file!.results).toHaveLength(1);
    const r = file!.results[0];
    expect(r.scenarioId).toBe("baseline-small");
    expect(r.measuredFrames).toBe(12);
    expect(r.canvasWidth).toBe(1280);
    expect(r.canvasHeight).toBe(720);
    expect(r.frameTimeMedianMs).toBeGreaterThan(0);
    expect(r.drawCalls).toBe(11);
    expect(file!.raw[r.runId].completionMs).toHaveLength(12);
    if (
      file!.environment.adapter.isFallbackAdapter ||
      /swiftshader/i.test(file!.environment.deviceLabel)
    ) {
      expect(r.softwareAdapter).toBe(true);
      await expect(page.getByRole("note")).toContainText("software");
    }
    // The viewport scene is restored afterwards.
    await expect(page.getByTestId("scene-tree")).toContainText("Cube");
  });
});

import { expect, test } from "@playwright/test";
import { canvasVariety, openWorkbench, shotCanvas } from "./helpers";

test.describe("workbench shell", () => {
  test("loads and shows either a running engine or a precise unsupported notice", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const status = await openWorkbench(page);
    if (status === "unsupported") {
      await expect(page.getByTestId("unsupported-notice")).toContainText("WebGPU is not available");
      await expect(page.getByTestId("unsupported-notice")).toContainText("does not fall back");
    } else {
      await expect(page.getByTestId("scene-tree")).toContainText("Cube");
    }
    expect(errors).toEqual([]);
  });
});

test.describe("renderer (requires a WebGPU adapter)", () => {
  test.beforeEach(async ({ page }) => {
    const status = await openWorkbench(page);
    test.skip(
      status === "unsupported",
      "No WebGPU adapter available in this environment; renderer tests skipped.",
    );
  });

  test("draws real geometry, not a blank canvas", async ({ page }) => {
    await page.waitForTimeout(500);
    const v = await canvasVariety(page);
    expect(v.distinctColours).toBeGreaterThan(12);
    expect(v.nonBackgroundFraction).toBeGreaterThan(0.05);
  });

  test("scene tree lists the objects and lights of the preset", async ({ page }) => {
    const tree = page.getByTestId("scene-tree");
    for (const name of ["Camera", "Key Light", "Fill Light", "Ground", "Cube", "Sphere", "Torus"]) {
      await expect(tree).toContainText(name);
    }
  });

  test("selecting an object opens the inspector and editing the material updates the engine", async ({
    page,
  }) => {
    await page.locator('[data-object-id="sphere"]').click();
    await expect(page.getByTestId("inspector-object")).toContainText("Sphere");
    const roughness = page.getByLabel("Roughness", { exact: true });
    await roughness.fill("0.9");
    const value = await page.evaluate(
      () => window.__lumenlab!.store.engine!.scene!.getObject("sphere")!.material.roughness,
    );
    expect(value).toBeCloseTo(0.9, 2);
  });

  test("editing a transform moves the object", async ({ page }) => {
    await page.locator('[data-object-id="cube"]').click();
    const x = page.getByLabel("Position X");
    await x.fill("3.5");
    const px = await page.evaluate(
      () => window.__lumenlab!.store.engine!.scene!.getObject("cube")!.position.x,
    );
    expect(px).toBeCloseTo(3.5, 3);
  });

  test("clicking an object in the viewport selects it", async ({ page }) => {
    // The sphere sits at the scene origin, near the viewport centre for the authored camera.
    const box = (await page.getByTestId("viewport-canvas").boundingBox())!;
    const picked = await page.evaluate(
      ({ w, h }) => {
        const store = window.__lumenlab!.store;
        // Sweep a coarse grid so the test does not depend on exact pixel placement.
        for (let y = 0.3; y < 0.8; y += 0.05) {
          for (let x = 0.3; x < 0.7; x += 0.05) {
            store.pick(x * w, y * h);
            if (store.getState().selectedObject) return store.getState().selectedObject!.id;
          }
        }
        return null;
      },
      { w: box.width, h: box.height },
    );
    expect(picked).not.toBeNull();
    await expect(page.getByTestId("inspector-object")).toBeVisible();
  });

  test("view modes change the rendered image", async ({ page }) => {
    await page.waitForTimeout(300);
    const lit = await shotCanvas(page);
    await page.getByRole("tab", { name: "Render" }).click();
    for (const mode of ["Normals", "Depth", "Wire"]) {
      await page.getByRole("radio", { name: mode, exact: true }).click();
      const mode_id = await page.evaluate(() => window.__lumenlab!.store.getState().settings.mode);
      expect(mode_id).toBe(mode === "Wire" ? "wireframe" : mode.toLowerCase());
      await page.waitForTimeout(300);
      const shot = await shotCanvas(page);
      expect(Buffer.compare(lit, shot)).not.toBe(0);
    }
  });

  test("shadow toggle changes the lit image", async ({ page }) => {
    await page.getByRole("tab", { name: "Render" }).click();
    await page.waitForTimeout(300);
    const withShadows = await shotCanvas(page);
    await page.getByLabel("Shadow mapping").uncheck();
    await page.waitForTimeout(300);
    const without = await shotCanvas(page);
    expect(Buffer.compare(withShadows, without)).not.toBe(0);
  });

  test("render scale changes the backing-store resolution", async ({ page }) => {
    const sizeAt = async () =>
      page.evaluate(() => {
        const c = document.querySelector<HTMLCanvasElement>('[data-testid="viewport-canvas"]')!;
        return c.width;
      });
    const full = await sizeAt();
    await page.getByRole("tab", { name: "Render" }).click();
    await page.getByLabel("Render scale").fill("0.5");
    await expect.poll(sizeAt).toBeLessThan(full);
  });

  test("diagnostics report real, non-zero workload numbers", async ({ page }) => {
    await page.getByRole("tab", { name: "Diagnostics" }).click();
    await page.waitForTimeout(800);
    const panel = page.getByTestId("diagnostics-panel");
    await expect(panel).toContainText("Draw calls");
    const { draws, objects } = await page.evaluate(() => {
      const stats = window.__lumenlab!.store.getState().stats;
      return { draws: stats?.drawCalls ?? 0, objects: stats?.objects ?? -1 };
    });
    // One main-pass draw per scene object; the Geometry Studio preset has four objects.
    expect(objects).toBeGreaterThanOrEqual(4);
    expect(draws).toBe(objects);
  });

  test("the render loop stops after the app unmounts", async ({ page }) => {
    await page.waitForTimeout(300);
    const running = await page.evaluate(() => window.__lumenlab!.store.engine!.running);
    expect(running).toBe(true);
    // Navigating away tears the React tree down via page unload; verify dispose() halts the loop.
    const stopped = await page.evaluate(() => {
      const engine = window.__lumenlab!.store.engine!;
      engine.dispose();
      return engine.running;
    });
    expect(stopped).toBe(false);
  });

  test("switching presets resizes resources without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.getByLabel("Scene preset").selectOption("scale-test");
    await expect(page.getByTestId("scene-tree")).toContainText("Object 99");
    await page.getByLabel("Scene preset").selectOption("material-gallery");
    await expect(page.getByTestId("scene-tree")).toContainText("Sphere r2 c4");
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
    const lost = await page.evaluate(() => window.__lumenlab!.store.engine!.deviceLost);
    expect(lost).toBe(false);
  });
});

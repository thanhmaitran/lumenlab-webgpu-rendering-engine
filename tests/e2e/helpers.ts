import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

const SHIM_PATH = fileURLToPath(new URL("./shims/offscreen-present.js", import.meta.url));

/**
 * PW_OFFSCREEN_PRESENT=1 redirects canvas presentation to an offscreen texture (see
 * shims/offscreen-present.js). Use it only in software-GPU containers where presenting kills the
 * device; on real GPUs leave it unset so the genuine presentation path is tested.
 */
export const usesOffscreenPresent = process.env.PW_OFFSCREEN_PRESENT === "1";

/** Open the workbench and wait until the engine has either started or reported it cannot. */
export async function openWorkbench(
  page: Page,
  query = "?debug",
): Promise<"ready" | "unsupported"> {
  if (usesOffscreenPresent) await page.addInitScript({ content: readFileSync(SHIM_PATH, "utf8") });
  await page.goto(`/${query}`);
  const status = page.getByTestId("gpu-status");
  await expect(status).not.toHaveText("INITIALIZING");
  return (await status.innerText()) === "GPU READY" ? "ready" : "unsupported";
}

/** Fraction of canvas pixels that differ from the most common colour, from a real screenshot. */
export async function canvasVariety(
  page: Page,
): Promise<{ distinctColours: number; nonBackgroundFraction: number }> {
  const shot = await shotCanvas(page);
  return page.evaluate(async (base64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${base64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const counts = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      // quantise to 5 bits per channel so noise does not inflate the colour count
      const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let top = 0;
    for (const n of counts.values()) top = Math.max(top, n);
    const total = data.length / 4;
    return { distinctColours: counts.size, nonBackgroundFraction: 1 - top / total };
  }, shot.toString("base64"));
}

/** Screenshot of the viewport canvas after making sure the shim overlay shows the latest frame. */
export async function shotCanvas(page: Page): Promise<Buffer> {
  if (usesOffscreenPresent) {
    await page.waitForTimeout(450); // let at least one fresh frame render, then paint it
    await page.evaluate(async () => {
      await (
        window as unknown as { __offscreenPresent?: { sync(): Promise<void> } }
      ).__offscreenPresent?.sync();
    });
  }
  return page.getByTestId("viewport-canvas").screenshot();
}

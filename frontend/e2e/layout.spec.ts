import { expect, test } from "@playwright/test";
import { allPages, contentPages } from "./helpers";

test("no page scrolls sideways at 320px", async ({ page, request }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 640 });
  const overflowing: string[] = [];
  for (const path of await allPages(request)) {
    await page.goto(path, { waitUntil: "networkidle" });
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (extra > 0) {
      overflowing.push(`${path}: ${extra}px`);
    }
  }
  expect(overflowing, overflowing.join("\n")).toEqual([]);
});

test("keyboard focus is always visible", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const missing: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const visible = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      return { visible, label: `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}"` };
    });
    if (info && !info.visible) {
      missing.push(info.label);
    }
  }
  expect(missing, `elements without a visible focus outline:\n${missing.join("\n")}`).toEqual([]);
});

test("the first Tab offers a skip link to the content", async ({ page }) => {
  await page.goto("/collections", { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("previews never start and transitions are effectively off", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000); // the hero preview would have started by now
    const playing = await page.evaluate(() =>
      Array.from(document.querySelectorAll("video")).filter((v) => v.currentSrc !== "" || !v.paused).length,
    );
    expect(playing).toBe(0);
    const longest = await page.evaluate(() =>
      Math.max(
        0,
        ...Array.from(document.querySelectorAll("a, button, [class*='transition'], [class*='animate']")).map((el) => {
          const s = getComputedStyle(el);
          return Math.max(...[s.transitionDuration, s.animationDuration].flatMap((d) => d.split(",").map((x) => parseFloat(x) * (x.includes("ms") ? 1 : 1000))));
        }),
      ),
    );
    expect(longest).toBeLessThanOrEqual(1); // 0.01 ms under reduced motion
  });
});

test("the player can be used with the keyboard alone", async ({ page, request }) => {
  const { watch } = await contentPages(request);
  test.skip(!watch, "the running stack has no public, ready video");
  await page.goto(watch!, { waitUntil: "networkidle" });
  const video = page.locator("video[controls]");
  await expect(video).toBeVisible();
  // Reach the player by Tab from the top of the page.
  for (let i = 0; i < 25 && !(await video.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press("Tab");
  }
  await expect(video).toBeFocused();
  await page.keyboard.press("Space");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused), { timeout: 15_000 }).toBe(true);
  await page.keyboard.press("Space");
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.paused)).toBe(true);
});

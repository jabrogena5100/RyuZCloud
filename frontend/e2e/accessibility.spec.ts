import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { allPages } from "./helpers";

// WCAG 2.1 A and AA rules, at a phone and a desktop width.
for (const width of [390, 1440]) {
  test(`axe finds no WCAG 2.1 A/AA violations at ${width}px`, async ({ page, request }) => {
    test.setTimeout(180_000); // every page in one test, so one report lists all violations
    await page.setViewportSize({ width, height: 900 });
    const report: string[] = [];
    for (const path of await allPages(request)) {
      await page.goto(path, { waitUntil: "networkidle" });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      for (const v of result.violations) {
        report.push(`${path}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
      }
    }
    expect(report, report.join("\n")).toEqual([]);
  });
}

test("the command palette is an accessible dialog and is axe-clean", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Search clips and pages" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Search clips and pages" })).toBeFocused();
  const result = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /search clips/i })).toBeFocused();
});

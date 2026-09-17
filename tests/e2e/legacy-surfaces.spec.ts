/**
 * Guards the staged removal of the old stylesheet.
 *
 * `globals.css` still carries the `dossier` and `studio` generations, scoped
 * under `.kova-legacy` with `:where()` so they keep their original specificity.
 * These checks fail if a legacy surface loses its scoping class, if a scoped
 * element rule starts out-specifying a page rule, or if the font chain breaks.
 *
 * Delete this file when the last `.kova-legacy` surface is rebuilt.
 */
import { expect, test } from "@playwright/test";

const LEGACY_ROUTES = ["/markets", "/markets/nvdge-nvdax", "/autopilot", "/campaigns/new"];

for (const route of LEGACY_ROUTES) {
  test(`legacy surface ${route} renders with its scoping class and no overflow`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error)));

    await page.goto(route);
    await page.waitForLoadState("networkidle");

    const roots = await page.locator(".kova-legacy").count();
    expect(roots, `${route} must carry a .kova-legacy root or its element rules vanish`).toBeGreaterThan(0);

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont, "the next/font variable chain must resolve, not fall back").toContain("Inter");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${route} horizontal overflow`).toBeLessThanOrEqual(1);

    expect(errors, `${route} console errors`).toEqual([]);
  });
}

test("the scoped legacy main rule does not out-specify .dossier-page", async ({ page }) => {
  await page.goto("/markets/nvdge-nvdax");
  const maxWidth = await page.locator("main.dossier-page").evaluate((el) => getComputedStyle(el).maxWidth);
  expect(maxWidth, "specificity regression: .dossier-page max-width:none was overridden").toBe("none");
});

test("the scoped legacy main rule does not out-specify .autopilot-page", async ({ page }) => {
  await page.goto("/autopilot");
  const maxWidth = await page.locator("main.autopilot-page").evaluate((el) => getComputedStyle(el).maxWidth);
  expect(maxWidth).toBe("920px");
});

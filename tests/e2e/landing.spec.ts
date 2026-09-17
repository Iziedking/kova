import { expect, test } from "@playwright/test";

test("the landing page presents all nine sections and a working launch path", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("KNOW THE");
  await expect(page.getByText("SOLANA · RAYDIUM CLMM · YOU OWN THE POSITION")).toBeVisible();

  for (const id of ["problem", "boundaries", "loop", "evidence"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }

  await expect(page.getByText("TVL is not exit depth.").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "What you get" })).toBeVisible();
  await expect(page.getByText(/No principal or return is guaranteed/)).toBeVisible();

  await page.getByRole("link", { name: "LAUNCH APP" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("the evidence console shows the real captured pool and invents no value", async ({ page }) => {
  await page.goto("/");
  const evidence = page.locator("#evidence");

  await expect(evidence.getByText("Ak7oAUqQ9jYu5YvfmDrtDC3WHi7BcN5Y4k8Bh3yk4B5e")).toBeVisible();
  await expect(evidence.getByText("5CEbueQnq1Ym2uSSx2xXds3jQAqT1BDnkA59RZobSPAG")).toBeVisible();
  await expect(evidence.getByText(/CAPTURED 15 SEP 2026 · READ ONLY/)).toBeVisible();

  // Spec section 14 forbids certainty language "without its precise evidence
  // qualification". A negated disclaimer ("no return is guaranteed") IS that
  // qualification, so only affirmative claims count as violations.
  const offenders = await page.evaluate(() => {
    const forbidden = /\b(safe|guaranteed|organic|AI-approved)\b/gi;
    const negatedNearby = /\b(no|not|never|cannot|without)\b[^.]{0,80}$/i;
    const text = document.body.innerText;
    const found: string[] = [];
    for (const match of text.matchAll(forbidden)) {
      const before = text.slice(Math.max(0, match.index - 90), match.index);
      if (!negatedNearby.test(before)) {
        found.push(text.slice(Math.max(0, match.index - 60), match.index + 30).replace(/\s+/g, " "));
      }
    }
    return found;
  });
  expect(offenders, "affirmative certainty claim on the landing page").toEqual([]);
});

test("the shared depth cross-section renders twice without duplicating DOM ids", async ({ page }) => {
  await page.goto("/");
  const duplicates = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    return ids.filter((id, i) => ids.indexOf(id) !== i);
  });
  expect(duplicates, "duplicate ids break aria-labelledby and url(#...) fills").toEqual([]);
});

test("the landing page has no horizontal overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("reduced motion leaves every section visible and never applies the smoke filter", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForTimeout(600);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("TVL is not exit depth.").first()).toBeVisible();
  await expect(page.getByText(/No principal or return is guaranteed/)).toBeVisible();

  const motionAttr = await page.evaluate(() => document.documentElement.hasAttribute("data-kova-motion"));
  expect(motionAttr, "the reveal driver must not hide content under reduced motion").toBe(false);

  // The smoke materialise is KOVA's signature, so its opt-out is what matters here.
  const smoke = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".kova-smoke")].map((el) => ({
      filter: getComputedStyle(el).filter,
      opacity: getComputedStyle(el).opacity,
    })),
  );
  expect(smoke.length, "the headline should use SmokeText").toBeGreaterThan(0);
  for (const state of smoke) {
    expect(state.filter, "no smoke filter under reduced motion").toBe("none");
    expect(Number(state.opacity), "headline must be fully opaque").toBe(1);
  }

  await context.close();
});

test("the headline settles crisp, with the smoke filter detached", async ({ page }) => {
  await page.goto("/");
  // Resting text must not stay behind an SVG filter or it renders soft forever.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".kova-smoke");
          return el ? getComputedStyle(el).filter : "missing";
        }),
      { timeout: 8000 },
    )
    .toBe("none");
});

test("the risk disclosure is reachable from the landing footer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Full risk disclosure" }).click();
  await expect(page).toHaveURL(/\/legal\/risk$/);
  await expect(page.getByRole("heading", { name: "Risk disclosure" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "You are exposed to both assets" })).toBeVisible();
});

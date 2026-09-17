import { expect, test } from "@playwright/test";

test("the login page offers email or wallet and states what a session does not grant", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Continue to KOVA" })).toBeVisible();
  await expect(page.getByRole("button", { name: /CONTINUE WITH EMAIL OR WALLET/ })).toBeVisible();
  await expect(
    page.getByText(/creates no wallet, prepares no transaction, requests no signature and moves no funds/i),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse markets first" })).toBeVisible();
});

test("the app home is readable while signed out and offers one next action", async ({ page }) => {
  await page.goto("/app");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Back stock-paired liquidity");
  await expect(page.getByText("/// START HERE")).toBeVisible();
  await expect(page.getByRole("link", { name: "SIGN IN" })).toBeVisible();
});

test("the home page's single primary action resolves", async ({ page }) => {
  await page.goto("/app");
  await page.getByRole("link", { name: "OPEN THE DOSSIER" }).click();
  await expect(page).toHaveURL(/\/markets\/nvdge-nvdax$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the capability panel reports real state and never says coming soon", async ({ page }) => {
  await page.goto("/app");

  const panel = page.getByRole("region", { name: "What is on and off today" });
  await expect(panel.getByText("Wallet signing", { exact: true })).toBeVisible();
  await expect(panel.getByText("Transaction preparation", { exact: true })).toBeVisible();
  await expect(panel.getByText("Unavailable").first()).toBeVisible();
  await expect(page.getByText(/coming soon|shortly|pending release/i)).toHaveCount(0);
});

test("a protected route redirects to login and preserves the return path", async ({ page }) => {
  await page.goto("/app/workspace");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fworkspace$/);
});

test("the backing wizard is protected", async ({ page }) => {
  await page.goto("/app/markets/nvdge-nvdax/back/capital");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("the app shell has no horizontal overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/app");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the app background carries no animated canvas", async ({ page }) => {
  await page.goto("/app");
  // Spec section 6.2: the lattice is landing-only; app surfaces stay still.
  await expect(page.locator("canvas")).toHaveCount(0);
});

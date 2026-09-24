import { expect, test } from "@playwright/test";

test("the landing page explains Kova in one screen and links into the app", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Poker for");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Meme Stocks.");
  await expect(page.getByText("Predict the move or trade it live.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Two ways to play" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How a table works" })).toBeVisible();

  await page.getByRole("link", { name: "Play now" }).first().click();
  await expect(page).toHaveURL(/\/app$/);
});

test("the landing page never presents sample data as live", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "Sample data for development" })).toBeVisible();
});

test("the landing page carries the risk disclosure and the integration name exactly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Trade tables use real money/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the risk disclosure" })).toBeVisible();
  await expect(page.getByText(/Powered by ClawPump \/ pump\.fun/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/Pomp\.fun|Pover|Rova/);
});

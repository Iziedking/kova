import { expect, test } from "@playwright/test";

const VIEWPORTS = [
  { name: "320", width: 320, height: 640 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const ROUTES = [
  "/",
  "/login",
  "/app",
  "/play",
  "/markets",
  "/markets/fixture-nvda",
  "/leaderboard",
  "/profile/ansem",
  "/tables/fixture-table-open-duel",
  "/tables/fixture-table-meme-majors",
  "/tables/fixture-table-degens-only",
] as const;

for (const viewport of VIEWPORTS) {
  test(`no route overflows horizontally at ${viewport.name}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const offenders: string[] = [];
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) offenders.push(`${route} (+${overflow}px)`);
    }
    expect(offenders).toEqual([]);
  });
}

test("the lobby renders every section from the service layer", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Poker for");
  await expect(page.getByRole("heading", { name: "Live Now" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trending Markets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meme Stocks", exact: true })).toBeVisible();
  await expect(page.getByText("Powered by ClawPump / pump.fun")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hot Players" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent Showdowns" })).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
});

test("every table card says whether it is Predict or Trade, its stake and its clock", async ({ page }) => {
  await page.goto("/app");
  const card = page.getByRole("article", { name: /Meme Majors, Predict/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText("200 ANSEM");
  await expect(card).toContainText(/\d+m \d+s|\d+h \d+m/);
  await expect(page.getByRole("article", { name: /Degens Only, Trade/ })).toBeVisible();
});

test("the desktop header carries exactly Home, Play, Markets and Leaderboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/markets");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Home", "Play", "Markets", "Leaderboard"]);
  await expect(nav.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
});

test("the mobile shell shows the bottom navigation with Play in the centre", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText(["Home", "Markets", "Play", "Rank", "Profile"]);
});

test("search opens from the header and from the keyboard, and finds a market", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.keyboard.press("/");
  const input = page.getByRole("textbox", { name: "Search markets, users, or tables" });
  await expect(input).toBeFocused();
  await input.fill("nvda");
  await expect(page.getByRole("option", { name: /NVDA/ }).first()).toBeVisible();
  // Results settle to the query; Enter must not act on the unfiltered list.
  await expect(page.getByRole("option", { name: /GME/ })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/markets\/fixture-nvda$/);
});

test("markets can be searched, sorted and filtered, and the state lives in the URL", async ({ page }) => {
  await page.goto("/markets");
  await expect(page.getByRole("row", { name: /GME/ }).first()).toBeVisible();
  await page.getByRole("textbox", { name: /Search markets/ }).fill("pepe");
  await expect(page).toHaveURL(/q=pepe/);
  await expect(page.getByRole("row", { name: /PEPE/ }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /GME/ })).toHaveCount(0);

  await page.goto("/markets?source=pomp");
  await expect(page.getByText("Powered by ClawPump / pump.fun")).toBeVisible();
});

test("a market with no match shows an empty state with a way out", async ({ page }) => {
  await page.goto("/markets?q=zzzznotamarket");
  await expect(page.getByText(/No markets match/)).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByRole("row", { name: /GME/ }).first()).toBeVisible();
});

test("an unknown market says so instead of rendering a blank page", async ({ page }) => {
  await page.goto("/markets/not-a-market");
  await expect(page.getByText("This market isn't available")).toBeVisible();
});

test("the leaderboard switches scope and Challenge gates on sign in", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/leaderboard");
  await expect(page.getByRole("row", { name: /ANSEM/ }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Trade" }).click();
  await expect(page.getByRole("tab", { name: "Trade" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Challenge kryp2moon" }).first().click();
  await expect(page).toHaveURL(/\/login\?next=.*intent%3Dchallenge%253Akryp2moon/);
});

test("a public profile shows a record, not a wallet address", async ({ page }) => {
  await page.goto("/profile/ansem");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("@ANSEM");
  await expect(page.locator("dt", { hasText: "Matches" }).first()).toBeVisible();
  await expect(page.getByText("Trading avg PnL")).toBeVisible();
  const visible = await page.evaluate(() => document.body.innerText);
  expect(visible, "a wallet-shaped token must not be a profile identity").not.toMatch(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
  await page.getByRole("tab", { name: "Matches" }).click();
  await expect(page.getByRole("tab", { name: "Matches" })).toHaveAttribute("aria-selected", "true");
});

test("an unknown profile says so", async ({ page }) => {
  await page.goto("/profile/nobody_here");
  await expect(page.getByText("We couldn't find that player")).toBeVisible();
});

test("an open table is a waiting room with rules, seats and a join action", async ({ page }) => {
  await page.goto("/tables/fixture-table-open-duel");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Blitz Duel");
  await expect(page.getByRole("heading", { name: "Rules" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Players", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Join table/ })).toBeVisible();
});

test("a live Prediction table never shows a pick, only face-down cards", async ({ page }) => {
  await page.goto("/tables/fixture-table-meme-majors");
  await expect(page.getByText("Time remaining")).toBeVisible();
  await expect(page.getByRole("img", { name: "Pick locked" }).first()).toBeVisible();
  await expect(page.getByText(/Revealed at the showdown/).first()).toBeVisible();
  // No ticker from the fixture market list appears as anyone's pick.
  const table = page.getByRole("region", { name: /players|table/i }).first();
  await expect(page.getByLabel("Match status")).not.toContainText(/\$?(GME|AMC|NVDA|TSLA)\b/);
  await expect(table).toBeVisible();
});

test("a live Trading table shows the match beside the chart and a real-money review flow", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tables/fixture-table-degens-only");

  await expect(page.getByRole("region", { name: "Trading Duel" })).toBeVisible();
  await expect(page.getByRole("img", { name: /GME 1h price chart/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Trade GME" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your position" })).toContainText("Total PnL");
  await expect(page.getByText("Chart timeframe · not the match clock")).toBeVisible();

  // Reviewing a real trade needs a session first; a guest is sent to sign in, not to a fake fill.
  await page.getByRole("button", { name: /Review buy/ }).click();
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("the trading ticket refuses an amount above the balance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/tables/fixture-table-degens-only");
  const amount = page.getByLabel("Amount (US$)");
  await amount.fill("999999");
  await expect(page.locator('[role="alert"]:not(#__next-route-announcer__)')).toContainText("more than your available balance");
  await expect(page.getByRole("button", { name: /Review buy/ })).toBeDisabled();
});

test("on mobile the trading table has a sticky strip and a Buy / Sell bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tables/fixture-table-degens-only");
  await expect(page.getByRole("button", { name: "Open live standings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sell", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: /Review buy/ })).toBeVisible();
});

test("a guest arriving with a create intent is sent to sign in and keeps the intent", async ({ page }) => {
  await page.goto("/play?intent=create");
  await expect(page).toHaveURL(/\/login\?next=%2Fplay%3Fintent%3Dcreate/);
});

test("the play page shows two modes and filters open tables by mode", async ({ page }) => {
  await page.goto("/play");
  const modes = page.getByRole("group", { name: "Game mode" });
  await expect(modes.getByRole("button", { name: /^Predict Make the better call/ })).toBeVisible();
  await expect(modes.getByRole("button", { name: /^Trade Make the better trade/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open Predict tables" })).toBeVisible();
  await modes.getByRole("button", { name: /^Trade Make the better trade/ }).click();
  await expect(page.getByRole("heading", { name: "Open Trade tables" })).toBeVisible();
});

test("a keyboard user can reach the main navigation and the skip to content is not needed to operate it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(["A", "BUTTON"]).toContain(focused);
});

test("the legal disclosure is reachable and says Trade uses real money", async ({ page }) => {
  await page.goto("/legal/risk");
  await expect(page.getByRole("heading", { name: "Risk disclosure" })).toBeVisible();
  await expect(page.getByText(/Trade tables use real money/)).toBeVisible();
});

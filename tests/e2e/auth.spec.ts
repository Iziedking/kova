import { expect, test, type Page } from "@playwright/test";

/**
 * The sign-in surface mounts Privy, which opens network connections to its own
 * service. Waiting for the full `load` event would make these tests depend on that
 * service's availability, so they wait for the document and assert on the UI.
 */
/** Client-rendered surfaces need their bundle before they respond; give hydration room under parallel load. */
const HYDRATED = { timeout: 30_000 };
const goto = (page: Page, url: string) => page.goto(url, { waitUntil: "domcontentloaded" });

/** Next's route announcer is also a role=alert; app alerts are everything else. */
const appAlert = (page: import("@playwright/test").Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test("the login page offers X, email and wallet, and browsing without an account", async ({ page }) => {
  await goto(page, "/login");

  await expect(page.getByRole("heading", { name: "Welcome to Kova" })).toBeVisible(HYDRATED);
  await expect(page.getByRole("button", { name: /Continue with X/ })).toBeVisible(HYDRATED);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue with email/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect wallet instead/ })).toBeVisible();
  await expect(page.getByText(/Wallet permissions are requested only when an action needs them/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Browse markets without signing in/ })).toBeVisible();
});

test("an invalid email is refused inline before anything is sent", async ({ page }) => {
  await goto(page, "/login");
  await page.getByLabel("Email address").fill("not-an-email");
  // A click before hydration is a no-op; retry until the handler is attached.
  await expect(async () => {
    await page.getByRole("button", { name: /Continue with email/ }).click();
    await expect(appAlert(page)).toContainText("Enter a valid email address.", { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
});

test("a session-required redirect explains itself and keeps the destination", async ({ page }) => {
  await goto(page, "/portfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio&reason=required$/);
  await expect(page.getByText(/Sign in to continue/).first()).toBeVisible();
});

test("protected routes redirect a guest to sign in and preserve the return path", async ({ page }) => {
  for (const path of ["/portfolio", "/settings", "/notifications"]) {
    await goto(page, path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace(/%/g, "%")}`));
  }
});

test("the lobby, play, markets, leaderboard and profiles stay public", async ({ page }) => {
  for (const path of ["/app", "/play", "/markets", "/markets/fixture-gme", "/leaderboard", "/profile/ansem", "/tables/fixture-table-meme-majors"]) {
    await goto(page, path);
    await expect(page, `${path} must not redirect a guest`).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
  }
});

test("creating a table as a guest goes to sign in and returns to the create intent", async ({ page }) => {
  await goto(page, "/play");
  await expect(async () => {
    await page.getByRole("button", { name: "Create table" }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Fplay%3Fintent%3Dcreate&reason=required$/, { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
});

test("joining an open table as a guest goes to sign in and returns to the table", async ({ page }) => {
  // Open tables (the ones that can be joined) are listed on Play; Home leads with live ones.
  await goto(page, "/play");
  await expect(page.getByRole("button", { name: /Join Table/ }).first()).toBeVisible(HYDRATED);
  await expect(async () => {
    await page.getByRole("button", { name: /Join Table/ }).first().click();
    await expect(page).toHaveURL(/\/login\?next=%2Ftables%2F.*intent%3Djoin/, { timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
});

test("a hostile next parameter never leaves the site", async ({ page }) => {
  await goto(page, "/login?next=https://evil.example/phish");
  await expect(page.getByRole("heading", { name: "Welcome to Kova" })).toBeVisible(HYDRATED);
  await expect(page).toHaveURL(/\/login\?next=https:\/\/evil\.example\/phish$/);
  // The panel resolves the destination through safeNext; the dedicated unit test
  // covers the redirect target. Here we prove the page itself stays on this origin.
  expect(new URL(page.url()).origin).toBe("http://127.0.0.1:3000");
});

test("the sign-in screen never claims to have created a wallet or requested a signature", async ({ page }) => {
  await goto(page, "/login");
  await expect(page.getByText(/we created a wallet|sign this transaction/i)).toHaveCount(0);
});

test("email sign-in: code screen, wrong code, right code, first-run identity, then back to where you were going", async ({ page }) => {
  await goto(page, "/login?next=/markets/fixture-nvda");
  await expect(page.getByRole("heading", { name: "Welcome to Kova" })).toBeVisible(HYDRATED);

  await page.getByLabel("Email address").fill("beni@example.com");
  await page.getByRole("button", { name: /Continue with email/ }).click();

  // Check your email
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText("beni@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change email" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();

  // A wrong code stays on the screen with an inline error.
  await page.getByLabel("Digit 1").click();
  await page.keyboard.type("111111");
  await expect(appAlert(page)).toContainText("That code didn't work");
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  // The right code (pasted digit by digit) signs in and asks for a Kova identity once.
  for (let index = 1; index <= 6; index += 1) await page.getByLabel(`Digit ${index}`).fill("");
  await page.getByLabel("Digit 1").click();
  await page.keyboard.type("424242");
  await expect(page.getByRole("heading", { name: "Make it yours." })).toBeVisible();
  await expect(page.getByLabel("Username")).toHaveValue("beni");

  // Username rules are enforced inline.
  await page.getByLabel("Username").fill("a!");
  await page.getByRole("button", { name: "Enter Kova" }).click();
  await expect(appAlert(page)).toContainText(/at least 3|Letters, numbers/);
  await page.getByLabel("Username").fill("beni_plays");
  await page.getByRole("button", { name: "Enter Kova" }).click();

  // Brief success, then the safe destination the person was heading to.
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
  await expect(page).toHaveURL(/\/markets\/fixture-nvda$/, { timeout: 15_000 });
});

test("a returning person with an identity skips first-run", async ({ page }) => {
  await goto(page, "/login");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "kova.identity.v1:fixture-stub-user",
      JSON.stringify({ username: "returning", displayName: null, avatarUrl: null, avatarSeed: "returning" }),
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill("back@example.com");
  await page.getByRole("button", { name: /Continue with email/ }).click();
  await page.getByLabel("Digit 1").click();
  await page.keyboard.type("424242");
  await expect(page.getByRole("heading", { name: "You're in." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Make it yours." })).toHaveCount(0);
  await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
});

test("an email that cannot be sent shows the reason and keeps the other methods available", async ({ page }) => {
  await goto(page, "/login");
  await page.getByLabel("Email address").fill("will-fail@example.com");
  await page.getByRole("button", { name: /Continue with email/ }).click();
  await expect(appAlert(page)).toContainText("We couldn't send a code to that email");
  await expect(page.getByRole("button", { name: /Continue with X/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Connect wallet instead/ })).toBeEnabled();
});

test("X sign-in failure is shown inline and does not lose the other methods", async ({ page }) => {
  await goto(page, "/login");
  await page.getByRole("button", { name: /Continue with X/ }).click();
  await expect(appAlert(page)).toContainText("We couldn't sign you in with X. Try again.");
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("an unsafe next parameter falls back to the app after sign-in", async ({ page }) => {
  await goto(page, "/login?next=//evil.example/steal");
  await page.getByRole("button", { name: /Connect wallet instead/ }).click();
  await expect(page.getByRole("heading", { name: "Make it yours." })).toBeVisible();
  await page.getByLabel("Username").fill("safe_user");
  await page.getByRole("button", { name: "Enter Kova" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:3000\/app$/, { timeout: 15_000 });
});

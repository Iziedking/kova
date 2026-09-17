import { expect, test } from "@playwright/test";

test("market dossier connects a test Wallet Standard account and pauses before signing", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("wallet-standard:app-ready", (event) => {
      const register = (event as CustomEvent<{ register: (wallet: unknown) => void }>).detail.register;
      register({
        version: "1.0.0",
        name: "KOVA Test Wallet",
        icon: "data:image/svg+xml;base64,AA==",
        chains: ["solana:mainnet"],
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => ({
              accounts: [{
                address: "KOVA_TEST_WALLET",
                publicKey: new Uint8Array(32),
                chains: ["solana:mainnet"],
                features: [],
              }],
            }),
          },
        },
        accounts: [],
      });
    });
  });

  await page.goto("/markets/nvdge-nvdax");
  await page.getByRole("button", { name: /Review backing/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("WITHHELD · QUOTE INCOMPLETE").first()).toBeVisible();
  await expect(page.getByText("Thin stock-side exit depth and incomplete tick coverage can change execution or prevent it.")).toBeVisible();

  await page.getByRole("button", { name: "Review wallet boundary" }).click();
  await expect(page.getByRole("heading", { name: "Wallet handoff", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /KOVA Test Wallet/ }).click();
  await expect(page.getByText(/CONNECTED FOR REVIEW · KOVA Test Wallet/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wallet handoff is paused." })).toBeVisible();
  await expect(page.getByText(/Preview mode will not request a signature, create transaction bytes, or move funds/)).toBeVisible();
});

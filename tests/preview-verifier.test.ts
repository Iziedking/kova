import assert from "node:assert/strict";
import test from "node:test";
import { getCapabilities } from "../src/application/capabilities";
import { verifyPreviewRelease } from "../src/release/preview-verifier";

const backendHealth = {
  product: "KOVA",
  mode: "preview",
  status: "ok",
  capabilities: {
    dealerAdmission: "blocked",
    walletSigning: "unavailable",
    transactionPreparation: "unavailable",
    automatedRebalancing: "unavailable",
    ansemEscrow: "unavailable",
    gameSettlement: "unavailable",
    payoutExecution: "unavailable",
  },
};

function previewFetcher(overrides: Readonly<Record<string, unknown>> = {}): typeof fetch {
  return (async (input: string | URL | Request) => {
    const rawUrl = input instanceof Request ? input.url : input.toString();
    const url = new URL(rawUrl);
    const bodies: Record<string, unknown> = {
      "/api/health": backendHealth,
      "/api/live": { product: "KOVA", status: "alive" },
      "/api/ready": { product: "KOVA", readyToServe: true, readyToAdmit: false, readyToRecover: false },
      "/api/backend-health": { ok: true, source: "vm_backend", health: backendHealth },
      ...overrides,
    };
    const body = url.pathname === "/api/health" && url.hostname === "app.example" ? getCapabilities() : bodies[url.pathname];
    return body === undefined ? new Response(null, { status: 404 }) : Response.json(body);
  }) as typeof fetch;
}

test("preview verifier proves the frontend to VM link while financial capabilities remain off", async () => {
  const receipt = await verifyPreviewRelease({
    frontendUrl: "https://app.example/path",
    backendUrl: "https://api.example/ignored",
    fetcher: previewFetcher(),
    now: () => new Date("2026-09-19T18:00:00.000Z"),
  });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.checkedAt, "2026-09-19T18:00:00.000Z");
  assert.equal(receipt.checks.length, 5);
  assert.ok(receipt.checks.every((check) => check.ok));
});

test("preview verifier refuses a backend that claims payout execution", async () => {
  const unsafeHealth = { ...backendHealth, capabilities: { ...backendHealth.capabilities, payoutExecution: "live" } };
  const receipt = await verifyPreviewRelease({
    frontendUrl: "https://app.example",
    backendUrl: "https://api.example",
    fetcher: previewFetcher({ "/api/health": unsafeHealth, "/api/backend-health": { ok: true, source: "vm_backend", health: unsafeHealth } }),
  });
  assert.equal(receipt.ok, false);
  assert.equal(receipt.checks.find((check) => check.name === "backend_health")?.ok, false);
});

test("preview verifier rejects insecure remote origins before any request", async () => {
  await assert.rejects(
    verifyPreviewRelease({ frontendUrl: "http://app.example", backendUrl: "https://api.example", fetcher: previewFetcher() }),
    /must use HTTPS/,
  );
});

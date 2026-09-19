import { verifyPreviewRelease } from "../src/release/preview-verifier";

async function main(): Promise<void> {
  const frontendUrl = process.env.KOVA_PUBLIC_URL?.trim() ?? "";
  const backendUrl = process.env.KOVA_BACKEND_API_URL?.trim() ?? "";
  if (frontendUrl.length === 0 || backendUrl.length === 0) {
    throw new Error("KOVA_PUBLIC_URL and KOVA_BACKEND_API_URL are required.");
  }
  const receipt = await verifyPreviewRelease({ frontendUrl, backendUrl });
  console.info(JSON.stringify(receipt, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, code: "PREVIEW_VERIFICATION_FAILED", message: error instanceof Error ? error.message : "Preview verification failed." }));
  process.exitCode = 1;
});

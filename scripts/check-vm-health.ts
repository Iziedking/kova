import { fetchBackendHealth } from "../src/server/backend-health";

const backendUrl = process.env.KOVA_BACKEND_API_URL?.trim() ?? "";

async function main(): Promise<void> {
  const result = await fetchBackendHealth({ backendUrl });

  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ ok: true, source: "vm_backend", health: result.health }, null, 2));
}

void main();

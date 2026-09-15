import { fetchBackendHealth } from "../../../server/backend-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchBackendHealth();
  if (!result.ok) return Response.json(result, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, source: "vm_backend", health: result.health }, { headers: { "Cache-Control": "no-store" } });
}

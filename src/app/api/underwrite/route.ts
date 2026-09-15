import { underwritePreview } from "../../../application/underwriting";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { marketId?: unknown; amountUsdMicro?: unknown };
    if (typeof body.marketId !== "string" || typeof body.amountUsdMicro !== "string") return Response.json({ ok: false, code: "INVALID_INPUT", message: "marketId and amountUsdMicro are required.", retryable: false }, { status: 422 });
    return Response.json({ ok: true, decision: underwritePreview({ marketId: body.marketId, amountUsdMicro: body.amountUsdMicro }, new Date().toISOString()), capability: "preview_only" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, code: "INVALID_JSON", message: "Send a JSON object.", retryable: false }, { status: 422 }); }
}

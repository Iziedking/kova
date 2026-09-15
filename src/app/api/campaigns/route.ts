import { CAMPAIGN_CATALOG } from "../../../domain/campaign-catalog";

export const dynamic = "force-static";

export function GET() {
  return Response.json({ capability: "captured_snapshot", campaigns: CAMPAIGN_CATALOG }, { headers: { "Cache-Control": "public, max-age=60" } });
}

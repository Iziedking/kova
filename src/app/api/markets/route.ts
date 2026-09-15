import { NextResponse } from "next/server";
import { MARKET_CATALOG } from "../../../domain/market-catalog";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json({ capability: "captured_snapshot", markets: MARKET_CATALOG }, { headers: { "cache-control": "public, max-age=60" } });
}

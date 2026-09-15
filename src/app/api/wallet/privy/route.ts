import { NextResponse } from "next/server";
import { getPrivyRuntimeConfig } from "../../../../wallet/privy-adapter";

export const dynamic = "force-dynamic";

export function GET() {
  const config = getPrivyRuntimeConfig();
  return NextResponse.json({
    provider: "privy",
    mode: config.executionEnabled && config.nodeConfigured ? "configured_but_not_proven" : "unavailable",
    chain: "solana",
    authority: "time_bound_delegation",
    repeatedPrompts: false,
    execution: "disabled_until_phase_00_proof",
    appIdPresent: Boolean(config.appId),
  }, { headers: { "cache-control": "no-store" } });
}

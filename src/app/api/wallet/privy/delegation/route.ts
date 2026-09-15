import { NextResponse } from "next/server";
import { createMandate, type MandateInput } from "../../../../../application/mandate";
import { createDisabledPrivyWalletAdapter } from "../../../../../wallet/privy-adapter";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: MandateInput;
  try { body = await request.json() as MandateInput; }
  catch { return NextResponse.json({ ok: false, code: "INVALID_JSON", message: "The mandate could not be read." }, { status: 400, headers: { "cache-control": "no-store" } }); }
  const mandate = createMandate(body, new Date().toISOString());
  if (!mandate.ok) return NextResponse.json(mandate, { status: 400, headers: { "cache-control": "no-store" } });
  const result = await createDisabledPrivyWalletAdapter().createDelegation(mandate.value);
  return NextResponse.json({ ...result, mandate: mandate.value }, { status: result.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}

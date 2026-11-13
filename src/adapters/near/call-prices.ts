/**
 * The values the settler reports for every pick, coins and "Will it cook?" calls alike.
 *
 * A coin's value is its price in its one pinned pool (prices.ts). A call's value comes from
 * meme.cooking's own contract on NEAR mainnet (meme-cooking.ts), read by the settler, because the
 * CHIP contract on testnet cannot read mainnet:
 *
 *   start  both sides report 1, and only while the auction is still cooking under that symbol.
 *   end    the side that happened reports 2, the other 1, so it scores +100% and takes the pot.
 *          Until the auction is decided the read fails and the settler retries; a table it cannot
 *          settle in time becomes refundable, as with any price it cannot read.
 */
import { callSymbol, parseCall, type CallSide } from "./launch-calls";
import { type AuctionOutcome, formatNear, MEME_COOKING, type MemeCookingReader } from "./meme-cooking";
import type { NearPrice } from "./prices";

export type PricePhase = "start" | "end";

/** What the settler reads prices from. */
export interface PriceSource {
  price(market: string, phase?: PricePhase): Promise<NearPrice>;
}

const E18 = 10n ** 18n;

function describe(outcome: AuctionOutcome): string {
  if (outcome.state === "cooking") {
    const a = outcome.auction;
    return `${formatNear(a.raised, 3)} of ${formatNear(a.softCap, 0)} NEAR, ends ${new Date(a.endsAt).toISOString()}`;
  }
  if (outcome.state === "cooked") return `cooked: ${formatNear(outcome.raised, 3)} of ${formatNear(outcome.softCap, 0)} NEAR`;
  return outcome.raised !== null && outcome.softCap !== null ? `did not cook: ${formatNear(outcome.raised, 3)} of ${formatNear(outcome.softCap, 0)} NEAR` : "did not cook: finalized without a launch";
}

export class CallAwarePrices implements PriceSource {
  constructor(
    private readonly coins: { price(market: string): Promise<NearPrice> },
    private readonly memeCooking: Pick<MemeCookingReader, "outcome">,
    private readonly clock: () => number = Date.now,
  ) {}

  async price(market: string, phase: PricePhase = "start"): Promise<NearPrice> {
    const call = parseCall(market);
    if (!call) return this.coins.price(market);
    const outcome = await this.memeCooking.outcome(call.memeId, this.clock());
    let value: bigint;
    if (phase === "start") {
      if (outcome.state !== "cooking") throw new Error(`${call.symbol}: auction ${call.memeId} is no longer cooking, so this call cannot start`);
      if (callSymbol(outcome.auction.symbol) !== call.symbol) throw new Error(`${call.symbol}: auction ${call.memeId} is ${outcome.auction.symbol}`);
      value = 1n;
    } else {
      if (outcome.state === "cooking") throw new Error(`${call.symbol}: auction ${call.memeId} has not been decided yet`);
      const happened: CallSide = outcome.state === "cooked" ? "cooks" : "flops";
      value = happened === call.side ? 2n : 1n;
    }
    return {
      market,
      priceE18: value * E18,
      priceUsd: value.toString(),
      liquidityUsd: 0,
      change1hPct: null,
      trades5m: 0,
      trades1h: 0,
      source: "meme-cooking",
      sourceRef: `${MEME_COOKING.contract} auction ${call.memeId} (${call.symbol}) ${phase}: ${describe(outcome)}`,
      capturedAt: new Date(this.clock()),
    };
  }
}

import { checkedPot, parsePrice18, type Price18, type RawAmount, type SignedBps } from "./amounts";
import { compareBytes, decodeBase58Bytes32 } from "./encoding";

export interface ScoreInput {
  wallet: string;
  startPrice18: Price18;
  endPrice18: Price18;
}

export interface PlayerScore extends ScoreInput {
  scoreBps: SignedBps;
  winner: boolean;
  awardRaw: RawAmount;
}

export interface SettlementResult {
  potRaw: RawAmount;
  winningScoreBps: SignedBps;
  winnerWallets: readonly string[];
  scores: readonly PlayerScore[];
}

export function allocatePot(potRaw: RawAmount, winnerWalletsInput: readonly string[]): ReadonlyMap<string, RawAmount> {
  if (winnerWalletsInput.length === 0) throw new Error("At least one winner is required.");
  if (new Set(winnerWalletsInput).size !== winnerWalletsInput.length) throw new Error("Winner wallets must be unique.");
  const winnerWallets = winnerWalletsInput
    .map((wallet) => ({ wallet, bytes: decodeBase58Bytes32(wallet) }))
    .sort((left, right) => compareBytes(left.bytes, right.bytes))
    .map(({ wallet }) => wallet);
  const pot = BigInt(checkedPot(potRaw, 1));
  const quotient = pot / BigInt(winnerWallets.length);
  let remainder = pot % BigInt(winnerWallets.length);
  const awards = new Map<string, RawAmount>();
  for (const wallet of winnerWallets) {
    const bonus = remainder > 0n ? 1n : 0n;
    awards.set(wallet, (quotient + bonus).toString());
    remainder -= bonus;
  }
  return awards;
}

export function calculateScoreBps(startPrice18: Price18, endPrice18: Price18): SignedBps {
  const start = parsePrice18(startPrice18);
  const end = parsePrice18(endPrice18);
  if (start <= 0n) throw new Error("Start price must be greater than zero.");
  return (((end - start) * 10_000n) / start).toString();
}

export function settleEqualStakeRound(stakeRaw: RawAmount, inputs: readonly ScoreInput[]): SettlementResult {
  if (inputs.length < 2) throw new Error("Settlement requires at least two funded players.");
  const wallets = new Set(inputs.map(({ wallet }) => wallet));
  if (wallets.size !== inputs.length) throw new Error("Each funded player wallet must be unique.");

  const scored = inputs.map((input) => ({ ...input, scoreBps: calculateScoreBps(input.startPrice18, input.endPrice18) }));
  const winningScore = scored.reduce((best, player) => BigInt(player.scoreBps) > best ? BigInt(player.scoreBps) : best, BigInt(scored[0]!.scoreBps));
  const winnerWallets = scored
    .filter((player) => BigInt(player.scoreBps) === winningScore)
    .map((player) => ({ wallet: player.wallet, bytes: decodeBase58Bytes32(player.wallet) }))
    .sort((left, right) => compareBytes(left.bytes, right.bytes))
    .map(({ wallet }) => wallet);

  const pot = BigInt(checkedPot(stakeRaw, inputs.length));
  const awards = allocatePot(pot.toString(), winnerWallets);

  return {
    potRaw: pot.toString(),
    winningScoreBps: winningScore.toString(),
    winnerWallets,
    scores: scored.map((player) => ({
      ...player,
      winner: awards.has(player.wallet),
      awardRaw: awards.get(player.wallet) ?? "0",
    })),
  };
}

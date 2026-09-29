/**
 * Trade mode against real PostgreSQL: seats, balances, quotes, fills, a price-moved refusal,
 * concurrent fills on one balance, live standings and the equities the worker settles from.
 * Prices come from a scripted DEX Screener response so every number is checkable.
 *
 *   npm run test:postgres-trading   (needs Docker)
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import net from "node:net";
import { Pool } from "pg";
import { runMigrations } from "../src/backend/db/migrate";
import { PostgresGameRepository } from "../src/backend/game/postgres-repository";
import { TradingSimService } from "../src/backend/game/trading-sim";
import { MarketFeed } from "../src/adapters/game/market-feed";
import { STARTING_CASH_MICRO_USD } from "../src/domain/trading/sim";
import { SocialService } from "../src/backend/game/social";
import { PlayerHubService } from "../src/backend/game/player-hub";
import { OrchestrationRepository } from "../src/backend/workers/orchestration-repository";

const MINT = "EpXtn6xGoZ4Y45vRjiDUHSCGbBoJD5FaEqZbF98YswH1";
const WALLET_A = "79vnYjBdDYGUfPUEsQWXjgaSE4oprSUHN6GUisSLNhn6";
const WALLET_B = "3HWCn9VmRM9JVUUBycCuHCZDmRLZBXtnZ3sDkLf5F2Sr";

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No free port.");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

async function main(): Promise<void> {
  const port = await freePort();
  const container = `kova-trade-${randomUUID().slice(0, 8)}`;
  const password = randomBytes(18).toString("hex");
  const pool = new Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${port}/kova_test`, max: 12 });
  let priceUsd = "0.001";
  let clock = Date.parse("2026-09-28T12:00:00Z");
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://api.dexscreener.com/tokens/v1/solana/")) {
      return Response.json([{ chainId: "solana", baseToken: { address: MINT, symbol: "MADE" }, priceUsd, liquidity: { usd: 100_000 } }]);
    }
    if (url.startsWith("https://clawpump.tech/api/tokens")) return Response.json({ tokens: [] });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    execFileSync("docker", ["run", "--rm", "--detach", "--name", container, "--env", `POSTGRES_PASSWORD=${password}`, "--env", "POSTGRES_DB=kova_test", "--publish", `127.0.0.1:${port}:5432`, "postgres:16.15-alpine3.24@sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb"], { stdio: "pipe" });
    for (let attempt = 0; ; attempt += 1) {
      try { await pool.query("SELECT 1"); break; } catch { if (attempt > 40) throw new Error("PostgreSQL did not start."); await new Promise((resolve) => setTimeout(resolve, 500)); }
    }
    await runMigrations(pool);
    const repository = new PostgresGameRepository("unused", pool);
    const host = await repository.principalForPrivyUser("did:privy:host");
    const guest = await repository.principalForPrivyUser("did:privy:guest");
    for (const [principal, wallet] of [[host, WALLET_A], [guest, WALLET_B]] as const) {
      const challenge = randomUUID();
      await pool.query("INSERT INTO game_wallet_challenges (id, principal_id, wallet, origin, nonce_hash, message, expires_at) VALUES ($1,$2,$3,'https://kova.surf',$4,'m',now())", [challenge, principal.id, wallet, randomBytes(16).toString("hex")]);
      await pool.query("INSERT INTO game_wallet_bindings (wallet, principal_id, proof_challenge_id, verified_at) VALUES ($1,$2,$3,now())", [wallet, principal.id, challenge]);
    }
    const table = await repository.createTable({
      id: randomUUID(), hostPrincipalId: host.id, name: "Trading · 2 ANSEM", visibility: "public", status: "DRAFT", financialStatus: "unfunded",
      opensUntil: null, startsAt: null, endsAt: null,
      rules: { playerCount: 2, stakeMint: WALLET_A, stakeRaw: "2000000", roundDurationSeconds: 300, scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1", gameMode: "trading" },
    });
    const trading = new TradingSimService({ pool, feed: new MarketFeed(fetcher, () => clock), fetcher, now: () => clock });

    // Seats: bound wallets only, admitted directly, one per principal.
    assert.equal((await trading.enter(table.id, host.id, WALLET_B)).ok, false, "a wallet bound to someone else is refused");
    assert.deepEqual(await trading.enter(table.id, host.id, WALLET_A), { ok: true, value: { wallet: WALLET_A } });
    assert.deepEqual(await trading.enter(table.id, host.id, WALLET_A), { ok: true, value: { wallet: WALLET_A } }, "entering twice is idempotent");
    assert.equal((await trading.enter(table.id, guest.id, WALLET_B)).ok, true);
    const admitted = await pool.query("SELECT admission_decision FROM game_participants WHERE table_id=$1", [table.id]);
    assert.deepEqual(admitted.rows.map((row) => row.admission_decision), ["ACCEPTED", "ACCEPTED"]);

    // Before the round: no trading.
    assert.equal((await trading.quote(host.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 100 })).ok, false);

    // The worker funds, activates and starts the round.
    await pool.query("UPDATE game_participants SET funding_status='funded' WHERE table_id=$1", [table.id]);
    await pool.query("UPDATE game_tables SET status='ACTIVE', starts_at=$2, ends_at=$3 WHERE id=$1", [table.id, new Date(clock), new Date(clock + 300_000)]);
    await trading.activate(table.id);

    // Buy $1,000 at $0.001.
    const quote = await trading.quote(host.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 1_000 });
    assert.ok(quote.ok);
    const bought = await trading.execute(host.id, quote.value.id);
    assert.ok(bought.ok);
    assert.equal(bought.value.feeMicroUsd, "3000000");
    assert.deepEqual(await trading.execute(host.id, quote.value.id), bought, "executing a quote twice returns the same fill");
    assert.equal((await trading.execute(guest.id, quote.value.id)).ok, false, "another player can't fill my quote");

    // The price jumps 5%: a new buy quoted at the old price is refused, not filled.
    const stale = await trading.quote(host.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 100 });
    assert.ok(stale.ok);
    priceUsd = "0.00105";
    clock += 5_000;
    const refused = await trading.execute(host.id, stale.value.id);
    assert.deepEqual(refused.ok ? null : refused.code, "PRICE_MOVED");

    // Two concurrent $6,000 buys against a $9,000 balance: exactly one fills.
    const [left, right] = await Promise.all([
      trading.quote(guest.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 6_000 }),
      trading.quote(guest.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 6_000 }),
    ]);
    assert.ok(left.ok && right.ok);
    await trading.execute(guest.id, (await trading.quote(guest.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 4_000 }) as { ok: true; value: { id: string } }).value.id);
    const raced = await Promise.all([trading.execute(guest.id, left.value.id), trading.execute(guest.id, right.value.id)]);
    assert.equal(raced.filter((result) => result.ok).length, 1, "the balance lock lets only one overspend-sized fill through");
    const guestCash = await pool.query("SELECT cash_micro_usd FROM game_trading_accounts WHERE principal_id=$1", [guest.id]);
    assert.ok(BigInt(guestCash.rows[0].cash_micro_usd) >= 0n);

    // Sell the host's whole position at +5%.
    const sellQuote = await trading.quote(host.id, { tableId: table.id, mint: MINT, side: "sell", inputUsd: 5_000 });
    assert.ok(sellQuote.ok);
    const sold = await trading.execute(host.id, sellQuote.value.id);
    assert.ok(sold.ok);
    const positions = await pool.query("SELECT count(*) FROM game_trading_positions p JOIN game_trading_accounts a ON a.id=p.account_id WHERE a.principal_id=$1", [host.id]);
    assert.equal(positions.rows[0].count, "0");

    // Standings and the settlement equities agree, marked at one price.
    const state = await trading.matchState(table.id, host.id);
    assert.ok(state.ok);
    assert.equal(state.value.standings.length, 2);
    const equities = await trading.equities(table.id);
    const hostEquity = equities.get(WALLET_A)!.equity;
    assert.ok(hostEquity > STARTING_CASH_MICRO_USD, "a 5% gain minus two 0.3% fees is a net gain");
    assert.equal(state.value.standings.find((row) => row.isViewer)!.equityMicroUsd, hostEquity.toString());

    // After the round: no trading.
    clock += 400_000;
    assert.deepEqual((await trading.quote(host.id, { tableId: table.id, mint: MINT, side: "buy", inputUsd: 10 }) as { code?: string }).code, "MATCH_NOT_LIVE");
    console.log(`Trading proof passed. Host equity $${(Number(hostEquity) / 1e6).toFixed(2)}, guest fills ${raced.filter((r) => r.ok).length + 1}.`);

    // Profiles and rankings from the settled result. X comes only from the (scripted) Privy lookup.
    await new OrchestrationRepository(pool).appendEvent({
      tableId: table.id, audience: "public", eventType: "table.settled",
      payload: { status: "SETTLED", fundedPlayers: 2, results: [
        { wallet: WALLET_A, scoreBps: "437", awardRaw: "4000000" },
        { wallet: WALLET_B, scoreBps: "-12", awardRaw: "0" },
      ] },
    });
    const social = new SocialService({ pool, auth: { linkedX: async (id) => (id === "did:privy:host" ? { username: "kova_x", name: "Kova X", avatarUrl: "https://pbs.twimg.com/profile.jpg" } : null) }, now: () => clock });
    assert.equal((await social.saveProfile(host.id, { username: "Host_Player", displayName: "Host", avatarSeed: "abc" })).ok, true);
    assert.deepEqual(await social.saveProfile(guest.id, { username: "host_player", displayName: null, avatarSeed: "x" }), { ok: false, code: "USERNAME_TAKEN" });
    assert.deepEqual(await social.saveProfile(guest.id, { username: "no spaces", displayName: null, avatarSeed: "x" }), { ok: false, code: "USERNAME_INVALID" });
    assert.equal(await social.usernameAvailable("host_player", guest.id), false);
    assert.equal(await social.usernameAvailable("host_player", host.id), true, "your own name counts as available to you");
    const board = await social.leaderboard("trading");
    assert.equal(board[0]!.identity.displayName, "Kova X", "an X-linked player shows their X name");
    assert.equal(board[0]!.identity.verified, true);
    assert.equal(board[0]!.stats.wins, 1);
    assert.equal(board[0]!.stats.netRaw, 2_000_000n, "won 4 ANSEM on a 2 ANSEM stake");
    assert.equal(board[1]!.identity.hasProfile, false, "a player without a profile shows as a short wallet");
    assert.equal((await social.leaderboard("prediction")).length, 0, "a Trade result doesn't count toward Predict");
    const showdowns = await social.recentShowdowns();
    assert.equal(showdowns[0]!.winner.username, "host_player");
    assert.equal(showdowns[0]!.payoutRaw, "2000000");
    const publicProfile = await social.publicProfile("HOST_PLAYER");
    assert.equal(publicProfile?.history[0]?.result, "won");
    assert.equal(publicProfile?.stats.streak, 1);
    // The routes return these objects as JSON unchanged, so they must serialize (no BigInt).
    assert.doesNotThrow(() => JSON.stringify(publicProfile), "the public profile serializes");
    assert.doesNotThrow(() => JSON.stringify(showdowns), "recent showdowns serialize");
    console.log("Profile and leaderboard proof passed.");

    // Challenges, notifications and portfolio.
    const hub = new PlayerHubService({ pool, social, connection: null, stakeMint: null, network: "solana-devnet" });
    const duel = await repository.createTable({
      id: randomUUID(), hostPrincipalId: host.id, name: "@host_player vs @guest", visibility: "private", status: "DRAFT", financialStatus: "unfunded",
      opensUntil: null, startsAt: null, endsAt: null,
      rules: { playerCount: 2, stakeMint: WALLET_A, stakeRaw: "2000000", roundDurationSeconds: 300, scoreVersion: "kova-bps-v1", tieBreakVersion: "wallet-bytes-v1", commitmentVersion: "kova-pick-v1", gameMode: "prediction" },
    });
    assert.equal(await repository.tableForPrincipal(duel.id, guest.id), null, "a private table is hidden before the challenge");
    await hub.recordChallenge({ tableId: duel.id, fromPrincipalId: host.id, toPrincipalId: guest.id });
    assert.equal((await repository.tableForPrincipal(duel.id, guest.id))?.id, duel.id, "the challenged player can open it without a link");
    const inbox = await hub.notifications(guest.id);
    const challengeNote = inbox.find((item) => item.kind === "challenge_received");
    assert.equal(challengeNote?.title, "@host_player challenged you");
    assert.equal(challengeNote?.href, `/tables/${duel.id}`);
    assert.equal(challengeNote?.read, false);
    await hub.markRead(guest.id);
    assert.ok((await hub.notifications(guest.id)).every((item) => item.read), "opening notifications marks them read");
    const hostInbox = await hub.notifications(host.id);
    assert.equal(hostInbox.find((item) => item.kind === "payout_confirmed")?.title, "You won 4 ANSEM");
    const portfolio = await hub.portfolio(host.id, null);
    assert.equal(portfolio.wallet, WALLET_A, "the portfolio uses the account's proven wallet");
    assert.equal(portfolio.netWonRaw, "2000000");
    assert.equal(portfolio.activity.find((item) => item.kind === "payout")?.title, "Won 4 ANSEM");
    assert.equal((await hub.portfolio(host.id, WALLET_B)).wallet, WALLET_A, "another account's wallet is never shown");
    assert.doesNotThrow(() => JSON.stringify(portfolio), "the portfolio serializes");
    assert.doesNotThrow(() => JSON.stringify(hostInbox), "notifications serialize");
    console.log("Challenge, notification and portfolio proof passed.");
  } finally {
    await pool.end().catch(() => undefined);
    try { execFileSync("docker", ["rm", "-f", container], { stdio: "pipe" }); } catch { /* already gone */ }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

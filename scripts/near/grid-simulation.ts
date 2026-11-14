/**
 * 60-day supply simulation for CHIP under the Kova v3 grid rules.
 *
 *   npx tsx scripts/near/grid-simulation.ts
 *
 * Writes docs/near/v3/grid-simulation.json and docs/near/v3/grid-supply.svg. Randomness is seeded,
 * so the output is reproducible.
 *
 * It applies the rules in near/mine and near/chip-v3 to ONE mine (the CHIP mine):
 *  - a round every UTC minute, 1,440 a day;
 *  - 25 squares, a uniform winning square;
 *  - an empty winning square refunds every stake: nothing burned, nothing minted;
 *  - otherwise 10% of the losing stakes burn (floored), the rest goes to the winners by stake,
 *    who also keep their own stake;
 *  - emission 10 CHIP a minute (a round with winners), halved every 30 days, to that round's winners;
 *  - Motherlode: +2 CHIP per settled round, capped at 5,000, 1 chance in 625 per settled round to
 *    mint all of it to that round's winners;
 *  - starter claims: 1,000 CHIP each from a 100,000 CHIP budget, once per account;
 *  - supply cap 21,000,000.
 *
 * What it does not model, and the numbers cannot be read as predictions: other mines sharing the
 * emission, prices, transfers between players, players who quit or change habits as they lose,
 * validator timing of `settle`, and any real player's behaviour. Every player here stakes the same
 * simple way (see `stakeOf`). Amounts are floating point here; the contracts use exact integers.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DAYS = 60;
const ROUNDS_PER_DAY = 1440;
const SQUARES = 25;
const BURN_PCT = 0.1;
const EMISSION_PER_ROUND = 10;
const HALVING_DAYS = 30;
const MOTHERLODE_ADD = 2;
const MOTHERLODE_CAP = 5_000;
const MOTHERLODE_ODDS = 625;
const STARTER = 1_000;
const STARTER_BUDGET = 100_000;
const SUPPLY_CAP = 21_000_000;
const MAX_PER_ROUND = 500; // the mine's per-player cap in the CHIP mine on testnet
const SQUARES_PER_PLAYER = 3;
const ARRIVAL_DAYS = 7;

type Scenario = { key: string; name: string; holders: number; playChance: number; farmers: number };

const SCENARIOS: Scenario[] = [
  { key: "quiet", name: "Quiet: 10 players", holders: 10, playChance: 0.1, farmers: 0 },
  { key: "steady", name: "Steady: 60 players", holders: 60, playChance: 0.2, farmers: 0 },
  { key: "busy", name: "Busy: 100 players", holders: 100, playChance: 0.3, farmers: 0 },
  { key: "farmed", name: "Busy, with 5,000 farm accounts", holders: 100, playChance: 0.3, farmers: 5_000 },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every player stakes 2% of their balance on each of three squares, capped at the mine's limit. */
function stakeOf(balance: number): number {
  const each = Math.min(Math.max(balance * 0.02, 1), MAX_PER_ROUND / SQUARES_PER_PLAYER);
  return balance >= each * SQUARES_PER_PLAYER ? each : 0;
}

function run(s: Scenario) {
  const random = rng(20_261_114 + s.key.length * 7 + s.holders);
  const balances: number[] = [];
  let starterLeft = STARTER_BUDGET;
  let minted = 0;
  let burned = 0;
  let starterMinted = 0;
  let motherlodeMinted = 0;
  let motherlode = 0;
  let hits = 0;
  let settled = 0;
  let refunded = 0;
  const rows: { day: number; supply: number; minted: number; burned: number; settled: number; refunded: number; players: number }[] = [];
  const claim = () => {
    if (starterLeft >= STARTER) {
      starterLeft -= STARTER;
      starterMinted += STARTER;
      minted += STARTER;
      return STARTER;
    }
    return 0;
  };
  // Farm accounts claim a starter on day 0 and never play: they only use up the budget.
  let farmClaims = 0;
  for (let i = 0; i < s.farmers; i += 1) if (claim() > 0) farmClaims += 1;
  let arrived = 0;

  for (let day = 0; day < DAYS; day += 1) {
    const arriveToday = Math.min(s.holders - arrived, Math.ceil(s.holders / ARRIVAL_DAYS));
    for (let i = 0; i < arriveToday; i += 1) balances.push(claim());
    arrived += arriveToday;
    const emission = EMISSION_PER_ROUND / 2 ** Math.floor(day / HALVING_DAYS);
    let dayPlayers = 0;
    for (let r = 0; r < ROUNDS_PER_DAY; r += 1) {
      const stakes = new Map<number, number[]>(); // square -> [player, amount][]
      const placed: { player: number; amount: number; squares: number[] }[] = [];
      for (let p = 0; p < balances.length; p += 1) {
        if (random() >= s.playChance) continue;
        const each = stakeOf(balances[p]);
        if (each <= 0) continue;
        const squares: number[] = [];
        while (squares.length < SQUARES_PER_PLAYER) {
          const q = Math.floor(random() * SQUARES);
          if (!squares.includes(q)) squares.push(q);
        }
        placed.push({ player: p, amount: each, squares });
        dayPlayers += 1;
        for (const q of squares) {
          const list = stakes.get(q) ?? [];
          list.push(p, each);
          stakes.set(q, list);
        }
      }
      if (placed.length === 0) continue;
      const winner = Math.floor(random() * SQUARES);
      const onWinner = stakes.get(winner);
      if (!onWinner) {
        // Empty winning square: every stake is refunded, nothing burned, nothing minted.
        refunded += 1;
        continue;
      }
      settled += 1;
      let total = 0;
      for (const { amount, squares } of placed) total += amount * squares.length;
      let winnersStake = 0;
      const winnerParts = new Map<number, number>();
      for (let i = 0; i < onWinner.length; i += 2) {
        winnersStake += onWinner[i + 1];
        winnerParts.set(onWinner[i], (winnerParts.get(onWinner[i]) ?? 0) + onWinner[i + 1]);
      }
      const losing = total - winnersStake;
      const burn = Math.floor(losing * BURN_PCT);
      const share = losing - burn;
      burned += burn;
      // Everyone pays their stakes; winners get their stake back plus their share.
      for (const { player, amount, squares } of placed) balances[player] -= amount * squares.length;
      for (const [player, stake] of winnerParts) balances[player] += stake + (share * stake) / winnersStake;
      // Emission and the Motherlode go to this round's winners, by stake.
      let mint = Math.min(emission, SUPPLY_CAP - minted);
      motherlode = Math.min(MOTHERLODE_CAP, motherlode + MOTHERLODE_ADD);
      if (random() < 1 / MOTHERLODE_ODDS) {
        const jackpot = Math.min(motherlode, SUPPLY_CAP - minted - mint);
        motherlodeMinted += jackpot;
        mint += jackpot;
        motherlode = 0;
        hits += 1;
      }
      minted += mint;
      for (const [player, stake] of winnerParts) balances[player] += (mint * stake) / winnersStake;
    }
    rows.push({ day: day + 1, supply: minted - burned, minted, burned, settled, refunded, players: dayPlayers });
  }
  return {
    key: s.key,
    name: s.name,
    finalSupply: minted - burned,
    minted,
    burned,
    starterMinted,
    emissionMinted: minted - starterMinted - motherlodeMinted,
    motherlodeMinted,
    motherlodeHits: hits,
    roundsSettled: settled,
    roundsRefunded: refunded,
    emptyShare: settled + refunded > 0 ? refunded / (settled + refunded) : 0,
    rows,
    check: { supplyIsMintedLessBurned: Math.abs(minted - burned - (balances.reduce((a, b) => a + b, 0) + farmClaims * STARTER)) < 1e-6 * Math.max(1, minted) },
  };
}

const results = SCENARIOS.map(run);

const outDir = resolve(process.cwd(), "docs/near/v3");
mkdirSync(outDir, { recursive: true });
writeFileSync(
  resolve(outDir, "grid-simulation.json"),
  JSON.stringify(
    {
      note: "Simulation of the Kova v3 grid rules for the CHIP mine. Not a prediction. See scripts/near/grid-simulation.ts for what it leaves out.",
      days: DAYS,
      params: { roundsPerDay: ROUNDS_PER_DAY, burnPct: BURN_PCT, emissionPerRound: EMISSION_PER_ROUND, halvingDays: HALVING_DAYS, motherlodeOdds: MOTHERLODE_ODDS, starter: STARTER, starterBudget: STARTER_BUDGET, maxPerRound: MAX_PER_ROUND, squaresPerPlayer: SQUARES_PER_PLAYER },
      scenarios: results.map((r) => ({ ...r, rows: r.rows.filter((row) => row.day % 5 === 0 || row.day === 1) })),
    },
    null,
    2,
  ) + "\n",
);

// One chart: CHIP supply by day, labelled at the line ends. The farm-account scenario never plays, so
// its flat line at the starter budget would flatten the others; it stays in the table and the JSON.
const charted = results.filter((r) => r.key !== "farmed");
const W = 760;
const H = 420;
const m = { l: 74, r: 190, t: 46, b: 52 };
const maxY = Math.max(...charted.flatMap((r) => r.rows.map((x) => x.supply)));
const niceMax = Math.ceil(maxY / 5_000) * 5_000 || 5_000;
const x = (day: number) => m.l + ((W - m.l - m.r) * day) / DAYS;
const y = (v: number) => H - m.b - ((H - m.t - m.b) * v) / niceMax;
const colors = ["#6b7280", "#2563eb", "#d97706"];
const fmt = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif" font-size="12">\n`;
svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>\n`;
svg += `<text x="${m.l}" y="24" font-size="15" font-weight="600" fill="#111827">CHIP supply over 60 days, simulated (one mine, grid rules)</text>\n`;
for (let i = 0; i <= 5; i += 1) {
  const v = (niceMax * i) / 5;
  svg += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="#e5e7eb"/>\n<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" fill="#4b5563">${fmt(v)}</text>\n`;
}
for (const d of [0, 10, 20, 30, 40, 50, 60]) svg += `<text x="${x(d)}" y="${H - m.b + 20}" text-anchor="middle" fill="#4b5563">${d}</text>\n`;
svg += `<text x="${(m.l + W - m.r) / 2}" y="${H - 10}" text-anchor="middle" fill="#4b5563">day</text>\n`;
svg += `<text x="16" y="${H / 2}" text-anchor="middle" fill="#4b5563" transform="rotate(-90 16 ${H / 2})">CHIP in circulation</text>\n`;
// Label positions: the line ends can be close, so push the labels at least 16px apart.
const ends = charted.map((r, i) => ({ i, y: y(r.rows[r.rows.length - 1].supply) })).sort((a, b) => a.y - b.y);
for (let k = 1; k < ends.length; k += 1) if (ends[k].y - ends[k - 1].y < 16) ends[k].y = ends[k - 1].y + 16;
charted.forEach((r, i) => {
  const pts = [{ day: 0, supply: 0 }, ...r.rows].map((row) => `${x(row.day).toFixed(1)},${y(row.supply).toFixed(1)}`).join(" ");
  svg += `<polyline fill="none" stroke="${colors[i]}" stroke-width="2" points="${pts}"/>\n`;
  const labelY = ends.find((e) => e.i === i)!.y + 4;
  svg += `<text x="${x(60) + 8}" y="${labelY}" fill="${colors[i]}" font-weight="600">${r.name}</text>\n`;
});
svg += `</svg>\n`;
writeFileSync(resolve(outDir, "grid-supply.svg"), svg);

console.log("Kova v3 grid simulation, 60 days, CHIP mine");
for (const r of results) {
  console.log(
    `${r.name.padEnd(34)} supply ${Math.round(r.finalSupply).toLocaleString()}  minted ${Math.round(r.minted).toLocaleString()} (starter ${Math.round(r.starterMinted).toLocaleString()}, emission ${Math.round(r.emissionMinted).toLocaleString()}, motherlode ${Math.round(r.motherlodeMinted).toLocaleString()} in ${r.motherlodeHits} hits)  burned ${Math.round(r.burned).toLocaleString()}  rounds settled ${r.roundsSettled.toLocaleString()} / refunded ${r.roundsRefunded.toLocaleString()}  balances add up: ${r.check.supplyIsMintedLessBurned}`,
  );
}

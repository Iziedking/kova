/**
 * 60-day supply simulation for CHIP, the Kova poker chip on NEAR.
 *
 * It applies the same rules as near/chip/src/rules.rs and lib.rs: the pot burn and its split,
 * the daily call (mint on a met target, treasury burn on a miss), the starter claim, and blinds
 * with grace, period, rate and floor. Randomness is seeded, so the output is reproducible.
 *
 * Run:  npx tsx scripts/near/chip-simulation.ts
 * Writes docs/near/chip-simulation.json and docs/near/chip-supply.svg.
 *
 * What it does not model: prices (a table winner is drawn at random, which is what a fair
 * price race looks like from the token's point of view), transfers between holders, and
 * tables refunded because the settler stopped.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type Params = {
  label: string
  treasury: number
  houseBankroll: number
  starter: number
  stakes: number[]
  maxStake: number
  potBurnBps: number
  dailyTarget: number
  dailyMint: number
  missBurnBps: number
  blindGraceDays: number
  blindBps: number
  blindFloor: number
  /** Shares of the daily mint a member of the day's top clan claims; everyone else claims one. */
  clanTopWeight: number
}

type Scenario = {
  key: string
  name: string
  /** Holders who arrive on each of the first `arrivalDays` days. */
  holders: number
  arrivalDays: number
  /** Share of holders who ever play, and their daily chance of playing. */
  playerShare: number
  playChance: number
  /** Accounts that claim the starter and never play (sybil farming). */
  farmers?: number
  /** One account with this balance that plays a max-stake table against the House daily. */
  whale?: number
}

type Holder = {
  balance: number
  lastPlay: number
  blindThrough: number
  player: boolean
  whale: boolean
  /** One of five clans, or none. Assigned by arrival order, not by the random generator. */
  clan: number | null
}

/** 60% of holders join one of five clans; the rest stay clanless. No random draw is used. */
function clanFor(index: number): number | null {
  return index % 10 < 6 ? index % 5 : null
}

/** Days where the clan split and the equal split were both checked against the fixed mint. */
const clanCheck = { metDays: 0, maxDustWithClans: 0, maxDustEqualSplit: 0, topClanShareMax: 0 }

type DayRow = {
  day: number
  supply: number
  treasury: number
  circulating: number
  tables: number
  players: number
  targetMet: boolean
  potBurned: number
  dailyBurned: number
  minted: number
  blinds: number
  starters: number
  houseBalance: number
}

const BPS = 10_000
const DAYS = 60

/** Small, fast, seeded generator so each run is identical. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Same as rules::blind_owed with whole days as the unit of time. */
function blindOwed(h: Holder, today: number, p: Params): number {
  const from = Math.max(h.lastPlay + p.blindGraceDays, h.blindThrough)
  if (today <= from) return 0
  const periods = today - from
  h.blindThrough = from + periods
  const rate = Math.min(p.blindBps * periods, BPS)
  const raw = (h.balance * rate) / BPS
  return Math.max(0, Math.min(raw, h.balance - p.blindFloor))
}

function simulate(p: Params, s: Scenario, seed: number): DayRow[] {
  const random = rng(seed)
  let treasury = p.treasury
  let escrowBurned = 0
  let dailyBurned = 0
  let minted = 0
  let blinds = 0
  let starters = 0
  const house: Holder = {
    balance: p.houseBankroll,
    lastPlay: 0,
    blindThrough: 0,
    player: true,
    whale: false,
    clan: null,
  }
  const holders: Holder[] = []
  const rows: DayRow[] = []
  const initialSupply = p.treasury + p.houseBankroll

  const claimStarter = (h: Holder) => {
    if (treasury < p.starter) return false
    treasury -= p.starter
    h.balance += p.starter
    starters += 1
    return true
  }

  for (let day = 0; day < DAYS; day += 1) {
    // Arrivals claim the starter.
    if (day < s.arrivalDays) {
      const count = Math.round(s.holders / s.arrivalDays)
      for (let i = 0; i < count; i += 1) {
        const h: Holder = {
          balance: 0,
          lastPlay: day,
          blindThrough: day,
          player: random() < s.playerShare,
          whale: false,
          clan: clanFor(holders.length),
        }
        if (claimStarter(h)) holders.push(h)
      }
    }
    if (day < 3 && s.farmers) {
      for (let i = 0; i < Math.round(s.farmers / 3); i += 1) {
        const h: Holder = { balance: 0, lastPlay: day, blindThrough: day, player: false, whale: false, clan: null }
        if (claimStarter(h)) holders.push(h)
      }
    }
    if (day === 0 && s.whale) {
      holders.push({ balance: s.whale, lastPlay: 0, blindThrough: 0, player: true, whale: true, clan: null })
      treasury -= s.whale // The whale's chips come out of earlier starter claims it bought up.
    }

    // The worker sweeps blinds from idle holders once a day (anyone may call collect_blinds).
    for (const h of holders) {
      const owed = blindOwed(h, day, p)
      h.balance -= owed
      treasury += owed
      blinds += owed
    }

    // Who plays today, and at what stake.
    const seated: Holder[] = []
    const stakeOf = new Map<Holder, number>()
    for (const h of holders) {
      if (!h.player) continue
      if (h.whale) {
        const stake = Math.min(p.maxStake, h.balance)
        if (stake > 0) {
          seated.push(h)
          stakeOf.set(h, stake)
        }
        continue
      }
      if (random() >= s.playChance) continue
      const tables = 1 + Math.floor(random() * 3)
      for (let t = 0; t < tables; t += 1) {
        const stake = p.stakes[Math.floor(random() * p.stakes.length)]
        if (h.balance - (stakeOf.get(h) ?? 0) < stake) break
        seated.push(h)
        stakeOf.set(h, (stakeOf.get(h) ?? 0) + stake)
      }
    }

    // Pair seats into two-seat tables at the lower stake; an unmatched seat plays the House,
    // which sits out when it cannot cover the stake.
    const order = seated.sort(() => random() - 0.5)
    const playedToday = new Set<Holder>()
    let tables = 0
    let potBurnedToday = 0
    // The clan race, as in settle_round: each table counts once per clan at it; strictly more
    // takes the lead, so on a tie the clan that got there first keeps it.
    const clanTables = new Map<number, number>()
    const race: { top: number | null; tables: number } = { top: null, tables: 0 }
    const settle = (a: Holder, b: Holder, stake: number) => {
      for (const clan of new Set([a.clan, b.clan])) {
        if (clan === null) continue
        const count = (clanTables.get(clan) ?? 0) + 1
        clanTables.set(clan, count)
        if (count > race.tables) {
          race.top = clan
          race.tables = count
        }
      }
      a.balance -= stake
      b.balance -= stake
      a.lastPlay = day
      a.blindThrough = day
      b.lastPlay = day
      b.blindThrough = day
      const pot = 2 * stake
      const burn = Math.floor((pot * p.potBurnBps) / BPS)
      const winner = random() < 0.5 ? a : b
      winner.balance += pot - burn
      potBurnedToday += burn
      tables += 1
      playedToday.add(a)
      playedToday.add(b)
    }
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i]
      const b = order[i + 1]
      const stake = Math.min(
        p.maxStake,
        a.whale ? (stakeOf.get(a) ?? 0) : p.stakes[Math.floor(random() * p.stakes.length)],
      )
      if (b && b !== a && a.balance >= stake && b.balance >= stake) {
        settle(a, b, stake)
      } else if (a.balance >= stake && house.balance >= stake) {
        settle(a, house, stake)
      }
    }
    escrowBurned += potBurnedToday

    // Close the day.
    const targetMet = tables >= p.dailyTarget && playedToday.size > 0
    let dailyBurnToday = 0
    if (targetMet) {
      // As in close_day: top-clan players claim `clanTopWeight` shares, everyone else one.
      const players = playedToday.size
      const topClan = race.top
      const topPlayers = [...playedToday].filter((h) => topClan !== null && h.clan === topClan).length
      const shares = players + (p.clanTopWeight - 1) * topPlayers
      const share = Math.floor(p.dailyMint / shares)
      // The fixed mint is the same with and without clans: both splits hand it all out, less
      // an indivisible remainder below one share count.
      const withClans = share * shares
      const equalSplit = Math.floor(p.dailyMint / players) * players
      if (withClans > p.dailyMint || p.dailyMint - withClans >= shares || p.dailyMint - equalSplit >= players) {
        throw new Error(`Day ${day}: clan split ${withClans} or equal split ${equalSplit} is not the fixed mint ${p.dailyMint}`)
      }
      clanCheck.metDays += 1
      clanCheck.maxDustWithClans = Math.max(clanCheck.maxDustWithClans, p.dailyMint - withClans)
      clanCheck.maxDustEqualSplit = Math.max(clanCheck.maxDustEqualSplit, p.dailyMint - equalSplit)
      clanCheck.topClanShareMax = Math.max(clanCheck.topClanShareMax, (share * p.clanTopWeight * topPlayers) / p.dailyMint)
      for (const h of playedToday) {
        if (random() < 0.9) {
          const amount = topClan !== null && h.clan === topClan ? share * p.clanTopWeight : share
          h.balance += amount
          minted += amount
        }
      }
    } else {
      dailyBurnToday = Math.floor((treasury * p.missBurnBps) / BPS)
      treasury -= dailyBurnToday
      dailyBurned += dailyBurnToday
    }

    const circulating = holders.reduce((sum, h) => sum + h.balance, 0) + house.balance
    const supply = circulating + treasury
    const expected = initialSupply + minted - escrowBurned - dailyBurned
    if (Math.abs(supply - expected) > 1e-6 * initialSupply) {
      throw new Error(`Supply drift on day ${day}: ${supply} vs ${expected}`)
    }
    rows.push({
      day: day + 1,
      supply,
      treasury,
      circulating,
      tables,
      players: playedToday.size,
      targetMet,
      potBurned: escrowBurned,
      dailyBurned,
      minted,
      blinds,
      starters,
      houseBalance: house.balance,
    })
  }
  return rows
}

const SCENARIOS: Scenario[] = [
  { key: 'busy', name: 'Busy community', holders: 300, arrivalDays: 10, playerShare: 0.8, playChance: 0.6 },
  { key: 'quiet', name: 'Quiet community', holders: 300, arrivalDays: 10, playerShare: 0.5, playChance: 0.08 },
  {
    key: 'whale',
    name: 'One whale',
    holders: 150,
    arrivalDays: 10,
    playerShare: 0.6,
    playChance: 0.3,
    whale: 150_000,
  },
  {
    key: 'farmers',
    name: 'Starter farmers',
    holders: 100,
    arrivalDays: 10,
    playerShare: 0.6,
    playChance: 0.4,
    farmers: 900,
  },
  {
    key: 'idle',
    name: 'Most never play',
    holders: 500,
    arrivalDays: 10,
    playerShare: 0.1,
    playChance: 0.6,
  },
]

const BASE: Omit<Params, 'label'> = {
  treasury: 1_000_000,
  houseBankroll: 50_000,
  starter: 1_000,
  stakes: [10, 25, 50, 100],
  maxStake: 1_000,
  potBurnBps: 1_000,
  dailyTarget: 30,
  dailyMint: 2_000,
  missBurnBps: 100,
  blindGraceDays: 3,
  blindBps: 100,
  blindFloor: 100,
  clanTopWeight: 2,
}

const CANDIDATES: Params[] = [
  { ...BASE, label: 'chosen' },
  // First draft: target too easy and mint too large, so every active community inflated.
  { ...BASE, label: 'draft', dailyTarget: 20, dailyMint: 5_000, missBurnBps: 200 },
  { ...BASE, label: 'harsher', potBurnBps: 2_000, missBurnBps: 300, blindBps: 300, blindGraceDays: 1 },
  { ...BASE, label: 'softer', potBurnBps: 500, missBurnBps: 50, blindBps: 50, blindGraceDays: 7, dailyMint: 5_000 },
]

function summarize(rows: DayRow[]) {
  const first = rows[0]
  const last = rows[rows.length - 1]
  return {
    supplyDay1: Math.round(first.supply),
    supplyDay60: Math.round(last.supply),
    supplyChangePct: Number((((last.supply - first.supply) / first.supply) * 100).toFixed(2)),
    treasuryDay60: Math.round(last.treasury),
    daysTargetMet: rows.filter((r) => r.targetMet).length,
    potBurned: Math.round(last.potBurned),
    dailyBurned: Math.round(last.dailyBurned),
    minted: Math.round(last.minted),
    blinds: Math.round(last.blinds),
    starters: last.starters,
    houseBalanceDay60: Math.round(last.houseBalance),
    avgTablesPerDay: Number((rows.reduce((s, r) => s + r.tables, 0) / rows.length).toFixed(1)),
  }
}

// ---------------------------------------------------------------- chart

const COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']

function linePanel(
  title: string,
  series: { name: string; values: number[] }[],
  y0: number,
  width: number,
  height: number,
): string {
  const left = 72
  const right = 36
  const top = y0 + 36
  const plotH = height - 70
  const plotW = width - left - right
  const all = series.flatMap((s) => s.values)
  const max = Math.max(...all)
  const min = Math.min(0, Math.min(...all))
  const niceMax = Math.ceil(max / 100_000) * 100_000
  const x = (i: number) => left + (i / (DAYS - 1)) * plotW
  const y = (v: number) => top + plotH - ((v - min) / (niceMax - min)) * plotH
  const ticks = 5
  let out = `<text x="${left}" y="${y0 + 20}" class="title">${title}</text>`
  for (let t = 0; t <= ticks; t += 1) {
    const v = min + ((niceMax - min) * t) / ticks
    const yy = y(v).toFixed(1)
    out += `<line x1="${left}" x2="${left + plotW}" y1="${yy}" y2="${yy}" class="grid"/>`
    out += `<text x="${left - 8}" y="${yy}" class="tick" text-anchor="end" dominant-baseline="middle">${Math.round(v / 1000).toLocaleString('en-US')}k</text>`
  }
  for (const d of [1, 10, 20, 30, 40, 50, 60]) {
    out += `<text x="${x(d - 1).toFixed(1)}" y="${top + plotH + 18}" class="tick" text-anchor="middle">day ${d}</text>`
  }
  series.forEach((s, i) => {
    const points = s.values.map((v, d) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    out += `<polyline points="${points}" fill="none" stroke="${COLORS[i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><title>${s.name}</title></polyline>`
  })
  return out
}

function chart(results: Record<string, DayRow[]>): string {
  const width = 760
  const panel = 300
  const legendH = 40
  const height = legendH + panel * 2 + 30
  const names = SCENARIOS.map((s) => s.name)
  let legend = ''
  let lx = 72
  names.forEach((name, i) => {
    legend += `<rect x="${lx}" y="14" width="12" height="12" rx="3" fill="${COLORS[i]}"/><text x="${lx + 18}" y="20" class="legend" dominant-baseline="middle">${name}</text>`
    lx += 22 + name.length * 7.2
  })
  const supply = SCENARIOS.map((s) => ({ name: s.name, values: results[s.key].map((r) => r.supply) }))
  const treasury = SCENARIOS.map((s) => ({ name: s.name, values: results[s.key].map((r) => r.treasury) }))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d">
<title id="t">CHIP supply and treasury over 60 simulated days</title>
<desc id="d">Simulated, not live data. Total CHIP supply and treasury per day for five scenarios with the chosen parameters. Numbers are in docs/near/chip-simulation.json.</desc>
<style>
  .bg{fill:#fcfcfb} .title{font:600 14px system-ui,sans-serif;fill:#1f1f1e}
  .tick,.legend{font:12px system-ui,sans-serif;fill:#5f5e58} .grid{stroke:#e6e5e0;stroke-width:1}
  .note{font:11px system-ui,sans-serif;fill:#5f5e58}
  @media (prefers-color-scheme: dark){ .bg{fill:#1a1a19} .title{fill:#f0efec} .tick,.legend,.note{fill:#c3c2b7} .grid{stroke:#2e2e2c} }
</style>
<rect class="bg" width="100%" height="100%"/>
${legend}
<g>${linePanel('Total supply (CHIP)', supply, legendH, width, panel)}</g>
<g>${linePanel('Treasury (CHIP)', treasury, legendH + panel, width, panel)}</g>
<text x="72" y="${height - 8}" class="note">Simulated with the chosen parameters (seeded). Not live data.</text>
</svg>
`
}

// ---------------------------------------------------------------- main

const SEED = 20261112
const output: Record<string, unknown> = { seed: SEED, days: DAYS, scenarios: SCENARIOS, candidates: {} }
let chosenResults: Record<string, DayRow[]> = {}
for (const params of CANDIDATES) {
  const results: Record<string, DayRow[]> = {}
  const summary: Record<string, unknown> = {}
  SCENARIOS.forEach((scenario, i) => {
    results[scenario.key] = simulate(params, scenario, SEED + i)
    summary[scenario.key] = summarize(results[scenario.key])
  })
  ;(output.candidates as Record<string, unknown>)[params.label] = {
    params,
    summary,
    daily: params.label === 'chosen' ? results : undefined,
  }
  if (params.label === 'chosen') chosenResults = results
  console.log(`\n== ${params.label}`)
  console.table(summary)
}

output.clanCheck = { ...clanCheck, note: "Every met day in every scenario and candidate: the clan split and the equal split each hand out the fixed daily mint, less dust below the share count." }
console.log('\n== clan race check')
console.table(clanCheck)

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..')
const outDir = resolve(root, 'docs', 'near')
mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'chip-simulation.json'), JSON.stringify(output, null, 2) + '\n')
writeFileSync(resolve(outDir, 'chip-supply.svg'), chart(chosenResults))
// The token page serves the same chart.
const publicDir = resolve(root, 'public', 'near')
mkdirSync(publicDir, { recursive: true })
writeFileSync(resolve(publicDir, 'chip-supply.svg'), chart(chosenResults))
// A slim copy for the token page's fast-forward replay.
const replay = {
  simulated: true,
  seed: SEED,
  scenarios: SCENARIOS.map((s) => ({
    key: s.key,
    name: s.name,
    supply: chosenResults[s.key].map((r) => Math.round(r.supply)),
    treasury: chosenResults[s.key].map((r) => Math.round(r.treasury)),
    targetMet: chosenResults[s.key].map((r) => r.targetMet),
  })),
}
writeFileSync(resolve(publicDir, 'chip-replay.json'), JSON.stringify(replay) + '\n')
console.log(`\nWrote ${resolve(outDir, 'chip-simulation.json')} and chip-supply.svg`)

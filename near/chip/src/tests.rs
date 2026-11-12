//! Unit tests against the mocked chain. Each refusal test checks the panic message.

use super::*;
use near_contract_standards::fungible_token::metadata::FT_METADATA_SPEC;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::testing_env;
use std::panic::{AssertUnwindSafe, catch_unwind};

const ONE: u128 = 1_000_000_000_000_000_000;
const DAY: u64 = 86_400;
/// 2026-11-12 00:00:00 UTC, so tests start at the beginning of a UTC day.
const T0: u64 = 1_794_441_600;

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn contract_id() -> AccountId {
    id("chip.test")
}

fn config() -> Config {
    Config {
        settler: id("settler.test"),
        starter_amount: U128(1_000 * ONE),
        min_stake: U128(1),
        max_stake: U128(1_000 * ONE),
        pot_burn_bps: 1_000,
        daily_target_tables: 2,
        daily_mint: U128(10_000 * ONE + 1),
        daily_miss_burn_bps: 100,
        blind_grace_seconds: DAY,
        blind_period_seconds: DAY,
        blind_bps: 200,
        blind_floor: U128(100 * ONE),
    }
}

fn metadata() -> FungibleTokenMetadata {
    FungibleTokenMetadata {
        spec: FT_METADATA_SPEC.to_string(),
        name: "Kova Chip".to_string(),
        symbol: "CHIP".to_string(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 18,
    }
}

struct World {
    chip: Contract,
    now: u64,
    known: Vec<AccountId>,
}

fn call_as(name: &str, now: u64, deposit: u128) {
    let account = id(name);
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(contract_id())
            .predecessor_account_id(account.clone())
            .signer_account_id(account)
            .block_timestamp(now * 1_000_000_000)
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .build()
    );
}

impl World {
    fn new() -> Self {
        Self::with_config(config())
    }

    fn with_config(config: Config) -> Self {
        call_as("chip.test", T0, 0);
        let chip = Contract::new(
            metadata(),
            config,
            U128(1_000_000 * ONE),
            id("house.test"),
            U128(50_000 * ONE),
        );
        Self {
            chip,
            now: T0,
            known: vec![id("house.test")],
        }
    }

    fn as_(&mut self, name: &str) -> &mut Contract {
        call_as(name, self.now, 0);
        &mut self.chip
    }

    fn advance(&mut self, seconds: u64) {
        self.now += seconds;
    }

    fn starter(&mut self, name: &str) {
        self.as_(name).claim_starter();
        self.known.push(id(name));
    }

    /// Views run in the current mocked context, so the last call's logs stay readable.
    fn balance(&mut self, name: &str) -> u128 {
        self.chip.ft_balance_of(id(name)).0
    }

    fn stored(&self, name: &str) -> u128 {
        self.chip.token.accounts.get(&id(name)).unwrap_or(0)
    }

    /// Total supply always equals the sum of balances plus the treasury plus table stakes, and
    /// it equals the initial supply plus every mint minus every burn.
    fn check_supply(&mut self) {
        let sum: u128 = self
            .known
            .iter()
            .map(|a| self.chip.token.accounts.get(a).unwrap_or(0))
            .sum();
        assert_eq!(sum, self.chip.token.total_supply, "balances vs circulating");
        let stats = self.chip.get_stats();
        assert_eq!(
            stats.total_supply.0,
            sum + stats.treasury.0 + stats.escrow.0,
            "supply vs balances + treasury + escrow"
        );
        assert_eq!(
            stats.total_supply.0,
            stats.initial_supply.0 + stats.total_minted.0 - stats.total_burned.0,
            "supply vs initial + minted - burned"
        );
        assert_eq!(self.chip.ft_total_supply(), stats.total_supply);
    }

    fn open(&mut self, host: &str, stake: u128, seats: u8, market: &str) -> u64 {
        let commitment = commit(host, market);
        self.as_(host)
            .open_table(U128(stake), seats, 60, 120, commitment)
            .0
    }

    fn join(&mut self, table: u64, player: &str, market: &str) {
        let commitment = commit(player, market);
        self.as_(player).join_table(U64(table), commitment);
    }

    fn start(&mut self, table: u64, picks: &[(&str, &str, u128)]) {
        let reveals = picks
            .iter()
            .map(|(player, market, price)| Reveal {
                player: id(player),
                market: market.to_string(),
                salt: salt(player),
                start_price: U128(*price),
            })
            .collect();
        self.as_("settler.test").start_round(U64(table), reveals);
    }

    fn settle(&mut self, table: u64, prices: &[(&str, u128)]) {
        let reports = prices
            .iter()
            .map(|(player, price)| PriceReport {
                player: id(player),
                end_price: U128(*price),
            })
            .collect();
        self.as_("settler.test").settle_round(U64(table), reports);
    }

    fn table(&self, table: u64) -> Table {
        self.chip.get_table(U64(table)).unwrap()
    }
}

fn salt(player: &str) -> String {
    format!("salt-{player}-0123456789abcdef")
}

fn commit(player: &str, market: &str) -> String {
    pick_commitment(&id(player), market, &salt(player))
}

fn panics_with(f: impl FnOnce(), expected: &str) {
    let result = catch_unwind(AssertUnwindSafe(f));
    let err = result.expect_err("call should have been refused");
    let message = err
        .downcast_ref::<String>()
        .cloned()
        .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default();
    assert!(
        message.contains(expected),
        "expected panic containing {expected:?}, got {message:?}"
    );
}

const PLAYERS: [&str; 6] = [
    "alice.test",
    "bob.test",
    "carol.test",
    "dave.test",
    "erin.test",
    "frank.test",
];

/// The same vector is asserted in tests/near/chip-client.test.ts, so the app and the contract
/// can never disagree about a commitment.
#[test]
fn commitment_vector_matches_the_typescript_client() {
    call_as("anyone.test", T0, 0);
    assert_eq!(
        pick_commitment(
            &id("alice.testnet"),
            "near:blackdragon.tkn.near",
            "00112233445566778899aabbccddeeff"
        ),
        "e5c7cd5b89865003c0aac5ba6fde8659a7f6b82519ee0b3909f3794388ff3bfe"
    );
}

// ---------------------------------------------------------------- genesis and the starter claim

#[test]
fn genesis_mints_treasury_and_house_bankroll() {
    let mut w = World::new();
    let stats = w.chip.get_stats();
    assert_eq!(stats.treasury.0, 1_000_000 * ONE);
    assert_eq!(stats.initial_supply.0, 1_050_000 * ONE);
    assert_eq!(w.balance("house.test"), 50_000 * ONE);
    assert_eq!(w.balance("chip.test"), 1_000_000 * ONE);
    w.check_supply();
}

#[test]
fn starter_claim_pays_once() {
    let mut w = World::new();
    w.starter("alice.test");
    assert_eq!(w.balance("alice.test"), 1_000 * ONE);
    assert!(get_logs().iter().any(|l| l.contains("\"memo\":\"starter\"")));
    panics_with(
        || {
            w.as_("alice.test").claim_starter();
        },
        "Starter chips were already claimed",
    );
    w.check_supply();
}

#[test]
fn starter_claim_stops_when_the_treasury_is_empty() {
    let mut cfg = config();
    cfg.starter_amount = U128(600_000 * ONE);
    let mut w = World::with_config(cfg);
    w.starter("alice.test");
    panics_with(
        || {
            w.as_("bob.test").claim_starter();
        },
        "The treasury is empty",
    );
}

#[test]
fn init_refuses_bad_parameters() {
    let mut cfg = config();
    cfg.pot_burn_bps = 0;
    panics_with(|| drop(World::with_config(cfg)), "Pot burn is outside");
    let mut cfg = config();
    cfg.blind_bps = 1_001;
    panics_with(|| drop(World::with_config(cfg)), "Blind is above");
    let mut cfg = config();
    cfg.daily_target_tables = 0;
    panics_with(|| drop(World::with_config(cfg)), "Daily target");
}

// ---------------------------------------------------------------- stakes in, stakes out plus burn

/// Plays one table with `n` seats. `ends` gives each seat's end price against a start of 1.0.
/// Returns the stored balances before and after for every seat, and the burn.
fn play_table(n: usize, stake: u128, ends: &[u128]) -> (World, Vec<(u128, u128)>, u128) {
    let mut w = World::new();
    let players = &PLAYERS[..n];
    for p in players {
        w.starter(p);
    }
    let before: Vec<u128> = players.iter().map(|p| w.stored(p)).collect();
    let table = w.open(players[0], stake, n as u8, "meme-0");
    for (i, p) in players.iter().enumerate().skip(1) {
        w.join(table, p, &format!("meme-{i}"));
    }
    assert_eq!(w.table(table).status, TableStatus::Locked, "full table locks");
    assert_eq!(w.chip.get_stats().escrow.0, stake * n as u128);
    w.check_supply();
    let picks: Vec<(&str, String, u128)> = players
        .iter()
        .enumerate()
        .map(|(i, p)| (*p, format!("meme-{i}"), ONE))
        .collect();
    let picks_ref: Vec<(&str, &str, u128)> =
        picks.iter().map(|(p, m, s)| (*p, m.as_str(), *s)).collect();
    w.advance(10);
    w.start(table, &picks_ref);
    w.advance(60);
    let prices: Vec<(&str, u128)> = players.iter().zip(ends).map(|(p, e)| (*p, *e)).collect();
    w.settle(table, &prices);
    let after: Vec<u128> = players.iter().map(|p| w.stored(p)).collect();
    let burn = w.table(table).burned.0;
    w.check_supply();
    (w, before.into_iter().zip(after).collect(), burn)
}

fn assert_conserved(rows: &[(u128, u128)], stake: u128, burn: u128) {
    let before: u128 = rows.iter().map(|r| r.0).sum();
    let after: u128 = rows.iter().map(|r| r.1).sum();
    assert_eq!(before, after + burn, "stakes in == stakes out + burn");
    let pot = stake * rows.len() as u128;
    assert_eq!(burn, pot * 1_000 / 10_000, "10% of the pot burns");
}

#[test]
fn two_seats_winner_takes_pot_less_burn() {
    let stake = 10 * ONE + 7;
    let (w, rows, burn) = play_table(2, stake, &[2 * ONE, ONE / 2]);
    assert_conserved(&rows, stake, burn);
    let pot = 2 * stake;
    assert_eq!(rows[0].1, rows[0].0 - stake + (pot - burn));
    assert_eq!(rows[1].1, rows[1].0 - stake);
    assert_eq!(w.chip.get_stats().pot_burned.0, burn);
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("ft_burn") && l.contains("pot_burn:table:1"))
    );
}

#[test]
fn three_seats_tie_splits_remainder_in_seat_order() {
    let stake = 7;
    let (_w, rows, burn) = play_table(3, stake, &[ONE, 3 * ONE, 3 * ONE]);
    assert_conserved(&rows, stake, burn);
    // pot 21, burn 2, payout 19 split 10 + 9 between seats 2 and 3.
    assert_eq!(burn, 2);
    assert_eq!(rows[1].1 - (rows[1].0 - stake), 10);
    assert_eq!(rows[2].1 - (rows[2].0 - stake), 9);
    assert_eq!(rows[0].1, rows[0].0 - stake);
}

#[test]
fn six_seats_conserve_every_unit() {
    let stake = 33 * ONE + 3;
    let (_w, rows, burn) = play_table(6, stake, &[ONE, 2 * ONE, ONE, 0, 2 * ONE, ONE]);
    assert_conserved(&rows, stake, burn);
}

#[test]
fn six_seats_all_tied() {
    let stake = 11;
    let (_w, rows, burn) = play_table(6, stake, &[ONE; 6]);
    assert_conserved(&rows, stake, burn);
    // pot 66, burn 6, payout 60, ten each.
    for row in &rows {
        assert_eq!(row.1, row.0 - stake + 10);
    }
}

// ---------------------------------------------------------------- refunds

#[test]
fn a_table_that_does_not_fill_refunds_everyone_by_a_third_account() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("alice.test", 50 * ONE, 3, "a");
    w.join(table, "bob.test", "b");
    panics_with(
        || w.as_("carol.test").void_table(U64(table)),
        "No deadline has passed",
    );
    w.advance(120);
    w.as_("carol.test").void_table(U64(table));
    assert_eq!(w.table(table).status, TableStatus::Cancelled);
    assert_eq!(w.balance("alice.test"), 1_000 * ONE);
    assert_eq!(w.balance("bob.test"), 1_000 * ONE);
    assert_eq!(w.chip.get_stats().escrow.0, 0);
    w.check_supply();
    panics_with(
        || w.as_("carol.test").void_table(U64(table)),
        "No deadline has passed",
    );
}

#[test]
fn a_locked_table_the_settler_never_starts_is_refundable() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("alice.test", 50 * ONE, 2, "a");
    w.join(table, "bob.test", "b");
    w.advance(START_WINDOW_SECONDS);
    w.as_("carol.test").void_table(U64(table));
    assert_eq!(w.table(table).status, TableStatus::Cancelled);
    assert_eq!(w.balance("bob.test"), 1_000 * ONE);
    w.check_supply();
}

#[test]
fn a_table_the_settler_never_finishes_is_refundable_after_the_deadline() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("alice.test", 50 * ONE, 2, "a");
    w.join(table, "bob.test", "b");
    w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]);
    w.advance(60 + SETTLE_WINDOW_SECONDS - 1);
    panics_with(
        || w.as_("carol.test").void_table(U64(table)),
        "No deadline has passed",
    );
    w.advance(1);
    panics_with(
        || w.settle(table, &[("alice.test", ONE), ("bob.test", ONE)]),
        "Settle window has passed",
    );
    w.as_("carol.test").void_table(U64(table));
    assert_eq!(w.table(table).status, TableStatus::Voided);
    assert_eq!(w.balance("alice.test"), 1_000 * ONE);
    assert_eq!(w.balance("bob.test"), 1_000 * ONE);
    assert_eq!(w.chip.get_stats().pot_burned.0, 0, "refunds burn nothing");
    w.check_supply();
}

// ---------------------------------------------------------------- settler limits

fn locked_pair() -> (World, u64) {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("alice.test", 50 * ONE, 2, "a");
    w.join(table, "bob.test", "b");
    (w, table)
}

#[test]
fn only_the_settler_can_start_or_settle() {
    let (mut w, table) = locked_pair();
    let reveals = vec![
        Reveal {
            player: id("alice.test"),
            market: "a".into(),
            salt: salt("alice.test"),
            start_price: U128(ONE),
        },
        Reveal {
            player: id("bob.test"),
            market: "b".into(),
            salt: salt("bob.test"),
            start_price: U128(ONE),
        },
    ];
    panics_with(
        || w.as_("alice.test").start_round(U64(table), reveals.clone()),
        "Only the settler",
    );
    w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]);
    w.advance(60);
    let reports = vec![
        PriceReport {
            player: id("alice.test"),
            end_price: U128(2 * ONE),
        },
        PriceReport {
            player: id("bob.test"),
            end_price: U128(ONE),
        },
    ];
    panics_with(
        || w.as_("house.test").settle_round(U64(table), reports),
        "Only the settler",
    );
}

#[test]
fn a_report_for_the_wrong_roster_is_refused() {
    let (mut w, table) = locked_pair();
    panics_with(
        || w.start(table, &[("bob.test", "b", ONE), ("alice.test", "a", ONE)]),
        "Reveals must follow seat order",
    );
    panics_with(
        || w.start(table, &[("alice.test", "a", ONE), ("carol.test", "b", ONE)]),
        "Reveals must follow seat order",
    );
    panics_with(
        || w.start(table, &[("alice.test", "a", ONE)]),
        "One reveal per seat",
    );
    panics_with(
        || w.start(table, &[("alice.test", "a", ONE), ("bob.test", "x", ONE)]),
        "Reveal does not match the commitment",
    );
    w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]);
    w.advance(60);
    panics_with(
        || w.settle(table, &[("bob.test", ONE), ("alice.test", ONE)]),
        "Prices must follow seat order",
    );
    panics_with(
        || w.settle(table, &[("alice.test", ONE)]),
        "One price per seat",
    );
}

#[test]
fn a_report_for_the_wrong_stage_is_refused() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("alice.test", 50 * ONE, 3, "a");
    w.join(table, "bob.test", "b");
    panics_with(
        || w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]),
        "Table is not locked",
    );
    panics_with(
        || w.settle(table, &[("alice.test", ONE), ("bob.test", ONE)]),
        "Table is not active",
    );
    w.as_("alice.test").lock_table(U64(table));
    w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]);
    panics_with(
        || w.settle(table, &[("alice.test", ONE), ("bob.test", ONE)]),
        "Round is still running",
    );
    panics_with(
        || w.start(table, &[("alice.test", "a", ONE), ("bob.test", "b", ONE)]),
        "Table is not locked",
    );
    w.advance(60);
    w.settle(table, &[("alice.test", ONE), ("bob.test", ONE)]);
    panics_with(
        || w.settle(table, &[("alice.test", ONE), ("bob.test", ONE)]),
        "Table is not active",
    );
    panics_with(
        || w.as_("carol.test").void_table(U64(table)),
        "No deadline has passed",
    );
}

#[test]
fn seats_are_checked() {
    let mut w = World::new();
    w.starter("alice.test");
    let table = w.open("alice.test", 50 * ONE, 2, "a");
    panics_with(|| w.join(table, "alice.test", "a"), "Already seated");
    panics_with(|| w.join(table, "nobody.test", "a"), "not registered");
    panics_with(
        || {
            w.as_("alice.test")
                .join_table(U64(table), "not-hex".into());
        },
        "Commitment must be 64",
    );
    panics_with(
        || {
            w.as_("alice.test").open_table(
                U128(5_000 * ONE),
                2,
                60,
                60,
                commit("alice.test", "a"),
            );
        },
        "Stake is outside",
    );
    panics_with(
        || {
            w.as_("alice.test")
                .open_table(U128(ONE), 7, 60, 60, commit("alice.test", "a"));
        },
        "Seats must be between",
    );
}

/// Its own test: mocked storage lives per test thread, so one contract per test.
#[test]
fn a_stake_above_the_balance_is_refused() {
    let mut cfg = config();
    cfg.max_stake = U128(10_000 * ONE);
    let mut w = World::with_config(cfg);
    w.starter("alice.test");
    panics_with(
        || {
            w.as_("alice.test").open_table(
                U128(2_000 * ONE),
                2,
                60,
                60,
                commit("alice.test", "a"),
            );
        },
        "Not enough CHIP",
    );
}

// ---------------------------------------------------------------- the daily call

fn settled_table(w: &mut World, a: &str, b: &str) {
    let table = w.open(a, 10 * ONE, 2, "a");
    w.join(table, b, "b");
    w.start(table, &[(a, "a", ONE), (b, "b", ONE)]);
    w.advance(60);
    w.settle(table, &[(a, 2 * ONE), (b, ONE)]);
}

#[test]
fn target_met_mints_once_per_player() {
    let mut w = World::new();
    for p in ["alice.test", "bob.test", "carol.test"] {
        w.starter(p);
    }
    settled_table(&mut w, "alice.test", "bob.test");
    settled_table(&mut w, "bob.test", "carol.test");
    assert_eq!(w.chip.get_stats().today_settled_tables, 2);
    panics_with(
        || {
            w.as_("dave.test").close_day(day_of(T0));
        },
        "Only a finished day",
    );
    w.now = T0 + DAY;
    let state = w.as_("dave.test").close_day(day_of(T0));
    assert!(state.target_met);
    assert_eq!(state.players, 3);
    // 10_000 CHIP + 1 unit shared by three players: the indivisible unit is never minted.
    let share = (10_000 * ONE + 1) / 3;
    assert_eq!(state.share.0, share);
    let treasury_before = w.chip.get_stats().treasury.0;
    let before = w.stored("carol.test");
    assert_eq!(w.as_("carol.test").claim_daily(day_of(T0)).0, share);
    assert_eq!(w.stored("carol.test"), before + share);
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("ft_mint") && l.contains("daily_call:day:"))
    );
    panics_with(
        || {
            w.as_("carol.test").claim_daily(day_of(T0));
        },
        "Daily share already claimed",
    );
    panics_with(
        || {
            w.as_("dave.test").claim_daily(day_of(T0));
        },
        "You did not play that day",
    );
    panics_with(
        || {
            w.as_("dave.test").close_day(day_of(T0));
        },
        "already closed",
    );
    assert_eq!(w.chip.get_stats().treasury.0, treasury_before, "a met day burns nothing");
    assert_eq!(w.chip.get_stats().total_minted.0, share);
    w.check_supply();
}

#[test]
fn target_missed_burns_the_treasury_once() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    settled_table(&mut w, "alice.test", "bob.test");
    w.now = T0 + DAY;
    let treasury = w.chip.get_stats().treasury.0;
    let state = w.as_("carol.test").close_day(day_of(T0));
    assert!(!state.target_met);
    assert_eq!(state.burned.0, treasury / 100);
    assert_eq!(w.chip.get_stats().treasury.0, treasury - treasury / 100);
    assert!(
        get_logs()
            .iter()
            .any(|l| l.contains("ft_burn") && l.contains("daily_miss:day:"))
    );
    panics_with(
        || {
            w.as_("carol.test").close_day(day_of(T0));
        },
        "already closed",
    );
    panics_with(
        || {
            w.as_("alice.test").claim_daily(day_of(T0));
        },
        "missed its target",
    );
    // An empty day burns too.
    w.now = T0 + 2 * DAY;
    let state = w.as_("carol.test").close_day(day_of(T0) + 1);
    assert!(!state.target_met);
    assert!(state.burned.0 > 0);
    panics_with(
        || {
            w.as_("carol.test").close_day(day_of(T0) - 1);
        },
        "before launch",
    );
    w.check_supply();
}

// ---------------------------------------------------------------- blinds

#[test]
fn no_blind_inside_the_grace_period() {
    let mut w = World::new();
    w.starter("alice.test");
    w.advance(DAY + DAY - 1);
    assert_eq!(w.balance("alice.test"), 1_000 * ONE);
    assert_eq!(w.as_("bob.test").collect_blinds(id("alice.test")).0, 0);
    w.check_supply();
}

#[test]
fn the_right_blind_after_the_grace_period() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    w.advance(3 * DAY);
    // Two full idle periods after one day of grace: 4% of 1000 CHIP.
    call_as("anyone.test", w.now, 0);
    let view = w.chip.get_holder(id("alice.test"));
    assert_eq!(view.pending_blind.0, 40 * ONE);
    assert_eq!(w.balance("alice.test"), 960 * ONE);
    let treasury = w.chip.get_stats().treasury.0;
    let supply = w.chip.get_stats().total_supply.0;
    // Receiving chips settles the blind on the old balance first.
    call_as("bob.test", w.now, 1);
    w.chip.ft_transfer(id("alice.test"), U128(100 * ONE), None);
    assert_eq!(w.stored("alice.test"), 960 * ONE + 100 * ONE);
    assert_eq!(w.stored("bob.test"), 960 * ONE - 100 * ONE);
    let stats = w.chip.get_stats();
    assert_eq!(stats.treasury.0, treasury + 80 * ONE);
    assert_eq!(stats.blinds_collected.0, 80 * ONE);
    assert_eq!(stats.total_supply.0, supply, "blinds move chips, they do not burn");
    assert!(get_logs().iter().any(|l| l.contains("\"memo\":\"blind\"")));
    w.check_supply();
}

#[test]
fn the_blind_cap_holds() {
    let mut w = World::new();
    w.starter("alice.test");
    w.advance(10 * 365 * DAY);
    assert_eq!(w.as_("bob.test").collect_blinds(id("alice.test")).0, 900 * ONE);
    assert_eq!(w.balance("alice.test"), 100 * ONE);
    w.advance(365 * DAY);
    assert_eq!(w.as_("bob.test").collect_blinds(id("alice.test")).0, 0);
    w.check_supply();
}

#[test]
fn staking_resets_the_blind_clock() {
    let mut w = World::new();
    w.starter("alice.test");
    w.starter("bob.test");
    w.advance(2 * DAY);
    // Alice owes one period (20 CHIP), paid when she stakes.
    w.open("alice.test", 10 * ONE, 2, "a");
    assert_eq!(w.stored("alice.test"), 980 * ONE - 10 * ONE);
    w.advance(DAY);
    assert_eq!(w.as_("x.test").collect_blinds(id("alice.test")).0, 0);
    // Bob did not play and now owes two periods.
    assert_eq!(w.as_("x.test").collect_blinds(id("bob.test")).0, 40 * ONE);
    w.check_supply();
}

#[test]
fn transfers_to_the_contract_are_refused() {
    let mut w = World::new();
    w.starter("alice.test");
    call_as("alice.test", w.now, 1);
    panics_with(
        || w.chip.ft_transfer(contract_id(), U128(ONE), None),
        "cannot be sent to the contract",
    );
}

#[test]
fn the_house_plays_and_can_go_broke() {
    let mut cfg = config();
    cfg.max_stake = U128(100_000 * ONE);
    let mut w = World::with_config(cfg);
    w.starter("alice.test");
    w.starter("bob.test");
    let table = w.open("house.test", 50_000 * ONE, 2, "h");
    panics_with(|| w.join(table, "alice.test", "a"), "Not enough CHIP");
    assert_eq!(w.balance("house.test"), 0);
    w.check_supply();
}

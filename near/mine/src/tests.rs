use super::*;
use crate::rules::{BURN_BPS, BPS, ROUND_SECONDS, SECONDS_PER_DAY, mul_div, vein_rate};
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts, get_logs};
use near_sdk::testing_env;

/// 10:00 UTC on some day: far from midnight, so rounds are open.
const MORNING: u64 = 20_000 * SECONDS_PER_DAY + 10 * 3_600;
const FACTORY: &str = "factory.test";
const MINE: &str = "coin.factory.test";
const TOKEN: &str = "coin.meme-cooking.test";
const CHIP: &str = "chip.test";

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn context(predecessor: &str, seconds: u64, seed: [u8; 32]) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(id(MINE))
        .predecessor_account_id(id(predecessor))
        .block_timestamp(seconds * 1_000_000_000)
        .random_seed(seed)
        .build()
}

fn open_mine(vein_per_round: u128, halving: u64) -> Mine {
    testing_env!(context(FACTORY, MORNING, [1; 32]));
    Mine::new(
        id(TOKEN),
        id(CHIP),
        U128(10),
        U128(10_000),
        U128(vein_per_round),
        halving,
    )
}

fn stake_msg(square: u64) -> String {
    json!({ "square": square }).to_string()
}

/// A stake sent by the mine's coin at `seconds`.
fn stake(mine: &mut Mine, player: &str, amount: u128, square: u64, seconds: u64) -> U128 {
    testing_env!(context(TOKEN, seconds, [1; 32]));
    match mine.ft_on_transfer(id(player), U128(amount), stake_msg(square)) {
        PromiseOrValue::Value(unused) => unused,
        PromiseOrValue::Promise(_) => panic!("ft_on_transfer returns a value"),
    }
}

/// A seed whose draw for `round` lands on `square`.
fn seed_for(square: u8, round: u64) -> [u8; 32] {
    for n in 0u64.. {
        let mut seed = [0u8; 32];
        seed[..8].copy_from_slice(&n.to_le_bytes());
        testing_env!(context("anyone.test", MORNING, seed));
        if winning_square(&id(MINE), round, &seed) == square {
            return seed;
        }
    }
    unreachable!()
}

struct Call {
    receiver: String,
    method: String,
    args: Value,
}

fn calls() -> Vec<Call> {
    let mut out = Vec::new();
    for receipt in get_created_receipts() {
        for action in &receipt.actions {
            if let MockAction::FunctionCallWeight {
                method_name, args, ..
            } = action
            {
                out.push(Call {
                    receiver: receipt.receiver_id.to_string(),
                    method: String::from_utf8(method_name.clone()).unwrap(),
                    args: serde_json::from_slice(args).unwrap_or(Value::Null),
                });
            }
        }
    }
    out
}

fn amount_of(call: &Call) -> u128 {
    call.args["amount"].as_str().unwrap().parse().unwrap()
}

/// Settles at the end of the round and returns the receipts it created.
fn settle_at(mine: &mut Mine, round: u64, seed: [u8; 32], after: u64) -> (RoundSummary, Vec<Call>) {
    testing_env!(context("keeper.test", round_end(round) + after, seed));
    let summary = mine.settle(U64(round));
    (summary, calls())
}

fn paid(calls: &[Call], method: &str) -> u128 {
    calls
        .iter()
        .filter(|c| c.method == method && c.receiver == TOKEN)
        .map(amount_of)
        .sum()
}

// ---------------------------------------------------------------- rules

#[test]
fn square_choice_is_uniform_across_seeds() {
    testing_env!(context("anyone.test", MORNING, [1; 32]));
    let samples = 250_000u64;
    let mut counts = [0u64; SQUARES];
    for n in 0..samples {
        // The mocked VM meters gas, so start a fresh environment every few thousand hashes.
        if n % 2_000 == 0 {
            testing_env!(context("anyone.test", MORNING, [1; 32]));
        }
        let hash = env::sha256_array(&n.to_le_bytes());
        counts[usize::from(square_from_hash(&hash))] += 1;
    }
    let expected = samples as f64 / SQUARES as f64;
    let chi: f64 = counts
        .iter()
        .map(|c| (*c as f64 - expected).powi(2) / expected)
        .sum();
    // 24 degrees of freedom: 51.2 is the 0.1% critical value.
    assert!(chi < 51.2, "chi-square {chi} over counts {counts:?}");
    assert!(counts.iter().all(|c| *c > 0));
}

#[test]
fn each_square_owns_exactly_ten_accepted_byte_values() {
    let mut per_square = [0u32; SQUARES];
    for byte in 0u8..250 {
        let mut hash = [255u8; 32];
        hash[0] = byte;
        per_square[usize::from(square_from_hash(&hash))] += 1;
    }
    assert!(per_square.iter().all(|n| *n == 10), "{per_square:?}");
    // A hash with no byte below 250 still names a square.
    assert!(square_from_hash(&[255u8; 32]) < SQUARES as u8);
}

/// A small deterministic generator, so the property tests need no extra crate.
struct Xorshift(u64);
impl Xorshift {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn amount(&mut self, max_bits: u32) -> u128 {
        let wide = (u128::from(self.next()) << 64) | u128::from(self.next());
        wide >> (128 - max_bits)
    }
}

#[test]
fn payouts_and_burn_add_up_exactly() {
    let mut rng = Xorshift(0x9e37_79b9_7f4a_7c15);
    for _ in 0..20_000 {
        let winners = (rng.next() % 12 + 1) as usize;
        let bits = [20, 64, 90, 100][(rng.next() % 4) as usize];
        let stakes: Vec<u128> = (0..winners).map(|_| rng.amount(bits) + 1).collect();
        let losing = rng.amount(bits + 4);
        let bonus = if rng.next() % 3 == 0 { rng.amount(bits) } else { 0 };
        let result = split(&stakes, losing, bonus).expect("amounts fit");
        let winning_total: u128 = stakes.iter().sum();
        let awarded: u128 = result.awards.iter().sum();
        assert_eq!(
            awarded + result.burn,
            winning_total + losing + bonus,
            "everything staked, plus the vein, is paid or burned"
        );
        assert_eq!(result.burn, losing * BURN_BPS / BPS, "burn is 10% rounded down");
        for (stake, award) in stakes.iter().zip(&result.awards) {
            assert!(award >= stake, "a winner never gets less than their stake");
        }
    }
}

#[test]
fn burn_is_exactly_ten_percent_of_losing_stakes() {
    let result = split(&[500], 1_000_000, 0).unwrap();
    assert_eq!(result.burn, 100_000);
    assert_eq!(result.awards, vec![500 + 900_000]);
    // Rounded down when ten does not divide it; the remainder goes to the winners.
    let odd = split(&[7], 1_005, 0).unwrap();
    assert_eq!(odd.burn, 100);
    assert_eq!(odd.awards, vec![7 + 905]);
    // Nothing lost, nothing burned.
    let none = split(&[10, 30], 0, 0).unwrap();
    assert_eq!(none.burn, 0);
    assert_eq!(none.awards, vec![10, 30]);
}

#[test]
fn winners_share_by_stake_weight() {
    // 100 and 300 on the square, 400 elsewhere: burn 40, pool 360, split 90 and 270.
    let result = split(&[100, 300], 400, 0).unwrap();
    assert_eq!(result.burn, 40);
    assert_eq!(result.awards, vec![190, 570]);
}

#[test]
fn split_rejects_bad_input() {
    assert!(split(&[], 100, 0).is_none());
    assert!(split(&[0, 5], 100, 0).is_none());
}

#[test]
fn mul_div_is_exact_where_u128_would_overflow() {
    assert_eq!(mul_div(10, 20, 3), Some(66));
    assert_eq!(mul_div(0, 5, 7), Some(0));
    assert_eq!(mul_div(5, 5, 0), None);
    let big = 1u128 << 100;
    assert_eq!(mul_div(big, big, big), Some(big));
    assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), Some(u128::MAX));
    assert_eq!(mul_div(u128::MAX, 2, 1), None, "answer does not fit");
    let mut rng = Xorshift(42);
    for _ in 0..5_000 {
        let (a, b) = (rng.amount(60), rng.amount(60));
        let c = rng.amount(60) + 1;
        assert_eq!(mul_div(a, b, c), Some(a * b / c));
    }
}

#[test]
fn vein_halves_on_schedule() {
    let day = 86_400;
    assert_eq!(vein_rate(1_000, 0, 30 * day), 1_000);
    assert_eq!(vein_rate(1_000, 30 * day - 1, 30 * day), 1_000);
    assert_eq!(vein_rate(1_000, 30 * day, 30 * day), 500);
    assert_eq!(vein_rate(1_000, 75 * day, 30 * day), 250);
    assert_eq!(vein_rate(1_000, 90 * day, 30 * day), 125);
    assert_eq!(vein_rate(1_000, 200 * 30 * day, 30 * day), 0);
    assert_eq!(vein_rate(0, 0, 30 * day), 0);
}

#[test]
fn no_round_crosses_midnight() {
    for round in 0..ROUNDS_PER_DAY * 4 {
        let start = round_start(round);
        let last = round_end(round) - 1;
        assert_eq!(
            start / SECONDS_PER_DAY,
            last / SECONDS_PER_DAY,
            "round {round} stays inside one UTC day"
        );
        assert_eq!(round_end(round) - start, ROUND_SECONDS);
        assert_eq!(is_closed_round(round), round % ROUNDS_PER_DAY == 1439);
    }
    // 23:59 closes; 23:58 is the last round stakes are taken in.
    let day = 20_000 * SECONDS_PER_DAY;
    assert!(is_closed_round(round_of(day + 23 * 3_600 + 59 * 60)));
    assert!(!is_closed_round(round_of(day + 23 * 3_600 + 58 * 60 + 59)));
}

// ---------------------------------------------------------------- contract

#[test]
fn only_the_factory_can_set_up_a_mine() {
    testing_env!(context("mallory.test", MORNING, [1; 32]));
    let attempt = std::panic::catch_unwind(|| {
        Mine::new(id(TOKEN), id(CHIP), U128(1), U128(2), U128(0), 0)
    });
    assert!(attempt.is_err());
}

#[test]
fn a_stake_lands_in_the_current_round_and_tells_chip() {
    let mut mine = open_mine(0, 0);
    assert_eq!(stake(&mut mine, "alice.test", 100, 4, MORNING), U128(0));
    assert_eq!(stake(&mut mine, "alice.test", 50, 4, MORNING + 5), U128(0));
    assert_eq!(stake(&mut mine, "bob.test", 70, 9, MORNING + 9), U128(0));
    let round = mine.get_round(U64(round_of(MORNING))).unwrap();
    assert_eq!(round.total, U128(220));
    assert_eq!(round.players, 2);
    assert_eq!(round.totals[4], U128(150));
    assert_eq!(round.totals[9], U128(70));
    assert_eq!(round.stakes.len(), 2, "alice's two stakes on one square merge");
    assert_eq!(mine.get_stats().held, U128(220));
    let notes: Vec<_> = calls().into_iter().filter(|c| c.method == "note_player").collect();
    assert_eq!(notes.len(), 1, "CHIP hears once per new player in the call's receipts");
    assert_eq!(notes[0].receiver, CHIP);
}

#[test]
fn a_stake_the_mine_cannot_take_comes_back_in_full() {
    let mut mine = open_mine(0, 0);
    let now = MORNING;
    assert_eq!(stake(&mut mine, "a.test", 100, 25, now), U128(100), "no square 25");
    assert_eq!(stake(&mut mine, "a.test", 5, 3, now), U128(5), "below minimum");
    assert_eq!(stake(&mut mine, "a.test", 20_000, 3, now), U128(20_000), "over the cap");
    assert_eq!(stake(&mut mine, "a.test", 9_000, 3, now), U128(0));
    assert_eq!(stake(&mut mine, "a.test", 2_000, 5, now), U128(2_000), "cap is per player per round");
    testing_env!(context(TOKEN, now, [1; 32]));
    let late = json!({ "square": 3, "round": round_of(now) - 1 }).to_string();
    assert!(matches!(
        mine.ft_on_transfer(id("b.test"), U128(100), late),
        PromiseOrValue::Value(U128(100))
    ));
    // The round written as a string, the way CHIP's `mine_deploy` sends it, is read the same.
    let late_string = json!({ "square": "3", "round": (round_of(now) - 1).to_string() }).to_string();
    assert!(matches!(
        mine.ft_on_transfer(id("b.test"), U128(100), late_string),
        PromiseOrValue::Value(U128(100))
    ));
    let current_string = json!({ "square": 3, "round": round_of(now).to_string() }).to_string();
    assert!(matches!(
        mine.ft_on_transfer(id("c.test"), U128(100), current_string),
        PromiseOrValue::Value(U128(0))
    ));
    // A round that is not a number is refused, not ignored.
    let garbled = json!({ "square": 3, "round": "soon" }).to_string();
    assert!(matches!(
        mine.ft_on_transfer(id("b.test"), U128(100), garbled),
        PromiseOrValue::Value(U128(100))
    ));
    assert!(matches!(
        mine.ft_on_transfer(id("b.test"), U128(100), "nonsense".to_string()),
        PromiseOrValue::Value(U128(100))
    ));
    assert!(matches!(
        mine.ft_on_transfer(id("b.test"), U128(100), "\"vein\"".to_string()),
        PromiseOrValue::Value(U128(100))
    ), "no vein on this mine");
    assert_eq!(mine.get_stats().held, U128(9_100), "9,000 plus c's 100");
}

#[test]
fn only_the_minted_coin_can_be_staked() {
    let mut mine = open_mine(0, 0);
    testing_env!(context("fake-coin.test", MORNING, [1; 32]));
    let attempt = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        mine.ft_on_transfer(id("a.test"), U128(100), stake_msg(1))
    }));
    assert!(attempt.is_err());
}

#[test]
fn a_full_round_takes_no_more_entries() {
    let mut mine = open_mine(0, 0);
    for n in 0..MAX_STAKES {
        let player = format!("p{n}.test");
        assert_eq!(stake(&mut mine, &player, 10, (n % 25) as u64, MORNING), U128(0));
    }
    assert_eq!(stake(&mut mine, "late.test", 10, 0, MORNING), U128(10));
}

#[test]
fn the_last_minute_of_the_day_is_closed() {
    let mut mine = open_mine(0, 0);
    let day = 20_000 * SECONDS_PER_DAY;
    let last_open = day + 23 * 3_600 + 58 * 60 + 30;
    let closed = day + 23 * 3_600 + 59 * 60 + 1;
    assert_eq!(stake(&mut mine, "a.test", 100, 1, last_open), U128(0));
    assert_eq!(stake(&mut mine, "a.test", 100, 1, closed), U128(100));
    testing_env!(context("anyone.test", closed, [1; 32]));
    let now = mine.get_current_round();
    assert!(!now.open);
    assert_eq!(now.ends_at, day + SECONDS_PER_DAY);
}

#[test]
fn a_settled_round_pays_winners_and_burns_a_tenth_of_the_losing_stakes() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    stake(&mut mine, "bob.test", 300, 3, MORNING + 1);
    stake(&mut mine, "carol.test", 250, 7, MORNING + 2);
    stake(&mut mine, "dave.test", 150, 12, MORNING + 3);
    let seed = seed_for(3, round);
    let (summary, calls) = settle_at(&mut mine, round, seed, 2);

    assert_eq!(summary.winning_square, Some(3));
    assert_eq!(summary.outcome, "settled");
    // Losing stakes 400: burn 40, winners share 360 by stake (90 and 270).
    assert_eq!(summary.burned, U128(40));
    assert_eq!(paid(&calls, "ft_burn"), 40);
    assert_eq!(paid(&calls, "ft_transfer"), 190 + 570);
    assert_eq!(
        paid(&calls, "ft_transfer") + paid(&calls, "ft_burn"),
        800,
        "everything staked is paid or burned, to the unit"
    );
    let to_alice = calls
        .iter()
        .find(|c| c.method == "ft_transfer" && c.args["receiver_id"] == "alice.test")
        .unwrap();
    assert_eq!(amount_of(to_alice), 190);
    // Winners are paid in the settle transaction, not left to a claim.
    assert_eq!(mine.get_stats().claimable_total, U128(0));
    assert_eq!(mine.get_stats().held, U128(0));
    assert!(mine.get_round(U64(round)).is_none());

    let report = calls.iter().find(|c| c.method == "report_round").unwrap();
    assert_eq!(report.receiver, CHIP);
    assert_eq!(report.args["players"], 4);
    assert_eq!(report.args["winners"].as_array().unwrap().len(), 2);
    assert!(get_logs().iter().any(|l| l.contains("round_settled")));
    assert_eq!(mine.get_recent(Some(1))[0].round, round);
}

#[test]
fn a_round_settles_only_once() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    let seed = seed_for(3, round);
    settle_at(&mut mine, round, seed, 1);
    testing_env!(context("keeper.test", round_end(round) + 2, seed));
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| mine.settle(U64(round))));
    assert!(again.is_err());
}

#[test]
fn an_empty_winning_square_refunds_everyone_and_burns_nothing() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    stake(&mut mine, "bob.test", 300, 8, MORNING + 1);
    let seed = seed_for(20, round);
    let (summary, calls) = settle_at(&mut mine, round, seed, 1);
    assert_eq!(summary.outcome, "refunded");
    assert_eq!(summary.winning_square, None);
    assert_eq!(paid(&calls, "ft_transfer"), 400);
    assert_eq!(paid(&calls, "ft_burn"), 0);
    assert!(calls.iter().all(|c| c.method != "report_round"), "no winners, no emission");
    assert_eq!(mine.get_stats().rounds_refunded, 1);
}

#[test]
fn settling_waits_for_the_round_to_end_and_stops_after_ten_minutes() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    testing_env!(context("keeper.test", round_end(round) - 1, [1; 32]));
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| mine.settle(U64(round))));
    assert!(early.is_err(), "the round is still running");
    testing_env!(context(
        "keeper.test",
        round_end(round) + SETTLE_WINDOW_SECONDS,
        [1; 32]
    ));
    let late = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| mine.settle(U64(round))));
    assert!(late.is_err(), "the settle window has passed");
}

#[test]
fn a_round_nobody_settles_is_refunded_in_full() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    stake(&mut mine, "alice.test", 40, 9, MORNING + 1);
    stake(&mut mine, "bob.test", 300, 8, MORNING + 2);

    testing_env!(context("anyone.test", round_end(round) + 599, [1; 32]));
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        mine.refund_round(U64(round))
    }));
    assert!(early.is_err(), "still inside the settle window");

    testing_env!(context(
        "anyone.test",
        round_end(round) + SETTLE_WINDOW_SECONDS,
        [1; 32]
    ));
    let summary = mine.refund_round(U64(round));
    let calls = calls();
    assert_eq!(summary.outcome, "refunded");
    assert_eq!(paid(&calls, "ft_transfer"), 440, "every stake comes back");
    assert_eq!(paid(&calls, "ft_burn"), 0);
    let to_alice = calls
        .iter()
        .find(|c| c.method == "ft_transfer" && c.args["receiver_id"] == "alice.test")
        .unwrap();
    assert_eq!(amount_of(to_alice), 140, "one transfer for both of alice's stakes");
    assert_eq!(mine.get_stats().held, U128(0));
    // It cannot be settled or refunded again.
    let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        mine.refund_round(U64(round))
    }));
    assert!(again.is_err());
}

#[test]
fn winners_beyond_one_transaction_wait_in_claim() {
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    for n in 0..MAX_STAKES {
        stake(&mut mine, &format!("p{n}.test"), 100, 6, MORNING);
    }
    let seed = seed_for(6, round);
    let (summary, calls) = settle_at(&mut mine, round, seed, 1);
    assert_eq!(summary.winners.len(), MAX_STAKES);
    // Nobody lost, so nothing burns and every winner gets their stake back.
    let direct = calls.iter().filter(|c| c.method == "ft_transfer").count();
    assert_eq!(direct, DIRECT_PAYOUTS);
    let waiting = 100 * (MAX_STAKES - DIRECT_PAYOUTS) as u128;
    assert_eq!(mine.get_stats().claimable_total, U128(waiting));
    assert_eq!(mine.get_claimable(id("p39.test")), U128(100));
    assert_eq!(mine.get_claimable(id("p0.test")), U128(0));
    assert_eq!(paid(&calls, "ft_transfer") + waiting, 100 * MAX_STAKES as u128);

    // A deferred winner collects with `claim`, which needs no deposit.
    testing_env!(context("p39.test", round_end(round) + 5, [1; 32]));
    assert_eq!(mine.claim(), U128(100));
    let claim = calls_for("ft_transfer");
    assert_eq!(amount_of(&claim[0]), 100);
    assert_eq!(mine.get_claimable(id("p39.test")), U128(0));
    let twice = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| mine.claim()));
    assert!(twice.is_err(), "nothing left to claim");
}

fn calls_for(method: &str) -> Vec<Call> {
    calls().into_iter().filter(|c| c.method == method).collect()
}

#[test]
fn a_failed_payout_goes_to_claim_instead_of_being_lost() {
    use near_sdk::PromiseResult;
    let mut mine = open_mine(0, 0);
    let round = round_of(MORNING);
    let payments = vec![(id("alice.test"), U128(190)), (id("bob.test"), U128(570))];
    testing_env!(
        context(MINE, round_end(round) + 2, [1; 32]),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Successful(vec![]), PromiseResult::Failed]
    );
    mine.on_payouts(payments);
    assert_eq!(mine.get_claimable(id("alice.test")), U128(0));
    assert_eq!(mine.get_claimable(id("bob.test")), U128(570));
    assert_eq!(mine.get_stats().paid_total, U128(190));
    assert_eq!(mine.get_stats().claimable_total, U128(570));
}

#[test]
fn a_coin_without_ft_burn_is_burned_by_transfer_to_the_keyless_account() {
    use near_sdk::PromiseResult;
    let mut mine = open_mine(0, 0);
    // ft_burn failed: the mine registers the burn account and transfers there instead.
    testing_env!(
        context(MINE, MORNING, [1; 32]),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    mine.on_burn(U128(40));
    let calls = calls();
    let methods: Vec<_> = calls.iter().map(|c| c.method.as_str()).collect();
    assert_eq!(methods[..2], ["storage_deposit", "ft_transfer"]);
    let transfer = &calls[1];
    assert_eq!(transfer.args["receiver_id"], BURN_ACCOUNT);
    assert_eq!(amount_of(transfer), 40);
    assert_eq!(mine.get_stats().burned_by_burn, U128(0));
    // The transfer lands: it counts as burned.
    testing_env!(
        context(MINE, MORNING, [1; 32]),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed, PromiseResult::Successful(vec![])]
    );
    mine.on_burn_by_transfer(U128(40));
    assert_eq!(mine.get_stats().burned_by_transfer, U128(40));
    // If that fails too, the amount is kept and burned with the next round.
    testing_env!(
        context(MINE, MORNING, [1; 32]),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed, PromiseResult::Failed]
    );
    mine.on_burn_by_transfer(U128(15));
    assert_eq!(mine.get_stats().pending_burn, U128(15));
}

#[test]
fn the_vein_adds_to_the_winners_and_halves() {
    let day = 86_400;
    let mut mine = open_mine(1_000, 30 * day);
    // Fund the vein with 5,000 of the coin.
    testing_env!(context(TOKEN, MORNING, [1; 32]));
    let _ = mine.ft_on_transfer(id("patron.test"), U128(5_000), "\"vein\"".to_string());
    assert_eq!(mine.get_stats().vein, U128(5_000));

    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    stake(&mut mine, "bob.test", 100, 9, MORNING + 1);
    let seed = seed_for(3, round);
    let (summary, calls) = settle_at(&mut mine, round, seed, 1);
    // Losing 100: burn 10, winners get their 100 back, 90 and the 1,000 vein.
    assert_eq!(summary.vein, U128(1_000));
    assert_eq!(paid(&calls, "ft_burn"), 10);
    assert_eq!(paid(&calls, "ft_transfer"), 100 + 90 + 1_000);
    assert_eq!(mine.get_stats().vein, U128(4_000));

    // Thirty days on, a round releases half as much.
    testing_env!(context("anyone.test", MORNING + 30 * day, [1; 32]));
    assert_eq!(mine.get_vein_release(), U128(500));
}

#[test]
fn the_vein_never_pays_more_than_it_holds() {
    let mut mine = open_mine(1_000, 86_400);
    testing_env!(context(TOKEN, MORNING, [1; 32]));
    let _ = mine.ft_on_transfer(id("patron.test"), U128(300), "\"vein\"".to_string());
    let round = round_of(MORNING);
    stake(&mut mine, "alice.test", 100, 3, MORNING);
    let seed = seed_for(3, round);
    let (summary, _) = settle_at(&mut mine, round, seed, 1);
    assert_eq!(summary.vein, U128(300));
    assert_eq!(mine.get_stats().vein, U128(0));
}

use super::*;
use crate::rules::{emission_rate, is_motherlode, mul_div, split_by_weight};
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts};
use near_sdk::{Gas, testing_env};

const DAY: u64 = 86_400;
/// 10:00 UTC on some day.
const LAUNCH: u64 = 20_000 * DAY + 10 * 3_600;
const FACTORY: &str = "factory.test";
const CHIP: &str = "chip.test";
const MINE_A: &str = "alpha.factory.test";
const MINE_B: &str = "beta.factory.test";

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn context(predecessor: &str, seconds: u64) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(id(CHIP))
        .predecessor_account_id(id(predecessor))
        .block_timestamp(seconds * 1_000_000_000)
        .random_seed([7; 32])
        .prepaid_gas(Gas::from_tgas(200))
        .build()
}

fn config() -> Config {
    Config {
        factory: id(FACTORY),
        cap: U128(1_000_000),
        starter_amount: U128(1_000),
        starter_budget: U128(5_000),
        emission_per_minute: U128(1_000),
        halving_seconds: 30 * DAY,
        motherlode_per_round: U128(20),
        // Practically never, so tests that are not about the Motherlode never hit it.
        motherlode_odds: u32::MAX,
        motherlode_cap: U128(5_000),
    }
}

fn metadata() -> FungibleTokenMetadata {
    FungibleTokenMetadata {
        spec: "ft-1.0.0".to_string(),
        name: "Kova Chip".to_string(),
        symbol: "CHIP".to_string(),
        icon: None,
        reference: None,
        reference_hash: None,
        decimals: 18,
    }
}

fn launch(config: Config) -> Contract {
    testing_env!(context(CHIP, LAUNCH));
    Contract::new(metadata(), config)
}

fn balance(chip: &Contract, who: &str) -> u128 {
    chip.ft_balance_of(id(who)).0
}

/// Reports a round from a mine, one minute after the round ended, with the given players.
fn report(
    chip: &mut Contract,
    mine: &str,
    round: u64,
    players: u32,
    winners: &[(&str, u128)],
) {
    testing_env!(context(mine, (round + 1) * 60 + 3));
    let winners = winners.iter().map(|(a, w)| (id(a), U128(*w))).collect();
    chip.report_round(U64(round), players, winners);
}

fn note(chip: &mut Contract, mine: &str, round: u64) {
    testing_env!(context(mine, round * 60 + 20));
    chip.note_player(U64(round));
}

fn assert_supply_adds_up(chip: &Contract) {
    let stats = chip.get_stats();
    assert_eq!(
        stats.total_supply.0,
        stats.total_minted.0 - stats.total_burned.0,
        "supply is what was minted less what was burned"
    );
    assert!(stats.total_minted.0 <= stats.cap.0, "never past the cap");
    assert_eq!(
        stats.total_minted.0,
        stats.emission_minted.0 + stats.motherlode_minted.0 + stats.starter_minted.0
    );
}

// ---------------------------------------------------------------- rules

#[test]
fn the_emission_halves_every_thirty_days() {
    let initial = 10_000_000_000_000_000_000u128; // 10 CHIP
    let halving = 30 * DAY;
    assert_eq!(emission_rate(initial, 0, halving), initial);
    assert_eq!(emission_rate(initial, halving - 1, halving), initial);
    assert_eq!(emission_rate(initial, halving, halving), initial / 2);
    assert_eq!(emission_rate(initial, 60 * DAY, halving), initial / 4);
    assert_eq!(emission_rate(initial, 90 * DAY, halving), initial / 8);
    assert_eq!(emission_rate(initial, 4_000 * DAY, halving), 0);
}

#[test]
fn the_whole_emission_stays_far_under_the_cap() {
    // 10 CHIP a minute for 30 days, then half, and so on: 2 x 432,000 CHIP in total.
    let per_period = 10u128 * 60 * 24 * 30;
    let total: u128 = (0..128).map(|n| per_period >> n).sum();
    assert!(total <= 2 * per_period);
    assert!(total < 21_000_000);
}

#[test]
fn weighted_parts_add_up_exactly() {
    assert_eq!(split_by_weight(100, &[1, 1, 1]), Some(vec![34, 33, 33]));
    assert_eq!(split_by_weight(10, &[3, 7]), Some(vec![3, 7]));
    assert_eq!(split_by_weight(0, &[5, 5]), Some(vec![0, 0]));
    assert!(split_by_weight(10, &[]).is_none());
    assert!(split_by_weight(10, &[0, 4]).is_none());
    let mut seed = 0x1234_5678_9abc_def1u64;
    for _ in 0..5_000 {
        seed ^= seed << 13;
        seed ^= seed >> 7;
        seed ^= seed << 17;
        let n = (seed % 9 + 1) as usize;
        let weights: Vec<u128> = (0..n)
            .map(|i| u128::from((seed >> (i * 5)) % 1_000_000 + 1) << (i * 7))
            .collect();
        let amount = u128::from(seed) << 40;
        let parts = split_by_weight(amount, &weights).unwrap();
        assert_eq!(parts.iter().sum::<u128>(), amount);
    }
    assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), Some(u128::MAX));
}

#[test]
fn the_motherlode_hits_one_round_in_625() {
    testing_env!(context(CHIP, LAUNCH));
    let samples = 625 * 800u64;
    let mut hits = 0u64;
    for n in 0..samples {
        // The mocked VM meters gas, so start a fresh environment every few thousand hashes.
        if n % 2_000 == 0 {
            testing_env!(context(CHIP, LAUNCH));
        }
        if is_motherlode(&env::sha256_array(&n.to_le_bytes()), 625) {
            hits += 1;
        }
    }
    // 800 expected; the standard deviation is about 28, so five of them is generous.
    assert!(
        (660..=940).contains(&hits),
        "{hits} hits in {samples} rounds, expected about 800"
    );
}

// ---------------------------------------------------------------- the coin

#[test]
fn nothing_exists_until_it_is_mined() {
    let chip = launch(config());
    let stats = chip.get_stats();
    assert_eq!(stats.total_supply, U128(0));
    assert_eq!(stats.total_minted, U128(0));
    assert_eq!(stats.emission_rate, U128(1_000));
    assert_eq!(stats.cap, U128(1_000_000));
}

#[test]
fn a_starter_claim_works_once_per_account_and_stops_at_the_budget() {
    let mut chip = launch(config());
    for n in 0..5 {
        testing_env!(context(&format!("p{n}.test"), LAUNCH + 5));
        assert_eq!(chip.claim_starter(), U128(1_000));
    }
    assert_eq!(balance(&chip, "p0.test"), 1_000);
    testing_env!(context("p0.test", LAUNCH + 9));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| chip.claim_starter())).is_err());
    testing_env!(context("late.test", LAUNCH + 9));
    assert!(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| chip.claim_starter())).is_err(),
        "the starter budget of five claims is used up"
    );
    assert_eq!(chip.get_stats().starters_claimed, 5);
    assert_supply_adds_up(&chip);
}

#[test]
fn a_zero_starter_amount_means_no_claim_exists() {
    let mut chip = launch(Config {
        starter_amount: U128(0),
        starter_budget: U128(0),
        ..config()
    });
    testing_env!(context("p.test", LAUNCH + 5));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| chip.claim_starter())).is_err());
}

#[test]
fn only_a_direct_sub_account_of_the_factory_is_a_mine() {
    let chip = launch(config());
    for yes in ["alpha.factory.test", "a-b.factory.test"] {
        assert!(chip.is_mine_account(id(yes)), "{yes}");
    }
    for no in [
        "factory.test",
        "deep.alpha.factory.test",
        "xfactory.test",
        "alpha.factory.test.evil",
        "alpha.other.test",
        "test",
    ] {
        assert!(!chip.is_mine_account(id(no)), "{no}");
    }
}

#[test]
fn only_mines_can_report_rounds_and_notes() {
    let mut chip = launch(config());
    let round = LAUNCH / 60;
    for caller in ["mallory.test", "factory.test", "deep.alpha.factory.test"] {
        testing_env!(context(caller, (round + 1) * 60 + 3));
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                chip.report_round(U64(round), 1, vec![(id("a.test"), U128(1))])
            }))
            .is_err(),
            "{caller} must not mint"
        );
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                chip.note_player(U64(round))
            }))
            .is_err()
        );
    }
    assert_eq!(chip.get_stats().total_minted, U128(0));
}

#[test]
fn a_minutes_emission_is_split_between_mines_by_players() {
    let mut chip = launch(config());
    let round = LAUNCH / 60 + 3;
    // Alpha has one player, beta has three, in the same minute.
    note(&mut chip, MINE_A, round);
    for _ in 0..3 {
        note(&mut chip, MINE_B, round);
    }
    assert_eq!(chip.get_minute(U64(round)).players, 4);
    report(&mut chip, MINE_A, round, 1, &[("ann.test", 10)]);
    report(&mut chip, MINE_B, round, 3, &[("bo.test", 30), ("cy.test", 10)]);
    // The minute releases 1,000: a quarter to alpha, three quarters to beta.
    assert_eq!(balance(&chip, "ann.test"), 250);
    assert_eq!(balance(&chip, "bo.test") + balance(&chip, "cy.test"), 750);
    assert_eq!(balance(&chip, "bo.test"), 563, "30/40 of 750 and the dust");
    assert_eq!(balance(&chip, "cy.test"), 187);
    assert_eq!(chip.get_minute(U64(round)).emitted, U128(1_000));
    assert_eq!(chip.get_stats().emission_minted, U128(1_000));
    assert_supply_adds_up(&chip);
}

#[test]
fn a_minute_never_releases_more_than_its_rate_even_if_notes_lag() {
    let mut chip = launch(config());
    let round = LAUNCH / 60 + 1;
    // No note arrived before either report, so each mine thinks it is alone.
    report(&mut chip, MINE_A, round, 2, &[("ann.test", 5)]);
    report(&mut chip, MINE_B, round, 3, &[("bo.test", 5)]);
    let paid = balance(&chip, "ann.test") + balance(&chip, "bo.test");
    assert_eq!(paid, 1_000, "the second report finds the minute spent");
    assert_eq!(chip.get_minute(U64(round)).emitted, U128(1_000));
}

#[test]
fn the_emission_follows_the_halving_schedule() {
    let mut chip = launch(config());
    let later = LAUNCH / 60 + 30 * 1_440 + 5;
    note(&mut chip, MINE_A, later);
    report(&mut chip, MINE_A, later, 1, &[("ann.test", 5)]);
    assert_eq!(balance(&chip, "ann.test"), 500, "half the launch rate");
    assert_eq!(chip.get_stats().emission_rate.0, 500);
}

#[test]
fn a_round_must_have_ended_and_not_be_too_old() {
    let mut chip = launch(config());
    let round = LAUNCH / 60 + 2;
    testing_env!(context(MINE_A, round * 60 + 30));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        chip.report_round(U64(round), 1, vec![(id("a.test"), U128(1))])
    }))
    .is_err());
    testing_env!(context(MINE_A, (round + 31) * 60 + 1));
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        chip.report_round(U64(round), 1, vec![(id("a.test"), U128(1))])
    }))
    .is_err());
}

#[test]
fn nothing_is_minted_past_the_cap() {
    let mut chip = launch(Config {
        cap: U128(1_300),
        starter_amount: U128(0),
        starter_budget: U128(0),
        ..config()
    });
    let round = LAUNCH / 60 + 1;
    for n in 0..3 {
        note(&mut chip, MINE_A, round + n);
        report(&mut chip, MINE_A, round + n, 1, &[("ann.test", 5)]);
    }
    assert_eq!(balance(&chip, "ann.test"), 1_300, "1,000 + 300, then the cap");
    assert_eq!(chip.get_stats().total_minted, U128(1_300));
    assert_supply_adds_up(&chip);
}

#[test]
fn the_motherlode_grows_by_two_a_round_up_to_its_cap() {
    let mut chip = launch(config());
    let round = LAUNCH / 60 + 1;
    for n in 0..3 {
        note(&mut chip, MINE_A, round + n);
        report(&mut chip, MINE_A, round + n, 1, &[("ann.test", 5)]);
    }
    assert_eq!(chip.get_stats().motherlode, U128(60), "three rounds at 20");
    assert_eq!(chip.get_stats().motherlode_hits, 0);
    // It never holds more than the cap.
    let mut capped = launch(Config {
        motherlode_per_round: U128(3_000),
        motherlode_cap: U128(5_000),
        ..config()
    });
    for n in 0..4 {
        note(&mut capped, MINE_A, round + n);
        report(&mut capped, MINE_A, round + n, 1, &[("ann.test", 5)]);
    }
    assert_eq!(capped.get_stats().motherlode, U128(5_000));
}

#[test]
fn a_motherlode_hit_pays_the_whole_jackpot_to_the_rounds_winners() {
    // Odds of 1 make every round a hit.
    let mut chip = launch(Config {
        motherlode_odds: 1,
        ..config()
    });
    let round = LAUNCH / 60 + 1;
    note(&mut chip, MINE_A, round);
    report(&mut chip, MINE_A, round, 1, &[("ann.test", 30), ("bo.test", 10)]);
    // Emission 1,000 and a jackpot of 20 (one round's worth), both shared 30:10.
    let stats = chip.get_stats();
    assert_eq!(stats.motherlode_hits, 1);
    assert_eq!(stats.motherlode_minted, U128(20));
    assert_eq!(stats.motherlode, U128(0), "the jackpot starts again");
    assert_eq!(balance(&chip, "ann.test") + balance(&chip, "bo.test"), 1_020);
    assert_eq!(balance(&chip, "ann.test"), 765);
    assert_eq!(balance(&chip, "bo.test"), 255);
    assert_supply_adds_up(&chip);
}

#[test]
fn a_burn_lowers_the_supply_and_needs_one_yocto() {
    let mut chip = launch(config());
    testing_env!(context("ann.test", LAUNCH + 5));
    chip.claim_starter();
    // Without the yoctoNEAR it is refused.
    assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| chip.ft_burn(U128(100)))).is_err());
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(id(CHIP))
            .predecessor_account_id(id("ann.test"))
            .attached_deposit(NearToken::from_yoctonear(1))
            .block_timestamp((LAUNCH + 6) * 1_000_000_000)
            .build()
    );
    chip.ft_burn(U128(400));
    assert_eq!(balance(&chip, "ann.test"), 600);
    assert_eq!(chip.get_stats().total_burned, U128(400));
    assert_eq!(chip.get_stats().total_supply, U128(600));
    assert_supply_adds_up(&chip);
    assert!(
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| chip.ft_burn(U128(601)))).is_err(),
        "cannot burn what is not there"
    );
}

#[test]
fn a_game_key_can_put_chip_on_a_square_without_a_deposit() {
    let mut chip = launch(config());
    testing_env!(context("ann.test", LAUNCH + 5));
    chip.claim_starter();
    testing_env!(context("ann.test", LAUNCH + 6));
    let _ = chip.mine_deploy(id(MINE_A), 12, U128(300), Some(U64(LAUNCH / 60)));
    assert_eq!(balance(&chip, "ann.test"), 700);
    assert_eq!(balance(&chip, MINE_A), 300, "the mine is registered on first use");
    let receipt = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == id(MINE_A))
        .expect("a call to the mine");
    let MockAction::FunctionCallWeight {
        method_name, args, attached_deposit, ..
    } = receipt
        .actions
        .iter()
        .find(|a| matches!(a, MockAction::FunctionCallWeight { .. }))
        .unwrap()
    else {
        unreachable!()
    };
    assert_eq!(method_name, b"ft_on_transfer");
    assert!(attached_deposit.is_zero());
    let args: serde_json::Value = serde_json::from_slice(args).unwrap();
    assert_eq!(args["sender_id"], "ann.test");
    assert_eq!(args["amount"], "300");
    let msg: serde_json::Value = serde_json::from_str(args["msg"].as_str().unwrap()).unwrap();
    assert_eq!(msg["square"], 12);
    // NEAR writes a U64 as a string, and the mine reads that form.
    assert_eq!(msg["round"], (LAUNCH / 60).to_string());
}

#[test]
fn a_game_key_can_only_reach_mines() {
    let mut chip = launch(config());
    testing_env!(context("ann.test", LAUNCH + 5));
    chip.claim_starter();
    for target in ["thief.test", "factory.test", "deep.alpha.factory.test"] {
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                chip.mine_deploy(id(target), 1, U128(10), None)
            }))
            .is_err(),
            "{target} is not a mine"
        );
    }
    assert_eq!(balance(&chip, "ann.test"), 1_000);
}

#[test]
fn old_minute_counters_are_forgotten() {
    let mut chip = launch(config());
    let first = LAUNCH / 60 + 1;
    note(&mut chip, MINE_A, first);
    assert_eq!(chip.get_minute(U64(first)).players, 1);
    // Forty minutes later a new note prunes it.
    note(&mut chip, MINE_A, first + 40);
    assert_eq!(chip.get_minute(U64(first)).players, 0);
    assert_eq!(chip.get_minute(U64(first + 40)).players, 1);
}

//! A Kova mine: a 5x5 grid for one NEP-141 coin.
//!
//! - A round is one UTC minute. Players put coins on squares by sending the mine's coin with
//!   `ft_transfer_call` (message `{"square":7}`).
//! - After the round ends, anyone calls `settle`. The contract picks one square from NEAR's
//!   random seed. Players on it get their stake back plus a stake-weighted share of the losing
//!   stakes. 10% of the losing stakes is burned.
//! - Winners are paid in the settle transaction. If a payout does not go through, or a round has
//!   more winners than one transaction can pay, the rest waits in `claim`.
//! - A round nobody settles within ten minutes, or whose winning square is empty, refunds every
//!   stake. Nothing is burned.
//! - The last minute of each UTC day is closed to stakes, so every round is settled and paid
//!   before 00:00 UTC.
//!
//! The mine is created by the factory as a global contract referenced by hash. It has no owner,
//! no setter, no pause and no upgrade, and its account gets no access key.

use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, Value, json};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, env, near,
    require,
};

pub mod rules;

use rules::{
    ROUNDS_PER_DAY, SQUARES, is_closed_round, round_end, round_of, round_start, split,
    square_from_hash, vein_rate,
};

/// Seconds after a round ends during which it can be settled. After that it can only be refunded.
pub const SETTLE_WINDOW_SECONDS: u64 = 600;
/// Stake entries one round holds (one per player and square).
pub const MAX_STAKES: usize = 40;
/// Winners paid inside the settle transaction. The rest are paid by `claim`.
pub const DIRECT_PAYOUTS: usize = 10;
pub const RECENT_ROUNDS: usize = 24;
/// A keyless account: the implicit account whose "public key" is sha256("kova-burn-v1"). Nobody
/// holds a private key for it and it has no contract. A coin sent here is out of circulation.
pub const BURN_ACCOUNT: &str = "5a8793ba15a110691946190e2a8a5148cae29cb08888133656d99639470fa05b";

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(25);
const GAS_REPORT: Gas = Gas::from_tgas(60);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
/// Attached to `storage_deposit` when registering the burn account. The token refunds the rest.
const BURN_REGISTRATION: NearToken = NearToken::from_millinear(10);
const DOMAIN: &str = "kova-mine-v1";

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Rounds,
    Claimable,
}

/// One entry: a player's coins on one square.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Stake {
    pub player: AccountId,
    pub square: u8,
    pub amount: U128,
}

/// A round with stakes. It exists from the first stake to its settle or refund.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Round {
    pub id: u64,
    /// Coins on each of the 25 squares.
    pub totals: Vec<U128>,
    pub total: U128,
    /// Distinct players.
    pub players: u32,
    pub stakes: Vec<Stake>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Winner {
    pub player: AccountId,
    pub staked: U128,
    pub award: U128,
}

/// What is kept of a round after it is settled or refunded. The full history is in the logs.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct RoundSummary {
    pub round: u64,
    pub settled_at: u64,
    /// `settled`, or `refunded` (empty winning square, or never settled).
    pub outcome: String,
    pub winning_square: Option<u8>,
    pub total: U128,
    pub burned: U128,
    pub vein: U128,
    pub players: u32,
    pub winners: Vec<Winner>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    /// The coin this mine is for.
    pub token: AccountId,
    /// CHIP, told about every round so it can mint the emission.
    pub chip: AccountId,
    pub factory: AccountId,
    pub burn_account: AccountId,
    /// Per stake.
    pub min_stake: U128,
    /// Per player per round.
    pub max_stake: U128,
    /// Released to a round's winners from the vein, halving every `vein_halving_seconds`.
    pub vein_per_round: U128,
    pub vein_halving_seconds: u64,
    pub opened_at: u64,
}

#[near(serializers = [json])]
pub struct Stats {
    /// Coins in rounds that are not settled yet.
    pub held: U128,
    /// Coins owed to players, waiting for `claim`.
    pub claimable_total: U128,
    pub vein: U128,
    /// Coins whose burn did not go through yet. They are burned with the next round.
    pub pending_burn: U128,
    pub staked_total: U128,
    pub paid_total: U128,
    /// Burned with the coin's own `ft_burn`.
    pub burned_by_burn: U128,
    /// Sent to the keyless burn account because the coin has no `ft_burn`.
    pub burned_by_transfer: U128,
    pub rounds_settled: u64,
    pub rounds_refunded: u64,
}

#[near(serializers = [json])]
pub struct CurrentRound {
    pub id: u64,
    pub starts_at: u64,
    pub ends_at: u64,
    /// False in the closed 23:59 round.
    pub open: bool,
    pub totals: Vec<U128>,
    pub total: U128,
    pub players: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Mine {
    config: Config,
    rounds: LookupMap<u64, Round>,
    claimable: LookupMap<AccountId, u128>,
    recent: Vec<RoundSummary>,
    held: u128,
    claimable_total: u128,
    vein: u128,
    pending_burn: u128,
    staked_total: u128,
    paid_total: u128,
    burned_by_burn: u128,
    burned_by_transfer: u128,
    rounds_settled: u64,
    rounds_refunded: u64,
}

fn now_seconds() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn emit(event: &str, data: Value) {
    let payload = json!({
        "standard": "kova_mine",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

/// The account a mine's factory lives at: its parent in the account tree.
fn parent_of(account: &AccountId) -> Option<AccountId> {
    account.as_str().split_once('.')?.1.parse().ok()
}

fn call(receiver: &AccountId, method: &str, args: Value, deposit: NearToken, gas: Gas) -> Promise {
    Promise::new(receiver.clone()).function_call(
        method,
        args.to_string().into_bytes(),
        deposit,
        gas,
    )
}

/// Adds a player's amount to a list, merging repeats and keeping first-seen order.
fn add_payment(payments: &mut Vec<(AccountId, u128)>, player: &AccountId, amount: u128) {
    match payments.iter_mut().find(|(account, _)| account == player) {
        Some((_, total)) => *total += amount,
        None => payments.push((player.clone(), amount)),
    }
}

#[near]
impl Mine {
    /// Called once by the factory, in the same transaction that creates this account.
    #[init]
    pub fn new(
        token: AccountId,
        chip: AccountId,
        min_stake: U128,
        max_stake: U128,
        vein_per_round: U128,
        vein_halving_seconds: u64,
    ) -> Self {
        let me = env::current_account_id();
        let factory = parent_of(&me).unwrap_or_else(|| env::panic_str("A mine lives under a factory"));
        require!(
            env::predecessor_account_id() == factory,
            "Only the factory can set up a mine"
        );
        require!(min_stake.0 > 0, "The minimum stake must be positive");
        require!(
            max_stake.0 >= min_stake.0,
            "The maximum stake is below the minimum"
        );
        require!(
            vein_per_round.0 == 0 || vein_halving_seconds > 0,
            "A vein needs a halving period"
        );
        Self {
            config: Config {
                token,
                chip,
                factory,
                burn_account: BURN_ACCOUNT.parse().expect("the burn account is valid"),
                min_stake,
                max_stake,
                vein_per_round,
                vein_halving_seconds,
                opened_at: now_seconds(),
            },
            rounds: LookupMap::new(StorageKey::Rounds),
            claimable: LookupMap::new(StorageKey::Claimable),
            recent: Vec::new(),
            held: 0,
            claimable_total: 0,
            vein: 0,
            pending_burn: 0,
            staked_total: 0,
            paid_total: 0,
            burned_by_burn: 0,
            burned_by_transfer: 0,
            rounds_settled: 0,
            rounds_refunded: 0,
        }
    }

    // ---------------------------------------------------------------- staking

    /// NEP-141 receiver. Message `{"square":0..24}` puts the coins on a square in the current
    /// round; `{"square":7,"round":29000000}` also pins the round so a late transaction cannot
    /// land in the next one. Message `"vein"` adds coins to the vein.
    ///
    /// A stake the mine cannot take is returned in full, with the reason in the log.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.config.token,
            "Only this mine's coin can be sent here"
        );
        let refused = |reason: &str| {
            emit(
                "refused",
                json!({ "player": sender_id, "amount": amount, "reason": reason }),
            );
            PromiseOrValue::Value(amount)
        };
        let Ok(parsed) = serde_json::from_str::<Value>(&msg) else {
            return refused("message is not JSON");
        };
        if parsed.as_str() == Some("vein") {
            if self.config.vein_per_round.0 == 0 {
                return refused("this mine has no vein");
            }
            self.vein += amount.0;
            emit(
                "vein_funded",
                json!({ "from": sender_id, "amount": amount, "vein": U128(self.vein) }),
            );
            return PromiseOrValue::Value(U128(0));
        }
        let Some(square) = parsed.get("square").and_then(loose_u64) else {
            return refused("message has no square");
        };
        // A round the sender named but the mine cannot read must not be treated as no round:
        // that would drop the guard the sender asked for.
        let hint = match parsed.get("round") {
            None | Some(Value::Null) => None,
            Some(named) => match loose_u64(named) {
                Some(round) => Some(round),
                None => return refused("round is not a number"),
            },
        };
        match self.stake(&sender_id, amount.0, square, hint) {
            Ok(()) => PromiseOrValue::Value(U128(0)),
            Err(reason) => refused(reason),
        }
    }

    // ---------------------------------------------------------------- settling

    /// Anyone, after the round ends and within ten minutes of it. Picks the winning square,
    /// pays the winners, burns 10% of the losing stakes and tells CHIP who won.
    pub fn settle(&mut self, round: U64) -> RoundSummary {
        let id = round.0;
        let now = now_seconds();
        require!(now >= round_end(id), "The round is still running");
        require!(
            now < round_end(id) + SETTLE_WINDOW_SECONDS,
            "The settle window has passed; the round can be refunded"
        );
        let state = self.take_round(id);
        let square = winning_square(&env::current_account_id(), id, &env::random_seed_array());
        let winning: Vec<&Stake> = state
            .stakes
            .iter()
            .filter(|stake| stake.square == square)
            .collect();
        if winning.is_empty() {
            return self.refund(state, "empty_square");
        }
        let stakes: Vec<u128> = winning.iter().map(|stake| stake.amount.0).collect();
        let winning_total = state.totals[usize::from(square)].0;
        let losing_total = state.total.0 - winning_total;
        let bonus = self.release_vein(now);
        let result =
            split(&stakes, losing_total, bonus).unwrap_or_else(|| env::panic_str("Payout overflow"));
        let mut winners = Vec::with_capacity(winning.len());
        let mut payments = Vec::new();
        for (stake, award) in winning.iter().zip(result.awards.iter()) {
            winners.push(Winner {
                player: stake.player.clone(),
                staked: stake.amount,
                award: U128(*award),
            });
            add_payment(&mut payments, &stake.player, *award);
        }
        let weights: Vec<(AccountId, U128)> = winning
            .iter()
            .map(|stake| (stake.player.clone(), stake.amount))
            .collect();
        self.pay_out(payments);
        let burn = result.burn + std::mem::take(&mut self.pending_burn);
        self.burn(burn);
        call(
            &self.config.chip,
            "report_round",
            json!({ "round": U64(id), "players": state.players, "winners": weights }),
            NearToken::from_near(0),
            GAS_REPORT,
        )
        .detach();
        self.rounds_settled += 1;
        let summary = RoundSummary {
            round: id,
            settled_at: now,
            outcome: "settled".to_string(),
            winning_square: Some(square),
            total: state.total,
            burned: U128(result.burn),
            vein: U128(bonus),
            players: state.players,
            winners,
        };
        emit("round_settled", json!(summary));
        self.remember(summary.clone());
        summary
    }

    /// Anyone, once ten minutes have passed since the round ended with no settle. Every stake is
    /// returned in full and nothing is burned.
    pub fn refund_round(&mut self, round: U64) -> RoundSummary {
        let id = round.0;
        require!(
            now_seconds() >= round_end(id) + SETTLE_WINDOW_SECONDS,
            "The round can still be settled"
        );
        let state = self.take_round(id);
        self.refund(state, "never_settled")
    }

    /// Pays out what could not be sent during a settle: a failed transfer, or a round with more
    /// winners than one transaction can pay.
    pub fn claim(&mut self) -> U128 {
        let player = env::predecessor_account_id();
        let amount = self.claimable.remove(&player).unwrap_or(0);
        require!(amount > 0, "Nothing to claim");
        self.claimable_total -= amount;
        call(
            &self.config.token,
            "ft_transfer",
            json!({ "receiver_id": player, "amount": U128(amount), "memo": "kova claim" }),
            ONE_YOCTO,
            GAS_FT_TRANSFER,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_CALLBACK)
                .on_claim(player, U128(amount)),
        )
        .detach();
        U128(amount)
    }

    // ---------------------------------------------------------------- callbacks

    #[private]
    pub fn on_payouts(&mut self, payments: Vec<(AccountId, U128)>) {
        for (index, (player, amount)) in payments.into_iter().enumerate() {
            match env::promise_result_checked(index as u64, 1024) {
                Ok(_) => {
                    self.paid_total += amount.0;
                }
                Err(_) => {
                    emit(
                        "payout_deferred",
                        json!({ "player": player, "amount": amount }),
                    );
                    self.credit(&player, amount.0);
                }
            }
        }
    }

    #[private]
    pub fn on_claim(&mut self, player: AccountId, amount: U128) {
        if env::promise_result_checked(0, 1024).is_ok() {
            self.paid_total += amount.0;
        } else {
            self.credit(&player, amount.0);
        }
    }

    #[private]
    pub fn on_burn(&mut self, amount: U128) {
        if env::promise_result_checked(0, 1024).is_ok() {
            self.burned_by_burn += amount.0;
            emit("burned", json!({ "amount": amount, "how": "ft_burn" }));
            return;
        }
        // The coin has no `ft_burn` (or refused it): register the keyless burn account and send
        // the coins there instead.
        let token = self.config.token.clone();
        let burn_account = self.config.burn_account.clone();
        call(
            &token,
            "storage_deposit",
            json!({ "account_id": burn_account, "registration_only": true }),
            BURN_REGISTRATION,
            GAS_STORAGE_DEPOSIT,
        )
        .then(call(
            &token,
            "ft_transfer",
            json!({ "receiver_id": burn_account, "amount": amount, "memo": "kova burn" }),
            ONE_YOCTO,
            GAS_FT_TRANSFER,
        ))
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_CALLBACK)
                .on_burn_by_transfer(amount),
        )
        .detach();
    }

    #[private]
    pub fn on_burn_by_transfer(&mut self, amount: U128) {
        // Result 1 is the `ft_transfer`; result 0 is the registration, which may fail harmlessly
        // when the burn account is already registered.
        if env::promise_result_checked(1, 1024).is_ok() {
            self.burned_by_transfer += amount.0;
            emit(
                "burned",
                json!({ "amount": amount, "how": "transfer_to_burn_account" }),
            );
        } else {
            self.pending_burn += amount.0;
            emit("burn_deferred", json!({ "amount": amount }));
        }
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            held: U128(self.held),
            claimable_total: U128(self.claimable_total),
            vein: U128(self.vein),
            pending_burn: U128(self.pending_burn),
            staked_total: U128(self.staked_total),
            paid_total: U128(self.paid_total),
            burned_by_burn: U128(self.burned_by_burn),
            burned_by_transfer: U128(self.burned_by_transfer),
            rounds_settled: self.rounds_settled,
            rounds_refunded: self.rounds_refunded,
        }
    }

    pub fn get_current_round(&self) -> CurrentRound {
        let id = round_of(now_seconds());
        let state = self.rounds.get(&id);
        CurrentRound {
            id,
            starts_at: round_start(id),
            ends_at: round_end(id),
            open: !is_closed_round(id),
            totals: state
                .map(|r| r.totals.clone())
                .unwrap_or_else(|| vec![U128(0); SQUARES]),
            total: state.map(|r| r.total).unwrap_or(U128(0)),
            players: state.map(|r| r.players).unwrap_or(0),
        }
    }

    /// A round with stakes that is not settled or refunded yet.
    pub fn get_round(&self, round: U64) -> Option<Round> {
        self.rounds.get(&round.0).cloned()
    }

    /// Newest first.
    pub fn get_recent(&self, limit: Option<u32>) -> Vec<RoundSummary> {
        let limit = limit.unwrap_or(RECENT_ROUNDS as u32) as usize;
        self.recent.iter().rev().take(limit).cloned().collect()
    }

    pub fn get_claimable(&self, account_id: AccountId) -> U128 {
        U128(self.claimable.get(&account_id).copied().unwrap_or(0))
    }

    /// What the vein would release to a round settled now.
    pub fn get_vein_release(&self) -> U128 {
        U128(self.vein_amount(now_seconds()))
    }

    pub fn rounds_per_day(&self) -> u64 {
        ROUNDS_PER_DAY
    }
}

impl Mine {
    fn stake(
        &mut self,
        player: &AccountId,
        amount: u128,
        square: u64,
        hint: Option<u64>,
    ) -> Result<(), &'static str> {
        let id = round_of(now_seconds());
        if is_closed_round(id) {
            return Err("the last minute of the UTC day is closed");
        }
        if hint.is_some_and(|pinned| pinned != id) {
            return Err("that round has ended");
        }
        if square >= SQUARES as u64 {
            return Err("square is not between 0 and 24");
        }
        if amount < self.config.min_stake.0 {
            return Err("below the minimum stake");
        }
        let mut round = self.rounds.get(&id).cloned().unwrap_or_else(|| Round {
            id,
            totals: vec![U128(0); SQUARES],
            total: U128(0),
            players: 0,
            stakes: Vec::new(),
        });
        let square = square as u8;
        let player_total: u128 = round
            .stakes
            .iter()
            .filter(|stake| &stake.player == player)
            .map(|stake| stake.amount.0)
            .sum();
        if player_total + amount > self.config.max_stake.0 {
            return Err("over the stake cap for one round");
        }
        let entry = round
            .stakes
            .iter()
            .position(|stake| &stake.player == player && stake.square == square);
        if entry.is_none() && round.stakes.len() >= MAX_STAKES {
            return Err("the round is full");
        }
        let first_in_round = player_total == 0;
        match entry {
            Some(index) => round.stakes[index].amount.0 += amount,
            None => round.stakes.push(Stake {
                player: player.clone(),
                square,
                amount: U128(amount),
            }),
        }
        round.totals[usize::from(square)].0 += amount;
        round.total.0 += amount;
        if first_in_round {
            round.players += 1;
            // Tells CHIP how many players this minute has across all mines, so it can split the
            // minute's emission. Nothing depends on the answer.
            call(
                &self.config.chip,
                "note_player",
                json!({ "round": U64(id) }),
                NearToken::from_near(0),
                Gas::from_tgas(10),
            )
            .detach();
        }
        self.held += amount;
        self.staked_total += amount;
        emit(
            "staked",
            json!({
                "round": id,
                "player": player,
                "square": square,
                "amount": U128(amount),
                "round_total": round.total,
            }),
        );
        self.rounds.insert(id, round);
        Ok(())
    }

    fn take_round(&mut self, id: u64) -> Round {
        let state = self
            .rounds
            .remove(&id)
            .unwrap_or_else(|| env::panic_str("No stakes in that round, or it is already done"));
        self.held -= state.total.0;
        state
    }

    /// Returns every stake in full.
    fn refund(&mut self, state: Round, reason: &str) -> RoundSummary {
        let mut payments = Vec::new();
        for stake in &state.stakes {
            add_payment(&mut payments, &stake.player, stake.amount.0);
        }
        self.pay_out(payments);
        self.rounds_refunded += 1;
        let summary = RoundSummary {
            round: state.id,
            settled_at: now_seconds(),
            outcome: "refunded".to_string(),
            winning_square: None,
            total: state.total,
            burned: U128(0),
            vein: U128(0),
            players: state.players,
            winners: Vec::new(),
        };
        emit(
            "round_refunded",
            json!({ "round": state.id, "reason": reason, "total": state.total, "players": state.players }),
        );
        self.remember(summary.clone());
        summary
    }

    fn remember(&mut self, summary: RoundSummary) {
        self.recent.push(summary);
        if self.recent.len() > RECENT_ROUNDS {
            self.recent.remove(0);
        }
    }

    fn vein_amount(&self, now: u64) -> u128 {
        let rate = vein_rate(
            self.config.vein_per_round.0,
            now.saturating_sub(self.config.opened_at),
            self.config.vein_halving_seconds,
        );
        rate.min(self.vein)
    }

    fn release_vein(&mut self, now: u64) -> u128 {
        let amount = self.vein_amount(now);
        self.vein -= amount;
        amount
    }

    fn credit(&mut self, player: &AccountId, amount: u128) {
        let owed = self.claimable.get(player).copied().unwrap_or(0);
        self.claimable.insert(player.clone(), owed + amount);
        self.claimable_total += amount;
    }

    /// Sends coins to players. The first `DIRECT_PAYOUTS` go out now; the rest, and any transfer
    /// that fails, wait in `claim`.
    fn pay_out(&mut self, payments: Vec<(AccountId, u128)>) {
        let mut direct: Vec<(AccountId, U128)> = Vec::new();
        for (player, amount) in payments {
            if amount == 0 {
                continue;
            }
            if direct.len() < DIRECT_PAYOUTS {
                direct.push((player, U128(amount)));
            } else {
                emit(
                    "payout_deferred",
                    json!({ "player": player, "amount": U128(amount) }),
                );
                self.credit(&player, amount);
            }
        }
        let mut batch: Option<Promise> = None;
        for (player, amount) in &direct {
            let transfer = call(
                &self.config.token,
                "ft_transfer",
                json!({ "receiver_id": player, "amount": amount, "memo": "kova payout" }),
                ONE_YOCTO,
                GAS_FT_TRANSFER,
            );
            batch = Some(match batch {
                Some(previous) => previous.and(transfer),
                None => transfer,
            });
        }
        if let Some(batch) = batch {
            batch
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_CALLBACK)
                        .on_payouts(direct),
                )
                .detach();
        }
    }

    /// Burns with the coin's `ft_burn`. If the coin has none, `on_burn` sends the coins to the
    /// keyless burn account instead.
    fn burn(&mut self, amount: u128) {
        if amount == 0 {
            return;
        }
        call(
            &self.config.token,
            "ft_burn",
            json!({ "amount": U128(amount) }),
            ONE_YOCTO,
            GAS_FT_TRANSFER,
        )
        .then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_CALLBACK)
                .on_burn(U128(amount)),
        )
        .detach();
    }
}

/// A whole number given as a JSON number or as a string. NEAR writes 64-bit values as strings
/// (`U64`), so CHIP sends the round that way and a hand-written message may send either.
fn loose_u64(value: &Value) -> Option<u64> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.parse().ok(),
        _ => None,
    }
}

/// The winning square of a round: the block's random seed, mixed with this mine and the round so
/// two mines settled in the same block draw independently.
pub fn winning_square(mine: &AccountId, round: u64, seed: &[u8; 32]) -> u8 {
    let hash = env::sha256_array(
        format!("{DOMAIN}|{mine}|{round}|{}", bytes_hex(seed)).as_bytes(),
    );
    square_from_hash(&hash)
}

fn bytes_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;

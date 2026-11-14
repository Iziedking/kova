//! CHIP v3: Kova's own coin.
//!
//! There is no premine and no treasury. CHIP exists only because someone mined it:
//!
//! - **The emission.** 10 CHIP are released every minute across all mines, split by how many
//!   distinct players each mine had that minute, and shared between the winners of each mine's
//!   round by stake. The rate halves every 30 days. Total CHIP ever minted is capped at
//!   21,000,000.
//! - **The Motherlode.** Every settled round with a winner adds 2 CHIP to one jackpot shared by
//!   all mines. Each such round has a 1 in 625 chance of paying the whole jackpot, minted, to
//!   that round's winners. The jackpot is capped.
//! - **The starter claim.** On testnet an account can claim 1,000 CHIP once, out of a fixed
//!   starter budget. Set the starter amount to zero at deploy and the claim does not exist.
//! - **The burn.** Anyone can burn CHIP they hold with `ft_burn`. Every mine burns 10% of the
//!   losing stakes this way.
//!
//! Mines are the factory's direct sub-accounts. The factory creates them only from one
//! immutable global contract and keeps no key to them, so a call from `<name>.<factory>` is a
//! call from mine code that nobody can change. That is the only authority anywhere in CHIP.
//! There is no owner, no setter, no pause and no upgrade.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto,
    env, near, require,
};

pub mod rules;

use rules::{ROUND_SECONDS, emission_rate, is_motherlode, mul_div, split_by_weight};

/// How many minutes of per-minute bookkeeping are kept. A mine can settle a round for ten
/// minutes after it ends, so this is comfortably longer.
const KEEP_MINUTES: u64 = 30;
const MAX_WINNERS: usize = 64;
const GAS_ON_TRANSFER: Gas = Gas::from_tgas(40);
const GAS_RESOLVE: Gas = Gas::from_tgas(10);
const MIN_GAS_MINE_DEPLOY: Gas = Gas::from_tgas(70);

#[derive(near_sdk::borsh::BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Token,
    Metadata,
    Starters,
    MinutePlayers,
    MinuteEmitted,
}

/// Rules fixed at deploy. There is no method that changes them.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    /// The factory whose direct sub-accounts are the mines.
    pub factory: AccountId,
    /// Most CHIP that can ever be minted.
    pub cap: U128,
    /// Paid once per account by `claim_starter`. Zero turns the claim off (mainnet).
    pub starter_amount: U128,
    /// Most CHIP that starter claims can mint in total.
    pub starter_budget: U128,
    /// Released per minute at launch, across all mines.
    pub emission_per_minute: U128,
    pub halving_seconds: u64,
    /// Added to the Motherlode by every settled round with a winner.
    pub motherlode_per_round: U128,
    /// A settled round pays the Motherlode with probability 1 in this.
    pub motherlode_odds: u32,
    /// The Motherlode never holds more than this.
    pub motherlode_cap: U128,
}

impl Config {
    fn assert_valid(&self) {
        require!(self.cap.0 > 0, "The cap must be positive");
        require!(
            self.emission_per_minute.0 > 0,
            "The emission must be positive"
        );
        require!(
            self.halving_seconds >= ROUND_SECONDS,
            "The halving period is under a minute"
        );
        require!(self.motherlode_odds >= 1, "The Motherlode odds must be at least 1");
        require!(
            self.motherlode_per_round.0 <= self.motherlode_cap.0,
            "One round adds more than the Motherlode can hold"
        );
        require!(
            self.starter_amount.0 <= self.starter_budget.0
                && self.starter_budget.0 <= self.cap.0,
            "The starter budget must fit the claim and the cap"
        );
    }
}

#[near(serializers = [json])]
pub struct Stats {
    pub total_supply: U128,
    pub cap: U128,
    pub total_minted: U128,
    pub total_burned: U128,
    pub emission_minted: U128,
    pub motherlode_minted: U128,
    pub starter_minted: U128,
    pub starters_claimed: u32,
    /// CHIP released per minute right now, across all mines.
    pub emission_rate: U128,
    pub motherlode: U128,
    pub motherlode_hits: u32,
    pub rounds_reported: u64,
    pub launched_at: u64,
    pub now_minute: u64,
}

#[near(serializers = [json])]
pub struct MinuteView {
    pub minute: u64,
    pub players: u32,
    pub emitted: U128,
    pub rate: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    config: Config,
    starters: LookupSet<AccountId>,
    /// Distinct players per minute, across all mines. Filled as stakes arrive.
    minute_players: LookupMap<u64, u32>,
    /// CHIP already released per minute.
    minute_emitted: LookupMap<u64, u128>,
    pruned_through: u64,
    launched_at: u64,
    motherlode: u128,
    total_minted: u128,
    total_burned: u128,
    emission_minted: u128,
    motherlode_minted: u128,
    starter_minted: u128,
    starters_claimed: u32,
    motherlode_hits: u32,
    rounds_reported: u64,
}

fn now_seconds() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn now_minute() -> u64 {
    now_seconds() / ROUND_SECONDS
}

fn emit(event: &str, data: serde_json::Value) {
    let payload = json!({
        "standard": "kova_chip",
        "version": "3.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

#[near]
impl Contract {
    /// Deploy-time setup. Callable once, by the contract account itself.
    #[init]
    #[private]
    pub fn new(metadata: FungibleTokenMetadata, config: Config) -> Self {
        metadata.assert_valid();
        config.assert_valid();
        Self {
            token: FungibleToken::new(StorageKey::Token),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            config,
            starters: LookupSet::new(StorageKey::Starters),
            minute_players: LookupMap::new(StorageKey::MinutePlayers),
            minute_emitted: LookupMap::new(StorageKey::MinuteEmitted),
            pruned_through: 0,
            launched_at: now_seconds(),
            motherlode: 0,
            total_minted: 0,
            total_burned: 0,
            emission_minted: 0,
            motherlode_minted: 0,
            starter_minted: 0,
            starters_claimed: 0,
            motherlode_hits: 0,
            rounds_reported: 0,
        }
    }

    // ---------------------------------------------------------------- starter claim

    /// One free starter amount per account. The contract registers the caller and pays the
    /// storage. Anyone with many accounts can farm this; the starter budget is the only limit.
    pub fn claim_starter(&mut self) -> U128 {
        let amount = self.config.starter_amount.0;
        require!(amount > 0, "There is no starter claim on this network");
        let player = env::predecessor_account_id();
        require!(
            self.starters.insert(player.clone()),
            "Starter CHIP was already claimed"
        );
        require!(
            self.starter_minted + amount <= self.config.starter_budget.0,
            "The starter budget is used up"
        );
        self.mint_to(&player, amount, "starter");
        self.starter_minted += amount;
        self.starters_claimed += 1;
        U128(amount)
    }

    // ---------------------------------------------------------------- burning

    /// Burns CHIP from the caller's own balance. Needs one yoctoNEAR, like a transfer.
    #[payable]
    pub fn ft_burn(&mut self, amount: U128) {
        assert_one_yocto();
        require!(amount.0 > 0, "The amount should be a positive number");
        let owner = env::predecessor_account_id();
        self.token.internal_withdraw(&owner, amount.0);
        self.total_burned += amount.0;
        FtBurn {
            owner_id: &owner,
            amount,
            memo: Some("burn"),
        }
        .emit();
    }

    // ---------------------------------------------------------------- mining

    /// Puts CHIP on a square of a mine in one call and no deposit, so a game key (a function-call
    /// key cannot attach a deposit) can play without a wallet popup. It does what
    /// `ft_transfer_call` with the message `{"square":n}` does, and only to a mine.
    pub fn mine_deploy(
        &mut self,
        mine: AccountId,
        square: u8,
        amount: U128,
        round: Option<U64>,
    ) -> Promise {
        require!(self.is_mine(&mine), "That account is not a mine");
        require!(
            env::prepaid_gas() >= MIN_GAS_MINE_DEPLOY,
            "Attach at least 70 Tgas"
        );
        let player = env::predecessor_account_id();
        if !self.token.accounts.contains_key(&mine) {
            self.token.internal_register_account(&mine);
        }
        self.token
            .internal_transfer(&player, &mine, amount.0, Some("mine".to_string()));
        let msg = match round {
            Some(round) => json!({ "square": square, "round": round }),
            None => json!({ "square": square }),
        };
        Promise::new(mine.clone())
            .function_call(
                "ft_on_transfer",
                json!({ "sender_id": player, "amount": amount, "msg": msg.to_string() })
                    .to_string()
                    .into_bytes(),
                NearToken::from_near(0),
                GAS_ON_TRANSFER,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_RESOLVE)
                    .ft_resolve_transfer(player, mine, amount),
            )
    }

    /// A mine tells CHIP that a new player staked in a round. CHIP counts players per minute
    /// across all mines to split that minute's emission.
    pub fn note_player(&mut self, round: U64) {
        self.assert_mine();
        let minute = now_minute();
        // A stake is noted in its own minute; allow one minute for the receipt to arrive.
        if round.0 > minute || round.0 + 1 < minute {
            return;
        }
        let players = self.minute_players.get(&round.0).copied().unwrap_or(0);
        self.minute_players.insert(round.0, players + 1);
        self.prune(minute);
    }

    /// A mine tells CHIP who won a round it just settled. CHIP mints that mine's share of the
    /// minute's emission to the winners, adds to the Motherlode, and rolls for it.
    ///
    /// `winners` holds each winning account and its stake on the winning square.
    pub fn report_round(&mut self, round: U64, players: u32, winners: Vec<(AccountId, U128)>) {
        let mine = self.assert_mine();
        let minute = now_minute();
        require!(round.0 < minute, "That round has not ended");
        require!(
            minute - round.0 <= KEEP_MINUTES,
            "That round is too old to emit for"
        );
        require!(
            !winners.is_empty() && winners.len() <= MAX_WINNERS && players > 0,
            "A round needs players and between 1 and 64 winners"
        );
        let weights: Vec<u128> = winners.iter().map(|(_, weight)| weight.0).collect();
        require!(!weights.contains(&0), "A winner has no stake");
        self.rounds_reported += 1;

        // The emission: this mine's share of the minute's rate, never more than the minute has
        // left and never past the cap.
        let counted = self.minute_players.get(&round.0).copied().unwrap_or(0);
        let total_players = counted.max(players);
        let rate = emission_rate(
            self.config.emission_per_minute.0,
            (round.0 * ROUND_SECONDS).saturating_sub(self.launched_at),
            self.config.halving_seconds,
        );
        let share = mul_div(rate, u128::from(players), u128::from(total_players)).unwrap_or(0);
        let emitted = self.minute_emitted.get(&round.0).copied().unwrap_or(0);
        let emission = share.min(rate.saturating_sub(emitted)).min(self.cap_left());
        if emission > 0 {
            self.minute_emitted.insert(round.0, emitted + emission);
            let memo = format!("emission:round:{}", round.0);
            self.mint_split(&winners, &weights, emission, &memo);
            self.emission_minted += emission;
        }

        // The Motherlode.
        self.motherlode = (self.motherlode + self.config.motherlode_per_round.0)
            .min(self.config.motherlode_cap.0);
        let hash = env::sha256_array(
            format!(
                "kova-motherlode-v1|{mine}|{}|{}",
                round.0,
                hex(&env::random_seed_array())
            )
            .as_bytes(),
        );
        let mut jackpot = 0u128;
        if is_motherlode(&hash, self.config.motherlode_odds) {
            jackpot = self.motherlode.min(self.cap_left());
            self.motherlode = 0;
            self.motherlode_hits += 1;
            if jackpot > 0 {
                let memo = format!("motherlode:round:{}", round.0);
                self.mint_split(&winners, &weights, jackpot, &memo);
                self.motherlode_minted += jackpot;
            }
        }
        emit(
            "round_reported",
            json!({
                "mine": mine,
                "round": round,
                "players": players,
                "minute_players": total_players,
                "emission": U128(emission),
                "motherlode_hit": jackpot > 0,
                "motherlode_paid": U128(jackpot),
                "motherlode": U128(self.motherlode),
            }),
        );
        self.prune(minute);
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_stats(&self) -> Stats {
        let minute = now_minute();
        Stats {
            total_supply: U128(self.token.total_supply),
            cap: self.config.cap,
            total_minted: U128(self.total_minted),
            total_burned: U128(self.total_burned),
            emission_minted: U128(self.emission_minted),
            motherlode_minted: U128(self.motherlode_minted),
            starter_minted: U128(self.starter_minted),
            starters_claimed: self.starters_claimed,
            emission_rate: U128(self.rate_at(minute)),
            motherlode: U128(self.motherlode),
            motherlode_hits: self.motherlode_hits,
            rounds_reported: self.rounds_reported,
            launched_at: self.launched_at,
            now_minute: minute,
        }
    }

    pub fn get_minute(&self, minute: U64) -> MinuteView {
        MinuteView {
            minute: minute.0,
            players: self.minute_players.get(&minute.0).copied().unwrap_or(0),
            emitted: U128(self.minute_emitted.get(&minute.0).copied().unwrap_or(0)),
            rate: U128(self.rate_at(minute.0)),
        }
    }

    pub fn has_claimed_starter(&self, account_id: AccountId) -> bool {
        self.starters.contains(&account_id)
    }

    pub fn is_mine_account(&self, account_id: AccountId) -> bool {
        self.is_mine(&account_id)
    }
}

impl Contract {
    fn rate_at(&self, minute: u64) -> u128 {
        emission_rate(
            self.config.emission_per_minute.0,
            (minute * ROUND_SECONDS).saturating_sub(self.launched_at),
            self.config.halving_seconds,
        )
    }

    fn cap_left(&self) -> u128 {
        self.config.cap.0.saturating_sub(self.total_minted)
    }

    /// True for `<label>.<factory>` with a single-label name.
    fn is_mine(&self, account: &AccountId) -> bool {
        account
            .as_str()
            .strip_suffix(self.config.factory.as_str())
            .and_then(|head| head.strip_suffix('.'))
            .is_some_and(|label| !label.is_empty() && !label.contains('.'))
    }

    fn assert_mine(&self) -> AccountId {
        let caller = env::predecessor_account_id();
        require!(self.is_mine(&caller), "Only a Kova mine can call this");
        caller
    }

    fn mint_to(&mut self, account: &AccountId, amount: u128, memo: &str) {
        require!(amount <= self.cap_left(), "The cap is reached");
        if !self.token.accounts.contains_key(account) {
            self.token.internal_register_account(account);
        }
        self.token.internal_deposit(account, amount);
        self.total_minted += amount;
        FtMint {
            owner_id: account,
            amount: U128(amount),
            memo: Some(memo),
        }
        .emit();
    }

    fn mint_split(
        &mut self,
        winners: &[(AccountId, U128)],
        weights: &[u128],
        amount: u128,
        memo: &str,
    ) {
        let parts = split_by_weight(amount, weights)
            .unwrap_or_else(|| env::panic_str("The winners' weights are invalid"));
        for ((account, _), part) in winners.iter().zip(parts) {
            if part > 0 {
                self.mint_to(account, part, memo);
            }
        }
    }

    /// Forgets the per-minute counters that no mine can still use.
    fn prune(&mut self, minute: u64) {
        let floor = minute.saturating_sub(KEEP_MINUTES);
        let mut next = self.pruned_through.max(floor.saturating_sub(40));
        while next < floor {
            self.minute_players.remove(&next);
            self.minute_emitted.remove(&next);
            next += 1;
        }
        self.pruned_through = self.pruned_through.max(floor);
    }
}

// ---------------------------------------------------------------- NEP-141

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        // A mine cannot register itself, so CHIP does it the first time one is sent CHIP.
        if self.is_mine(&receiver_id) && !self.token.accounts.contains_key(&receiver_id) {
            self.token.internal_register_account(&receiver_id);
        }
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for Contract {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, burned) = self
            .token
            .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        self.total_burned += burned;
        U128(used)
    }
}

#[near]
impl StorageManagement for Contract {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        match self.token.internal_storage_unregister(force) {
            Some((_, balance)) => {
                self.total_burned += balance;
                true
            }
            None => false,
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Contract {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().expect("metadata is set at deploy")
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;

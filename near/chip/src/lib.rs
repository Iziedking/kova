//! CHIP: a NEP-141 memecoin whose own contract runs Kova's poker tables.
//!
//! The mechanic lives here, not in a backend:
//! - **The pot burns.** A fixed share of every settled pot is burned.
//! - **The daily call.** Each UTC day has a target of settled tables. Met: everyone who played
//!   that day can claim an equal share of a fixed mint. Missed: a fixed share of the treasury
//!   burns. Anyone can close a past day.
//! - **Blinds.** A holder who has not staked at a table for the grace period pays a small blind
//!   to the treasury for every idle period, never below a floor. Worked out lazily, before the
//!   holder's balance next changes.
//!
//! Every parameter is set once at deploy and readable through `get_config`. There is no owner,
//! no setter and no upgrade method.
//!
//! The one trusted role is the settler: it reveals picks with their start prices and reports end
//! prices, so it decides who wins a table. It cannot touch the treasury, change a rule, or stop
//! refunds: any account can void a table whose deadline passed and everyone gets their stake back.

use near_contract_standards::fungible_token::events::{FtBurn, FtMint, FtTransfer};
use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::borsh::BorshSerialize;
use near_sdk::collections::LazyOption;
use near_sdk::json_types::{U64, U128};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise, PromiseOrValue,
    assert_one_yocto, env, near, require,
};

pub mod rules;

use rules::{BPS, BlindRule, MAX_PRICE, blind_owed, day_of, score_bps, split_pot};

pub const MIN_SEATS: u8 = 2;
pub const MAX_SEATS: u8 = 6;
pub const MIN_OPEN_SECONDS: u32 = 30;
pub const MAX_OPEN_SECONDS: u32 = 600;
pub const MIN_ROUND_SECONDS: u32 = 30;
pub const MAX_ROUND_SECONDS: u32 = 900;
/// Time the settler has after a table locks to reveal picks with their start prices.
pub const START_WINDOW_SECONDS: u64 = 120;
/// Time the settler has after a round ends to report end prices.
pub const SETTLE_WINDOW_SECONDS: u64 = 300;
pub const MAX_POT_BURN_BPS: u16 = 5_000;
pub const MAX_MISS_BURN_BPS: u16 = 2_000;
pub const MAX_BLIND_BPS: u16 = 1_000;
pub const MIN_BLIND_SECONDS: u64 = 60;
pub const MAX_MARKET_LEN: usize = 96;
pub const MIN_SALT_LEN: usize = 16;
pub const MAX_SALT_LEN: usize = 128;
/// Commitment is sha256 over `PICK_DOMAIN|player|market|salt`, as lowercase hex.
pub const PICK_DOMAIN: &str = "kova-chip-pick-v1";
const MAX_TABLE_PAGE: u32 = 50;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Token,
    Metadata,
    Holders,
    Tables,
    Days,
    Played,
    DailyClaimed,
}

/// Rules fixed at deploy. There is no method that changes them.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    /// The only account that may reveal picks and report prices.
    pub settler: AccountId,
    /// Paid once to each account from the treasury by `claim_starter`.
    pub starter_amount: U128,
    pub min_stake: U128,
    pub max_stake: U128,
    /// Share of every settled pot that is burned.
    pub pot_burn_bps: u16,
    /// Settled tables a UTC day needs for the daily mint.
    pub daily_target_tables: u32,
    /// Minted and shared equally between the day's players when the target is met.
    pub daily_mint: U128,
    /// Share of the treasury burned when a day misses its target.
    pub daily_miss_burn_bps: u16,
    pub blind_grace_seconds: u64,
    pub blind_period_seconds: u64,
    pub blind_bps: u16,
    pub blind_floor: U128,
}

impl Config {
    fn assert_valid(&self) {
        require!(self.starter_amount.0 > 0, "Starter amount must be positive");
        require!(self.min_stake.0 > 0, "Minimum stake must be positive");
        require!(
            self.max_stake.0 >= self.min_stake.0,
            "Maximum stake is below the minimum"
        );
        require!(
            self.pot_burn_bps > 0 && self.pot_burn_bps <= MAX_POT_BURN_BPS,
            "Pot burn is outside 1 to 5000 bps"
        );
        require!(self.daily_target_tables > 0, "Daily target must be positive");
        require!(
            self.daily_miss_burn_bps <= MAX_MISS_BURN_BPS,
            "Daily miss burn is above 2000 bps"
        );
        require!(
            self.blind_bps <= MAX_BLIND_BPS,
            "Blind is above 1000 bps per period"
        );
        require!(
            self.blind_grace_seconds >= MIN_BLIND_SECONDS
                && self.blind_period_seconds >= MIN_BLIND_SECONDS,
            "Blind grace and period must be at least 60 seconds"
        );
    }

    fn blind_rule(&self) -> BlindRule {
        BlindRule {
            grace_seconds: self.blind_grace_seconds,
            period_seconds: self.blind_period_seconds,
            bps: self.blind_bps,
            floor: self.blind_floor.0,
        }
    }
}

/// Per-holder game state kept beside the NEP-141 balance.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default)]
pub struct Holder {
    /// Unix seconds of the last stake at a table, or of registration.
    pub last_play: u64,
    /// Unix seconds up to which blinds have been charged.
    pub blind_through: u64,
    pub starter_claimed: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableStatus {
    /// Seats can be taken until `open_until`.
    Open,
    /// Full, or locked by the host. Waiting for the settler to reveal picks.
    Locked,
    /// Round running until `ends_at`, then waiting for end prices.
    Active,
    /// Pot burned and paid.
    Settled,
    /// Never started. Every stake was refunded.
    Cancelled,
    /// Started but the settler missed its deadline. Every stake was refunded.
    Voided,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Seat {
    pub player: AccountId,
    /// sha256 hex of `PICK_DOMAIN|player|market|salt`.
    pub commitment: String,
    pub market: Option<String>,
    pub start_price: Option<U128>,
    pub end_price: Option<U128>,
    pub score_bps: Option<i64>,
    pub award: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Table {
    pub id: U64,
    pub host: AccountId,
    pub stake: U128,
    pub seats: u8,
    pub round_seconds: u32,
    pub status: TableStatus,
    pub opened_at: u64,
    pub open_until: u64,
    pub locked_at: u64,
    pub start_deadline: u64,
    pub starts_at: u64,
    pub ends_at: u64,
    pub settle_deadline: u64,
    pub pot: U128,
    pub burned: U128,
    pub winners: u8,
    pub players: Vec<Seat>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, Default)]
pub struct DayState {
    pub settled_tables: u32,
    pub players: u32,
    pub closed: bool,
    pub target_met: bool,
    /// Each player's claimable mint when the target was met.
    pub share: U128,
    pub minted: U128,
    pub burned: U128,
}

/// The settler's reveal of one seat when a round starts.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Reveal {
    pub player: AccountId,
    pub market: String,
    pub salt: String,
    pub start_price: U128,
}

/// The settler's end price for one seat.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PriceReport {
    pub player: AccountId,
    pub end_price: U128,
}

#[near(serializers = [json])]
pub struct Stats {
    pub total_supply: U128,
    pub circulating: U128,
    pub treasury: U128,
    pub escrow: U128,
    pub initial_supply: U128,
    pub total_minted: U128,
    pub total_burned: U128,
    pub pot_burned: U128,
    pub daily_burned: U128,
    pub blinds_collected: U128,
    pub starters_claimed: u32,
    pub tables_opened: u64,
    pub tables_settled: u64,
    pub tables_refunded: u64,
    pub launch_day: u32,
    pub today: u32,
    pub today_settled_tables: u32,
    pub today_players: u32,
    pub daily_target_tables: u32,
}

#[near(serializers = [json])]
pub struct HolderView {
    pub registered: bool,
    /// Balance after any blind owed now.
    pub balance: U128,
    pub stored_balance: U128,
    pub pending_blind: U128,
    pub last_play: u64,
    pub blind_through: u64,
    pub starter_claimed: bool,
}

#[near(serializers = [json])]
pub struct DailyClaimView {
    pub played: bool,
    pub claimed: bool,
    pub claimable: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    config: Config,
    holders: LookupMap<AccountId, Holder>,
    tables: LookupMap<u64, Table>,
    days: LookupMap<u32, DayState>,
    played: LookupSet<(u32, AccountId)>,
    daily_claimed: LookupSet<(u32, AccountId)>,
    /// Chips only the rules can move: starter claims out, blinds in, miss burns out.
    treasury: u128,
    /// Stakes sitting at tables.
    escrow: u128,
    /// Storage bytes one registered holder uses (balance plus game state).
    holder_storage_usage: u64,
    initial_supply: u128,
    total_minted: u128,
    pot_burned: u128,
    daily_burned: u128,
    blinds_collected: u128,
    starters_claimed: u32,
    next_table_id: u64,
    tables_settled: u64,
    tables_refunded: u64,
    launch_day: u32,
}

fn now_seconds() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn emit_kova(event: &str, data: serde_json::Value) {
    let payload = json!({
        "standard": "kova",
        "version": "1.0.0",
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

/// The commitment a player submits when taking a seat.
pub fn pick_commitment(player: &AccountId, market: &str, salt: &str) -> String {
    let preimage = format!("{PICK_DOMAIN}|{player}|{market}|{salt}");
    hex(&env::sha256_array(preimage.as_bytes()))
}

fn assert_commitment_shape(commitment: &str) {
    require!(
        commitment.len() == 64
            && commitment
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
        "Commitment must be 64 lowercase hex characters"
    );
}

#[near]
impl Contract {
    /// Deploy-time setup. Callable once, by the contract account itself.
    ///
    /// `treasury_supply` is minted into the treasury. `house_bankroll` is minted to the House,
    /// which plays as an ordinary account and can go broke.
    #[init]
    #[private]
    pub fn new(
        metadata: FungibleTokenMetadata,
        config: Config,
        treasury_supply: U128,
        house_account: AccountId,
        house_bankroll: U128,
    ) -> Self {
        metadata.assert_valid();
        config.assert_valid();
        require!(
            config.starter_amount.0 <= treasury_supply.0,
            "Treasury cannot fund one starter claim"
        );
        require!(
            house_account != env::current_account_id(),
            "The House must be its own account"
        );
        let now = now_seconds();
        let mut this = Self {
            token: FungibleToken::new(StorageKey::Token),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            config,
            holders: LookupMap::new(StorageKey::Holders),
            tables: LookupMap::new(StorageKey::Tables),
            days: LookupMap::new(StorageKey::Days),
            played: LookupSet::new(StorageKey::Played),
            daily_claimed: LookupSet::new(StorageKey::DailyClaimed),
            treasury: treasury_supply.0,
            escrow: 0,
            holder_storage_usage: 0,
            initial_supply: treasury_supply.0 + house_bankroll.0,
            total_minted: 0,
            pot_burned: 0,
            daily_burned: 0,
            blinds_collected: 0,
            starters_claimed: 0,
            next_table_id: 1,
            tables_settled: 0,
            tables_refunded: 0,
            launch_day: day_of(now),
        };
        this.measure_holder_storage();
        let contract_id = env::current_account_id();
        FtMint {
            owner_id: &contract_id,
            amount: treasury_supply,
            memo: Some("genesis:treasury"),
        }
        .emit();
        this.register(&house_account);
        if house_bankroll.0 > 0 {
            this.token.internal_deposit(&house_account, house_bankroll.0);
            FtMint {
                owner_id: &house_account,
                amount: house_bankroll,
                memo: Some("genesis:house_bankroll"),
            }
            .emit();
        }
        this
    }

    // ---------------------------------------------------------------- starter claim

    /// One free starter amount per account, paid from the treasury. Registers the caller if
    /// needed, with the contract paying the storage. Anyone with many accounts can farm this:
    /// the treasury is the only limit.
    pub fn claim_starter(&mut self) -> U128 {
        let player = env::predecessor_account_id();
        require!(
            player != env::current_account_id(),
            "The contract cannot claim"
        );
        if !self.is_registered(&player) {
            self.register(&player);
        }
        self.collect_blind(&player);
        let mut holder = self.holder(&player);
        require!(!holder.starter_claimed, "Starter chips were already claimed");
        let amount = self.config.starter_amount.0;
        require!(self.treasury >= amount, "The treasury is empty");
        holder.starter_claimed = true;
        self.holders.insert(player.clone(), holder);
        self.treasury -= amount;
        self.token.internal_deposit(&player, amount);
        self.starters_claimed += 1;
        let contract_id = env::current_account_id();
        FtTransfer {
            old_owner_id: &contract_id,
            new_owner_id: &player,
            amount: U128(amount),
            memo: Some("starter"),
        }
        .emit();
        U128(amount)
    }

    // ---------------------------------------------------------------- tables

    /// Opens a table and seats the caller with their stake and commitment.
    pub fn open_table(
        &mut self,
        stake: U128,
        seats: u8,
        round_seconds: u32,
        open_seconds: u32,
        commitment: String,
    ) -> U64 {
        require!(
            stake.0 >= self.config.min_stake.0 && stake.0 <= self.config.max_stake.0,
            "Stake is outside the allowed range"
        );
        require!(
            (MIN_SEATS..=MAX_SEATS).contains(&seats),
            "Seats must be between 2 and 6"
        );
        require!(
            (MIN_ROUND_SECONDS..=MAX_ROUND_SECONDS).contains(&round_seconds),
            "Round length must be between 30 and 900 seconds"
        );
        require!(
            (MIN_OPEN_SECONDS..=MAX_OPEN_SECONDS).contains(&open_seconds),
            "Open window must be between 30 and 600 seconds"
        );
        let host = env::predecessor_account_id();
        let now = now_seconds();
        let id = self.next_table_id;
        self.next_table_id += 1;
        let mut table = Table {
            id: U64(id),
            host: host.clone(),
            stake,
            seats,
            round_seconds,
            status: TableStatus::Open,
            opened_at: now,
            open_until: now + u64::from(open_seconds),
            locked_at: 0,
            start_deadline: 0,
            starts_at: 0,
            ends_at: 0,
            settle_deadline: 0,
            pot: U128(0),
            burned: U128(0),
            winners: 0,
            players: Vec::new(),
        };
        emit_kova(
            "table_opened",
            json!({
                "table_id": U64(id),
                "host": host,
                "stake": stake,
                "seats": seats,
                "round_seconds": round_seconds,
                "open_until": table.open_until,
            }),
        );
        self.seat(&mut table, host, commitment);
        self.tables.insert(id, table);
        U64(id)
    }

    /// Takes a seat at an open table with the table's stake and a commitment to a pick.
    pub fn join_table(&mut self, table_id: U64, commitment: String) {
        let mut table = self.table(table_id.0);
        require!(table.status == TableStatus::Open, "Table is not open");
        require!(now_seconds() < table.open_until, "Open window has passed");
        let player = env::predecessor_account_id();
        self.seat(&mut table, player, commitment);
        self.tables.insert(table_id.0, table);
    }

    /// The host may start early once at least two seats are taken.
    pub fn lock_table(&mut self, table_id: U64) {
        let mut table = self.table(table_id.0);
        require!(
            env::predecessor_account_id() == table.host,
            "Only the host can lock"
        );
        require!(table.status == TableStatus::Open, "Table is not open");
        require!(now_seconds() < table.open_until, "Open window has passed");
        require!(
            table.players.len() >= usize::from(MIN_SEATS),
            "At least two seats are needed"
        );
        Self::lock(&mut table);
        self.tables.insert(table_id.0, table);
    }

    /// Settler only. Reveals every pick with its start price, in seat order. Each reveal must
    /// match the commitment the player made when taking the seat.
    pub fn start_round(&mut self, table_id: U64, reveals: Vec<Reveal>) {
        self.assert_settler();
        let mut table = self.table(table_id.0);
        require!(table.status == TableStatus::Locked, "Table is not locked");
        let now = now_seconds();
        require!(now < table.start_deadline, "Start window has passed");
        require!(
            reveals.len() == table.players.len(),
            "One reveal per seat is required"
        );
        for (seat, reveal) in table.players.iter_mut().zip(reveals.iter()) {
            require!(
                seat.player == reveal.player,
                "Reveals must follow seat order"
            );
            require!(
                !reveal.market.is_empty() && reveal.market.len() <= MAX_MARKET_LEN,
                "Market id length is invalid"
            );
            require!(
                (MIN_SALT_LEN..=MAX_SALT_LEN).contains(&reveal.salt.len()),
                "Salt length is invalid"
            );
            require!(
                reveal.start_price.0 > 0 && reveal.start_price.0 <= MAX_PRICE,
                "Start price is invalid"
            );
            require!(
                pick_commitment(&seat.player, &reveal.market, &reveal.salt) == seat.commitment,
                "Reveal does not match the commitment"
            );
            seat.market = Some(reveal.market.clone());
            seat.start_price = Some(reveal.start_price);
        }
        table.status = TableStatus::Active;
        table.starts_at = now;
        table.ends_at = now + u64::from(table.round_seconds);
        table.settle_deadline = table.ends_at + SETTLE_WINDOW_SECONDS;
        emit_kova(
            "round_started",
            json!({
                "table_id": table.id,
                "ends_at": table.ends_at,
                "settle_deadline": table.settle_deadline,
                "picks": table.players.iter().map(|seat| json!({
                    "player": seat.player,
                    "market": seat.market,
                    "start_price": seat.start_price,
                })).collect::<Vec<_>>(),
            }),
        );
        self.tables.insert(table_id.0, table);
    }

    /// Settler only. Reports end prices in seat order, then burns the pot share, pays the
    /// winners and counts the table toward today's call. All in this one call.
    pub fn settle_round(&mut self, table_id: U64, reports: Vec<PriceReport>) {
        self.assert_settler();
        let mut table = self.table(table_id.0);
        require!(table.status == TableStatus::Active, "Table is not active");
        let now = now_seconds();
        require!(now >= table.ends_at, "Round is still running");
        require!(now < table.settle_deadline, "Settle window has passed");
        require!(
            reports.len() == table.players.len(),
            "One price per seat is required"
        );
        let mut scores = Vec::with_capacity(reports.len());
        for (seat, report) in table.players.iter_mut().zip(reports.iter()) {
            require!(
                seat.player == report.player,
                "Prices must follow seat order"
            );
            require!(report.end_price.0 <= MAX_PRICE, "End price is invalid");
            let start = seat.start_price.expect("started seats have a start price").0;
            let score = score_bps(start, report.end_price.0).unwrap_or_else(|e| env::panic_str(e));
            seat.end_price = Some(report.end_price);
            seat.score_bps = Some(score);
            scores.push(score);
        }
        let pot = table.pot.0;
        let split = split_pot(pot, self.config.pot_burn_bps, &scores)
            .unwrap_or_else(|e| env::panic_str(e));
        self.escrow -= pot;
        let contract_id = env::current_account_id();
        let burn_memo = format!("pot_burn:table:{}", table.id.0);
        if split.burn > 0 {
            self.pot_burned += split.burn;
            FtBurn {
                owner_id: &contract_id,
                amount: U128(split.burn),
                memo: Some(&burn_memo),
            }
            .emit();
        }
        let pay_memo = format!("pot:table:{}", table.id.0);
        for (seat, award) in table.players.iter_mut().zip(split.awards.iter()) {
            seat.award = U128(*award);
            if *award > 0 {
                self.collect_blind(&seat.player);
                self.token.internal_deposit(&seat.player, *award);
                FtTransfer {
                    old_owner_id: &contract_id,
                    new_owner_id: &seat.player,
                    amount: U128(*award),
                    memo: Some(&pay_memo),
                }
                .emit();
            }
        }
        table.status = TableStatus::Settled;
        table.burned = U128(split.burn);
        table.winners = split.winners;
        self.tables_settled += 1;

        let today = day_of(now);
        let mut day = self.days.get(&today).cloned().unwrap_or_default();
        day.settled_tables += 1;
        for seat in &table.players {
            if self.played.insert((today, seat.player.clone())) {
                day.players += 1;
            }
        }
        emit_kova(
            "round_settled",
            json!({
                "table_id": table.id,
                "pot": table.pot,
                "burned": U128(split.burn),
                "winners": table.players.iter().filter(|s| s.award.0 > 0).map(|s| json!({
                    "player": s.player,
                    "award": s.award,
                    "score_bps": s.score_bps,
                })).collect::<Vec<_>>(),
                "total_supply": U128(self.total_supply()),
                "day": today,
                "day_settled_tables": day.settled_tables,
                "daily_target_tables": self.config.daily_target_tables,
            }),
        );
        self.days.insert(today, day);
        self.tables.insert(table_id.0, table);
    }

    /// Anyone. Refunds every stake at a table whose current deadline has passed.
    pub fn void_table(&mut self, table_id: U64) {
        let mut table = self.table(table_id.0);
        let now = now_seconds();
        let (due, next) = match table.status {
            TableStatus::Open => (now >= table.open_until, TableStatus::Cancelled),
            TableStatus::Locked => (now >= table.start_deadline, TableStatus::Cancelled),
            TableStatus::Active => (now >= table.settle_deadline, TableStatus::Voided),
            _ => (false, table.status),
        };
        require!(due, "No deadline has passed for this table");
        let contract_id = env::current_account_id();
        let memo = format!("refund:table:{}", table.id.0);
        let stake = table.stake.0;
        for seat in &table.players {
            self.escrow -= stake;
            self.collect_blind(&seat.player);
            self.token.internal_deposit(&seat.player, stake);
            FtTransfer {
                old_owner_id: &contract_id,
                new_owner_id: &seat.player,
                amount: U128(stake),
                memo: Some(&memo),
            }
            .emit();
        }
        table.status = next;
        self.tables_refunded += 1;
        emit_kova(
            "table_refunded",
            json!({
                "table_id": table.id,
                "status": next,
                "refunded_seats": table.players.len(),
                "triggered_by": env::predecessor_account_id(),
            }),
        );
        self.tables.insert(table_id.0, table);
    }

    // ---------------------------------------------------------------- the daily call

    /// Anyone. Closes a finished UTC day once. Target met: the day's players can each claim an
    /// equal share of the daily mint. Target missed: a share of the treasury burns.
    pub fn close_day(&mut self, day: u32) -> DayState {
        let today = day_of(now_seconds());
        require!(day < today, "Only a finished day can be closed");
        require!(day >= self.launch_day, "That day is before launch");
        let mut state = self.days.get(&day).cloned().unwrap_or_default();
        require!(!state.closed, "This day is already closed");
        state.closed = true;
        if state.settled_tables >= self.config.daily_target_tables && state.players > 0 {
            state.target_met = true;
            state.share = U128(self.config.daily_mint.0 / u128::from(state.players));
        } else {
            let burn = self.treasury * u128::from(self.config.daily_miss_burn_bps) / BPS;
            if burn > 0 {
                self.treasury -= burn;
                self.daily_burned += burn;
                state.burned = U128(burn);
                let contract_id = env::current_account_id();
                let memo = format!("daily_miss:day:{day}");
                FtBurn {
                    owner_id: &contract_id,
                    amount: U128(burn),
                    memo: Some(&memo),
                }
                .emit();
            }
        }
        emit_kova(
            "day_closed",
            json!({
                "day": day,
                "settled_tables": state.settled_tables,
                "target": self.config.daily_target_tables,
                "target_met": state.target_met,
                "players": state.players,
                "share": state.share,
                "burned": state.burned,
                "closed_by": env::predecessor_account_id(),
            }),
        );
        self.days.insert(day, state.clone());
        state
    }

    /// A player of a closed day that met its target claims their share of the daily mint once.
    pub fn claim_daily(&mut self, day: u32) -> U128 {
        let player = env::predecessor_account_id();
        let mut state = self
            .days
            .get(&day)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Nothing happened that day"));
        require!(state.closed, "That day is not closed yet");
        require!(state.target_met, "That day missed its target");
        require!(
            self.played.contains(&(day, player.clone())),
            "You did not play that day"
        );
        require!(
            self.daily_claimed.insert((day, player.clone())),
            "Daily share already claimed"
        );
        let share = state.share.0;
        if share > 0 {
            self.collect_blind(&player);
            self.token.internal_deposit(&player, share);
            self.total_minted += share;
            state.minted = U128(state.minted.0 + share);
            self.days.insert(day, state);
            let memo = format!("daily_call:day:{day}");
            FtMint {
                owner_id: &player,
                amount: U128(share),
                memo: Some(&memo),
            }
            .emit();
        }
        U128(share)
    }

    // ---------------------------------------------------------------- blinds

    /// Anyone. Moves the blind an idle holder owes into the treasury now. Blinds are also
    /// collected automatically before any change to that holder's balance.
    pub fn collect_blinds(&mut self, account_id: AccountId) -> U128 {
        U128(self.collect_blind(&account_id))
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_stats(&self) -> Stats {
        let today = day_of(now_seconds());
        let day = self.days.get(&today).cloned().unwrap_or_default();
        Stats {
            total_supply: U128(self.total_supply()),
            circulating: U128(self.token.total_supply),
            treasury: U128(self.treasury),
            escrow: U128(self.escrow),
            initial_supply: U128(self.initial_supply),
            total_minted: U128(self.total_minted),
            total_burned: U128(self.pot_burned + self.daily_burned),
            pot_burned: U128(self.pot_burned),
            daily_burned: U128(self.daily_burned),
            blinds_collected: U128(self.blinds_collected),
            starters_claimed: self.starters_claimed,
            tables_opened: self.next_table_id - 1,
            tables_settled: self.tables_settled,
            tables_refunded: self.tables_refunded,
            launch_day: self.launch_day,
            today,
            today_settled_tables: day.settled_tables,
            today_players: day.players,
            daily_target_tables: self.config.daily_target_tables,
        }
    }

    pub fn get_table(&self, table_id: U64) -> Option<Table> {
        self.tables.get(&table_id.0).cloned()
    }

    /// Newest first. `before` is exclusive.
    pub fn get_tables(&self, before: Option<U64>, limit: Option<u32>) -> Vec<Table> {
        let limit = limit.unwrap_or(20).min(MAX_TABLE_PAGE) as usize;
        let mut id = before.map(|b| b.0).unwrap_or(self.next_table_id);
        let mut out = Vec::with_capacity(limit);
        while id > 1 && out.len() < limit {
            id -= 1;
            if let Some(table) = self.tables.get(&id) {
                out.push(table.clone());
            }
        }
        out
    }

    pub fn get_day(&self, day: u32) -> DayState {
        self.days.get(&day).cloned().unwrap_or_default()
    }

    pub fn get_daily_claim(&self, day: u32, account_id: AccountId) -> DailyClaimView {
        let state = self.days.get(&day).cloned().unwrap_or_default();
        let played = self.played.contains(&(day, account_id.clone()));
        let claimed = self.daily_claimed.contains(&(day, account_id));
        let claimable = if played && !claimed && state.closed && state.target_met {
            state.share
        } else {
            U128(0)
        };
        DailyClaimView {
            played,
            claimed,
            claimable,
        }
    }

    pub fn get_holder(&self, account_id: AccountId) -> HolderView {
        let stored = self.token.accounts.get(&account_id);
        match (stored, self.holders.get(&account_id)) {
            (Some(balance), Some(holder)) => {
                let (pending, _) = blind_owed(
                    balance,
                    holder.last_play,
                    holder.blind_through,
                    now_seconds(),
                    self.config.blind_rule(),
                );
                HolderView {
                    registered: true,
                    balance: U128(balance - pending),
                    stored_balance: U128(balance),
                    pending_blind: U128(pending),
                    last_play: holder.last_play,
                    blind_through: holder.blind_through,
                    starter_claimed: holder.starter_claimed,
                }
            }
            _ => HolderView {
                registered: false,
                balance: U128(0),
                stored_balance: U128(0),
                pending_blind: U128(0),
                last_play: 0,
                blind_through: 0,
                starter_claimed: false,
            },
        }
    }

    /// The commitment to submit for a pick. A convenience: compute it off chain in production
    /// so the pick never leaves the player's device before the reveal.
    pub fn compute_commitment(&self, player: AccountId, market: String, salt: String) -> String {
        pick_commitment(&player, &market, &salt)
    }
}

// ---------------------------------------------------------------- internals

impl Contract {
    fn total_supply(&self) -> u128 {
        self.token.total_supply + self.treasury + self.escrow
    }

    fn assert_settler(&self) {
        require!(
            env::predecessor_account_id() == self.config.settler,
            "Only the settler can report prices"
        );
    }

    fn table(&self, id: u64) -> Table {
        self.tables
            .get(&id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Table not found"))
    }

    fn is_registered(&self, account_id: &AccountId) -> bool {
        self.token.accounts.contains_key(account_id)
    }

    fn holder(&self, account_id: &AccountId) -> Holder {
        self.holders
            .get(account_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("Account is not registered"))
    }

    fn register(&mut self, account_id: &AccountId) {
        self.token.internal_register_account(account_id);
        let now = now_seconds();
        self.holders.insert(
            account_id.clone(),
            Holder {
                last_play: now,
                blind_through: now,
                starter_claimed: false,
            },
        );
    }

    fn measure_holder_storage(&mut self) {
        let before = env::storage_usage();
        let probe: AccountId = "a".repeat(64).parse().unwrap();
        self.token.accounts.insert(&probe, &0u128);
        self.holders.insert(probe.clone(), Holder::default());
        self.holders.flush();
        self.holder_storage_usage = env::storage_usage() - before;
        self.token.accounts.remove(&probe);
        self.holders.remove(&probe);
        self.holders.flush();
    }

    /// Moves the blind a holder owes into the treasury. Returns the amount moved.
    fn collect_blind(&mut self, account_id: &AccountId) -> u128 {
        let Some(balance) = self.token.accounts.get(account_id) else {
            return 0;
        };
        let Some(mut holder) = self.holders.get(account_id).cloned() else {
            return 0;
        };
        let (owed, through) = blind_owed(
            balance,
            holder.last_play,
            holder.blind_through,
            now_seconds(),
            self.config.blind_rule(),
        );
        if through != holder.blind_through {
            holder.blind_through = through;
            self.holders.insert(account_id.clone(), holder);
        }
        if owed > 0 {
            self.token.internal_withdraw(account_id, owed);
            self.treasury += owed;
            self.blinds_collected += owed;
            let contract_id = env::current_account_id();
            FtTransfer {
                old_owner_id: account_id,
                new_owner_id: &contract_id,
                amount: U128(owed),
                memo: Some("blind"),
            }
            .emit();
        }
        owed
    }

    fn seat(&mut self, table: &mut Table, player: AccountId, commitment: String) {
        assert_commitment_shape(&commitment);
        require!(
            player != env::current_account_id(),
            "The contract cannot play"
        );
        require!(
            table.players.iter().all(|seat| seat.player != player),
            "Already seated at this table"
        );
        require!(
            table.players.len() < usize::from(table.seats),
            "Table is full"
        );
        require!(self.is_registered(&player), "Account is not registered");
        self.collect_blind(&player);
        let stake = table.stake.0;
        let balance = self.token.accounts.get(&player).unwrap_or(0);
        require!(balance >= stake, "Not enough CHIP for this stake");
        self.token.internal_withdraw(&player, stake);
        self.escrow += stake;
        let now = now_seconds();
        let mut holder = self.holder(&player);
        holder.last_play = now;
        holder.blind_through = now;
        self.holders.insert(player.clone(), holder);
        table.pot = U128(table.pot.0 + stake);
        table.players.push(Seat {
            player: player.clone(),
            commitment,
            market: None,
            start_price: None,
            end_price: None,
            score_bps: None,
            award: U128(0),
        });
        let contract_id = env::current_account_id();
        let memo = format!("stake:table:{}", table.id.0);
        FtTransfer {
            old_owner_id: &player,
            new_owner_id: &contract_id,
            amount: U128(stake),
            memo: Some(&memo),
        }
        .emit();
        emit_kova(
            "seat_taken",
            json!({
                "table_id": table.id,
                "player": player,
                "seat": table.players.len(),
                "seats": table.seats,
            }),
        );
        if table.players.len() == usize::from(table.seats) {
            Self::lock(table);
        }
    }

    fn lock(table: &mut Table) {
        let now = now_seconds();
        table.status = TableStatus::Locked;
        table.locked_at = now;
        table.start_deadline = now + START_WINDOW_SECONDS;
        emit_kova(
            "table_locked",
            json!({
                "table_id": table.id,
                "players": table.players.len(),
                "start_deadline": table.start_deadline,
            }),
        );
    }
}

// ---------------------------------------------------------------- NEP-141 with blinds

#[near]
impl FungibleTokenCore for Contract {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        require!(
            receiver_id != env::current_account_id(),
            "CHIP cannot be sent to the contract"
        );
        self.collect_blind(&sender_id);
        self.collect_blind(&receiver_id);
        self.token
            .internal_transfer(&sender_id, &receiver_id, amount.0, memo);
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            receiver_id != env::current_account_id(),
            "CHIP cannot be sent to the contract"
        );
        let sender_id = env::predecessor_account_id();
        self.collect_blind(&sender_id);
        self.collect_blind(&receiver_id);
        self.token
            .ft_transfer_call(receiver_id, amount, memo, msg)
    }

    /// Balances plus treasury plus stakes at tables.
    fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply())
    }

    /// For holders, the balance after any blind owed now. For the contract account, the
    /// treasury plus the stakes at tables, which only the rules can move.
    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        if account_id == env::current_account_id() {
            return U128(self.treasury + self.escrow);
        }
        self.get_holder(account_id).balance
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
        let (used, _burned) = self
            .token
            .internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        U128(used)
    }
}

#[near]
impl StorageManagement for Contract {
    /// NEP-145 registration. Registering is also free through `claim_starter`.
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        // Registration is all a deposit buys here, so the flag changes nothing.
        let _ = registration_only;
        let amount = env::attached_deposit();
        let account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        require!(
            account_id != env::current_account_id(),
            "The contract cannot be registered"
        );
        let min = self.storage_balance_bounds().min;
        if self.is_registered(&account_id) {
            if !amount.is_zero() {
                Promise::new(env::predecessor_account_id())
                    .transfer(amount)
                    .detach();
            }
        } else {
            require!(
                amount >= min,
                "The attached deposit is less than the minimum storage balance"
            );
            self.register(&account_id);
            let refund = amount.saturating_sub(min);
            if !refund.is_zero() {
                Promise::new(env::predecessor_account_id())
                    .transfer(refund)
                    .detach();
            }
        }
        StorageBalance {
            total: min,
            available: NearToken::from_near(0),
        }
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        assert_one_yocto();
        let account_id = env::predecessor_account_id();
        require!(self.is_registered(&account_id), "Account is not registered");
        if let Some(amount) = amount {
            require!(
                amount.is_zero(),
                "The amount is greater than the available storage balance"
            );
        }
        StorageBalance {
            total: self.storage_balance_bounds().min,
            available: NearToken::from_near(0),
        }
    }

    /// Not supported: a CHIP account keeps its game history, so it stays registered.
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let _ = force;
        assert_one_yocto();
        env::panic_str("CHIP accounts stay registered")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        let min = env::storage_byte_cost().saturating_mul(u128::from(self.holder_storage_usage));
        StorageBalanceBounds {
            min,
            max: Some(min),
        }
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.is_registered(&account_id) {
            Some(StorageBalance {
                total: self.storage_balance_bounds().min,
                available: NearToken::from_near(0),
            })
        } else {
            None
        }
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

//! The Kova factory: opens one mine per coin.
//!
//! A mine is a new account under the factory (`<name>.<factory>`) that runs one fixed contract,
//! published once as a global contract and referenced here **by code hash**. A hash reference is
//! immutable: nobody, including whoever published the code, can change what any mine runs. The
//! account is created with no access key, and the contract is attached and initialised in the
//! same transaction, so there is no moment when anyone holds a key or can initialise it first.
//!
//! The factory accepts three kinds of coin, all fixed at deploy:
//! - CHIP and any other coin on the fixed list (BRRRAIN on mainnet),
//! - any coin whose account is a direct child of a listed suffix (`.meme-cooking.near`). Only
//!   meme.cooking can create those accounts, so a fake coin cannot get a mine.
//!
//! Anyone can open a mine for an accepted coin by attaching enough NEAR to fund it. There is no
//! owner, no setter and no upgrade.

use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::serde_json::json;
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, near, require,
};

/// NEAR sent to a new mine: its storage, and what it needs to pay 1 yocto per token transfer.
pub const MINE_DEPOSIT: NearToken = NearToken::from_millinear(200);
const GAS_INIT: Gas = Gas::from_tgas(30);
const GAS_CALLBACK: Gas = Gas::from_tgas(30);
const SECONDS_PER_DAY: u64 = 86_400;
/// The whole account id may be at most 64 characters.
const MAX_ACCOUNT_LEN: usize = 64;

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Mines,
}

/// Rules fixed at deploy. There is no method that changes them.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct Config {
    /// The hash of the mine contract, published as a global contract.
    pub mine_code_hash: Base58CryptoHash,
    /// CHIP: told about every round by every mine.
    pub chip: AccountId,
    /// Coins accepted by name.
    pub allowed_tokens: Vec<AccountId>,
    /// Coins accepted because they are a direct child of one of these (each starts with a dot).
    pub allowed_suffixes: Vec<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct MineInfo {
    pub token: AccountId,
    pub mine: AccountId,
    pub opener: AccountId,
    pub opened_at: u64,
    pub min_stake: U128,
    pub max_stake: U128,
    pub vein_per_round: U128,
    pub vein_halving_seconds: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    config: Config,
    mines: IterableMap<AccountId, MineInfo>,
}

/// True if the factory accepts a mine for this coin.
pub fn token_allowed(token: &AccountId, config: &Config) -> bool {
    if config.allowed_tokens.contains(token) {
        return true;
    }
    config.allowed_suffixes.iter().any(|suffix| {
        token
            .as_str()
            .strip_suffix(suffix.as_str())
            .is_some_and(|label| !label.is_empty() && !label.contains('.'))
    })
}

/// The name of a coin's mine under `factory`: the coin's account with dots turned into dashes
/// (`jambo.meme-cooking.near` becomes `jambo-meme-cooking-near.<factory>`). If that would make
/// the account id too long, the first 32 hex digits of the coin's sha256 are used instead.
pub fn mine_account(token: &AccountId, factory: &AccountId) -> AccountId {
    let readable = token.as_str().replace('.', "-");
    let fits = readable.len() + 1 + factory.as_str().len() <= MAX_ACCOUNT_LEN;
    let label = if fits {
        readable
    } else {
        let digest = env::sha256_array(token.as_str().as_bytes());
        digest[..16].iter().map(|byte| format!("{byte:02x}")).collect()
    };
    format!("{label}.{factory}")
        .parse()
        .unwrap_or_else(|_| env::panic_str("That coin's mine would not be a valid account"))
}

#[near]
impl Factory {
    /// Deploy-time setup. Callable once, by the factory account itself.
    #[init]
    #[private]
    pub fn new(
        mine_code_hash: Base58CryptoHash,
        chip: AccountId,
        allowed_tokens: Vec<AccountId>,
        allowed_suffixes: Vec<String>,
    ) -> Self {
        require!(
            allowed_tokens.contains(&chip),
            "CHIP must be one of the accepted coins"
        );
        require!(
            allowed_suffixes
                .iter()
                .all(|suffix| suffix.len() > 3 && suffix.starts_with('.')),
            "Every suffix starts with a dot"
        );
        Self {
            config: Config {
                mine_code_hash,
                chip,
                allowed_tokens,
                allowed_suffixes,
            },
            mines: IterableMap::new(StorageKey::Mines),
        }
    }

    /// Opens a mine for a coin. Anyone can call it for an accepted coin. Attach at least
    /// `get_required_deposit` (0.2 NEAR): all of it goes to the mine, and it is returned to the
    /// caller if the mine cannot be created.
    ///
    /// `min_stake` is per stake and `max_stake` per player per round, both in the coin's
    /// smallest unit. `vein_per_round` (0 for no vein) is released to each round's winners from
    /// coins sent to the mine with the message `"vein"`, and halves every `vein_halving_days`.
    #[payable]
    pub fn open_mine(
        &mut self,
        token: AccountId,
        min_stake: U128,
        max_stake: U128,
        vein_per_round: U128,
        vein_halving_days: u32,
    ) -> Promise {
        let deposit = env::attached_deposit();
        require!(
            deposit >= MINE_DEPOSIT,
            format!("Attach at least {MINE_DEPOSIT} to fund the mine")
        );
        require!(
            token_allowed(&token, &self.config),
            "That coin cannot have a mine here"
        );
        require!(
            !self.mines.contains_key(&token),
            "That coin already has a mine"
        );
        require!(min_stake.0 > 0, "The minimum stake must be positive");
        require!(
            max_stake.0 >= min_stake.0,
            "The maximum stake is below the minimum"
        );
        require!(
            vein_per_round.0 == 0 || vein_halving_days > 0,
            "A vein needs a halving period in days"
        );
        let factory = env::current_account_id();
        let mine = mine_account(&token, &factory);
        let opener = env::predecessor_account_id();
        let vein_halving_seconds = u64::from(vein_halving_days) * SECONDS_PER_DAY;
        let args = json!({
            "token": token,
            "chip": self.config.chip,
            "min_stake": min_stake,
            "max_stake": max_stake,
            "vein_per_round": vein_per_round,
            "vein_halving_seconds": vein_halving_seconds,
        });
        self.mines.insert(
            token.clone(),
            MineInfo {
                token: token.clone(),
                mine: mine.clone(),
                opener: opener.clone(),
                opened_at: env::block_timestamp() / 1_000_000_000,
                min_stake,
                max_stake,
                vein_per_round,
                vein_halving_seconds,
            },
        );
        // One atomic batch: create the account, fund it, point it at the immutable code by hash
        // and initialise it. No access key is added, so the account is keyless from birth.
        Promise::new(mine.clone())
            .create_account()
            .transfer(deposit)
            .use_global_contract(self.config.mine_code_hash)
            .function_call(
                "new",
                args.to_string().into_bytes(),
                NearToken::from_near(0),
                GAS_INIT,
            )
            .then(
                Self::ext(factory)
                    .with_static_gas(GAS_CALLBACK)
                    .on_mine_opened(token, mine, opener, deposit),
            )
    }

    #[private]
    pub fn on_mine_opened(
        &mut self,
        token: AccountId,
        mine: AccountId,
        opener: AccountId,
        deposit: NearToken,
    ) -> bool {
        if env::promise_result_checked(0, 0).is_ok() {
            env::log_str(&format!(
                "EVENT_JSON:{}",
                json!({
                    "standard": "kova_factory",
                    "version": "1.0.0",
                    "event": "mine_opened",
                    "data": [{ "token": token, "mine": mine, "opener": opener }],
                })
            ));
            return true;
        }
        // Nothing was created (the whole batch is atomic): forget the coin and send the NEAR back.
        self.mines.remove(&token);
        Promise::new(opener).transfer(deposit).detach();
        false
    }

    // ---------------------------------------------------------------- views

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_required_deposit(&self) -> NearToken {
        MINE_DEPOSIT
    }

    pub fn is_token_allowed(&self, token: AccountId) -> bool {
        token_allowed(&token, &self.config)
    }

    /// The account a coin's mine has or would have.
    pub fn get_mine_account(&self, token: AccountId) -> AccountId {
        mine_account(&token, &env::current_account_id())
    }

    pub fn get_mine(&self, token: AccountId) -> Option<MineInfo> {
        self.mines.get(&token).cloned()
    }

    pub fn get_mines_count(&self) -> u32 {
        self.mines.len()
    }

    pub fn get_mines(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MineInfo> {
        self.mines
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .cloned()
            .collect()
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests;

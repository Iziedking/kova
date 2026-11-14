//! End to end on a local NEAR sandbox, with real transactions and real cross-contract calls:
//!
//! 1. The mine is published as a global contract by hash, the factory and CHIP are deployed.
//! 2. The factory opens two mines (CHIP, and a coin under `.meme-cooking.sandbox`) and refuses a
//!    coin it should not accept.
//! 3. Three players play `KOVA_SANDBOX_ROUNDS` rounds (default 10) in both mines, settled by a
//!    fourth account, and every unit of every coin is accounted for.
//!
//! Rounds are real UTC minutes, so the default run takes about eleven minutes.
//! `KOVA_SANDBOX_ROUNDS=3 cargo test --release --test sandbox -- --nocapture` is a shorter run.

use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sdk::serde_json::{Value, json};
use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

const ONE: u128 = 1_000_000_000_000_000_000;
const ROUND: u64 = 60;
const ROUNDS_PER_DAY: u64 = 1_440;

const MINE_METHODS: &[&str] = &[
    "claim",
    "contract_source_metadata",
    "ft_on_transfer",
    "get_claimable",
    "get_config",
    "get_current_round",
    "get_recent",
    "get_round",
    "get_stats",
    "get_vein_release",
    "new",
    "on_burn",
    "on_burn_by_transfer",
    "on_claim",
    "on_payouts",
    "refund_round",
    "rounds_per_day",
    "settle",
];
const FACTORY_METHODS: &[&str] = &[
    "contract_source_metadata",
    "get_config",
    "get_mine",
    "get_mine_account",
    "get_mines",
    "get_mines_count",
    "get_required_deposit",
    "is_token_allowed",
    "new",
    "on_mine_opened",
    "open_mine",
];
const CHIP_METHODS: &[&str] = &[
    "claim_starter",
    "contract_source_metadata",
    "ft_balance_of",
    "ft_burn",
    "ft_metadata",
    "ft_resolve_transfer",
    "ft_total_supply",
    "ft_transfer",
    "ft_transfer_call",
    "get_config",
    "get_minute",
    "get_stats",
    "has_claimed_starter",
    "is_mine_account",
    "mine_deploy",
    "new",
    "note_player",
    "report_round",
    "storage_balance_bounds",
    "storage_balance_of",
    "storage_deposit",
    "storage_unregister",
    "storage_withdraw",
];

struct World {
    sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
}

impl World {
    async fn account(&self, name: &str, near: u128) -> AccountId {
        let id: AccountId = name.parse().unwrap();
        self.sandbox
            .create_account(id.as_str().parse().unwrap())
            .initial_balance(NearToken::from_near(near))
            .send()
            .await
            .unwrap_or_else(|e| panic!("create {name}: {e:?}"));
        id
    }

    async fn send(
        &self,
        contract: &AccountId,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> near_api::types::transaction::result::TransactionResult {
        near_api::Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(300))
            .deposit(deposit)
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .expect("transaction was sent")
    }

    /// A call that must succeed. Returns its logs.
    async fn ok(&self, contract: &AccountId, who: &AccountId, method: &str, args: Value) -> Vec<String> {
        self.ok_with(contract, who, method, args, NearToken::from_near(0)).await
    }

    async fn ok_with(
        &self,
        contract: &AccountId,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> Vec<String> {
        let result = self.send(contract, who, method, args, deposit).await;
        let logs = result.logs().iter().map(|l| l.to_string()).collect();
        assert!(result.is_success(), "{method} on {contract} by {who} failed: {result:?}");
        logs
    }

    /// A call that must fail with `reason` somewhere in the outcome.
    async fn refused(
        &self,
        contract: &AccountId,
        who: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
        reason: &str,
    ) {
        let result = self.send(contract, who, method, args, deposit).await;
        assert!(result.is_failure(), "{method} on {contract} by {who} should fail");
        let text = format!("{result:?}");
        assert!(text.contains(reason), "{method}: expected {reason:?} in {text}");
    }

    async fn view(&self, contract: &AccountId, method: &str, args: Value) -> Value {
        near_api::Contract(contract.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.net)
            .await
            .unwrap_or_else(|e| panic!("view {method} on {contract}: {e:?}"))
            .data
    }

    async fn n(&self, contract: &AccountId, method: &str, args: Value, field: Option<&str>) -> u128 {
        let v = self.view(contract, method, args).await;
        let v = match field {
            Some(f) => v[f].clone(),
            None => v,
        };
        v.as_str().unwrap_or_else(|| panic!("{method}.{field:?} is not a string: {v}")).parse().unwrap()
    }

    async fn balance(&self, coin: &AccountId, who: &AccountId) -> u128 {
        self.n(coin, "ft_balance_of", json!({ "account_id": who }), None).await
    }

    /// The timestamp of the latest block, in seconds.
    async fn now(&self) -> u64 {
        let block = near_api::Chain::block().fetch_from(&self.net).await.expect("block");
        block.header.timestamp / 1_000_000_000
    }

    /// Waits until a block at or after the start of the next round and returns that round.
    async fn next_round(&self) -> u64 {
        loop {
            let now = self.now().await;
            let mut round = now / ROUND + 1;
            // Nobody can stake in the last minute of the UTC day; skip it.
            if round % ROUNDS_PER_DAY == ROUNDS_PER_DAY - 1 {
                round += 1;
            }
            let start = round * ROUND;
            while self.now().await < start {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            return round;
        }
    }
}

/// Runs futures at the same time and returns their outputs in order.
async fn futures_join<F: std::future::Future>(futures: impl IntoIterator<Item = F>) -> Vec<F::Output> {
    // Polled together on this task, so the futures may borrow from the test.
    let mut pinned: Vec<std::pin::Pin<Box<F>>> = futures.into_iter().map(Box::pin).collect();
    let mut done: Vec<Option<F::Output>> = (0..pinned.len()).map(|_| None).collect();
    std::future::poll_fn(|cx| {
        let mut all = true;
        for (i, f) in pinned.iter_mut().enumerate() {
            if done[i].is_none() {
                match f.as_mut().poll(cx) {
                    std::task::Poll::Ready(v) => done[i] = Some(v),
                    std::task::Poll::Pending => all = false,
                }
            }
        }
        if all { std::task::Poll::Ready(()) } else { std::task::Poll::Pending }
    })
    .await;
    done.into_iter().map(|v| v.unwrap()).collect()
}

/// `EVENT_JSON` payloads in a list of logs.
fn events(logs: &[String]) -> Vec<Value> {
    logs.iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|l| near_sdk::serde_json::from_str::<Value>(l).ok())
        .collect()
}

fn amount(v: &Value) -> u128 {
    v.as_str().unwrap().parse().unwrap()
}

async fn build(manifest: &str) -> (Vec<u8>, Vec<String>) {
    let opts = cargo_near_build::BuildOpts::builder()
        .manifest_path(format!("{}/{manifest}", env!("CARGO_MANIFEST_DIR")))
        .build();
    let wasm_path = cargo_near_build::build_with_cli(opts).expect("contract builds");
    let abi_path = wasm_path.as_str().replace(".wasm", "_abi.json");
    let abi: Value = near_sdk::serde_json::from_slice(&std::fs::read(&abi_path).expect("abi")).unwrap();
    let mut methods: Vec<String> = abi["body"]["functions"]
        .as_array()
        .expect("abi functions")
        .iter()
        .map(|f| f["name"].as_str().unwrap().to_string())
        .collect();
    methods.push("contract_source_metadata".to_string());
    methods.sort();
    methods.dedup();
    (std::fs::read(&wasm_path).expect("wasm"), methods)
}

fn assert_no_admin(name: &str, methods: &[String], expected: &[&str]) {
    assert_eq!(methods, expected, "{name}: the interface changed; no method may change a rule");
    for method in methods {
        assert!(
            !method.starts_with("set_")
                && !method.contains("owner")
                && !method.contains("admin")
                && !method.contains("pause")
                && !method.contains("upgrade")
                && !method.contains("migrate")
                && !method.contains("update"),
            "{name}: admin-style method {method}"
        );
    }
}

fn chip_config(factory: &AccountId) -> Value {
    json!({
        "factory": factory,
        "cap": (21_000_000 * ONE).to_string(),
        "starter_amount": (1_000 * ONE).to_string(),
        "starter_budget": (100_000 * ONE).to_string(),
        "emission_per_minute": (10 * ONE).to_string(),
        "halving_seconds": 30 * 86_400,
        "motherlode_per_round": (2 * ONE).to_string(),
        "motherlode_odds": 625,
        "motherlode_cap": (5_000 * ONE).to_string(),
    })
}

fn metadata(name: &str, symbol: &str) -> Value {
    json!({ "spec": "ft-1.0.0", "name": name, "symbol": symbol, "decimals": 18 })
}

/// A cheap deterministic stream, so a run is reproducible.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
}

struct Coin {
    name: &'static str,
    token: AccountId,
    mine: AccountId,
    /// Every settle's logged outcome.
    settled: u32,
    refunded: u32,
    staked: u128,
    burned_in_events: u128,
}

#[tokio::test]
async fn the_factory_opens_two_mines_and_three_players_mine_with_every_unit_accounted_for()
-> testresult::TestResult<()> {
    let rounds: u64 = std::env::var("KOVA_SANDBOX_ROUNDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    // ---- build the three contracts and check what each one exposes
    let (mine_wasm, mine_methods) = build("../mine/Cargo.toml").await;
    let (factory_wasm, factory_methods) = build("Cargo.toml").await;
    let (chip_wasm, chip_methods) = build("../chip-v3/Cargo.toml").await;
    assert_no_admin("mine", &mine_methods, MINE_METHODS);
    assert_no_admin("factory", &factory_methods, FACTORY_METHODS);
    assert_no_admin("chip", &chip_methods, CHIP_METHODS);

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
    )?;
    let w = World { sandbox, net, signer };

    let publisher = w.account("publisher.sandbox", 200).await;
    let factory = w.account("factory.sandbox", 100).await;
    let chip = w.account("chip.sandbox", 100).await;
    let _launchpad = w.account("meme-cooking.sandbox", 10).await;
    let jambo = w.account("jambo.meme-cooking.sandbox", 100).await;
    let fake = w.account("fake.sandbox", 10).await;
    let keeper = w.account("keeper.sandbox", 100).await;
    let players = [
        w.account("alice.sandbox", 50).await,
        w.account("bob.sandbox", 50).await,
        w.account("carol.sandbox", 50).await,
    ];

    // ---- publish the mine as a global contract by hash, deploy factory, CHIP and the second coin
    let mine_hash = near_api::CryptoHash::hash(&mine_wasm);
    near_api::Contract::deploy_global_contract_code(mine_wasm.clone())
        .as_hash()
        .with_signer(publisher.clone(), w.signer.clone())
        .send_to(&w.net)
        .await?
        .assert_success();

    let factory_init = json!({
        "mine_code_hash": mine_hash.to_string(),
        "chip": chip,
        "allowed_tokens": [chip],
        "allowed_suffixes": [".meme-cooking.sandbox"],
    });
    near_api::Contract::deploy(factory.clone())
        .use_code(factory_wasm)
        .with_init_call("new", factory_init.clone())?
        .with_signer(w.signer.clone())
        .send_to(&w.net)
        .await?
        .assert_success();
    near_api::Contract::deploy(chip.clone())
        .use_code(chip_wasm.clone())
        .with_init_call("new", json!({ "metadata": metadata("Kova Chip", "CHIP"), "config": chip_config(&factory) }))?
        .with_signer(w.signer.clone())
        .send_to(&w.net)
        .await?
        .assert_success();
    // The second coin is the same token code, standing in for a meme.cooking launch.
    near_api::Contract::deploy(jambo.clone())
        .use_code(chip_wasm)
        .with_init_call("new", json!({ "metadata": metadata("Jambo", "JAMBO"), "config": chip_config(&factory) }))?
        .with_signer(w.signer.clone())
        .send_to(&w.net)
        .await?
        .assert_success();

    // ---- nobody can set the factory or the coins up a second time
    w.refused(&factory, &players[0], "new", factory_init, NearToken::from_near(0), "is private").await;
    w.refused(
        &chip,
        &players[0],
        "new",
        json!({ "metadata": metadata("X", "X"), "config": chip_config(&factory) }),
        NearToken::from_near(0),
        "is private",
    )
    .await;

    // ---- the factory refuses what it should refuse
    let one_chip = (1 * ONE).to_string();
    let open_args = |token: &AccountId| {
        json!({
            "token": token,
            "min_stake": one_chip,
            "max_stake": (500 * ONE).to_string(),
            "vein_per_round": "0",
            "vein_halving_days": 0,
        })
    };
    w.refused(&factory, &players[0], "open_mine", open_args(&fake), NearToken::from_millinear(200), "cannot have a mine").await;
    w.refused(&factory, &players[0], "open_mine", open_args(&chip), NearToken::from_millinear(10), "Attach at least").await;
    assert!(w.view(&factory, "is_token_allowed", json!({ "token": jambo })).await.as_bool().unwrap());
    assert!(!w.view(&factory, "is_token_allowed", json!({ "token": fake })).await.as_bool().unwrap());

    // ---- it opens two mines
    let mut coins = Vec::new();
    for (name, token, opener) in [("CHIP", &chip, &players[0]), ("JAMBO", &jambo, &players[1])] {
        let logs = w
            .ok_with(&factory, opener, "open_mine", open_args(token), NearToken::from_millinear(200))
            .await;
        assert!(events(&logs).iter().any(|e| e["event"] == "mine_opened"), "{name}: {logs:?}");
        let mine: AccountId = w.view(&factory, "get_mine_account", json!({ "token": token })).await.as_str().unwrap().parse()?;
        coins.push(Coin { name, token: token.clone(), mine, settled: 0, refunded: 0, staked: 0, burned_in_events: 0 });
    }
    assert_eq!(w.view(&factory, "get_mines_count", json!({})).await, json!(2));
    w.refused(&factory, &players[2], "open_mine", open_args(&chip), NearToken::from_millinear(200), "already has a mine").await;

    // ---- each mine is a keyless account on the published code, and nobody can re-initialise it
    for coin in &coins {
        let keys = near_api::Account(coin.mine.clone()).list_keys().fetch_from(&w.net).await?;
        assert_eq!(keys.data.len(), 0, "{} has no access key", coin.mine);
        let account = near_api::Account(coin.mine.clone()).view().fetch_from(&w.net).await?;
        assert_eq!(
            format!("{:?}", account.data.contract_state),
            format!("{:?}", near_api::types::account::ContractState::GlobalHash(mine_hash)),
            "{} runs the published code by hash",
            coin.mine
        );
        let config = w.view(&coin.mine, "get_config", json!({})).await;
        assert_eq!(config["token"], json!(coin.token));
        assert_eq!(config["chip"], json!(chip));
        assert_eq!(config["factory"], json!(factory));
        w.refused(
            &coin.mine,
            &players[0],
            "new",
            json!({ "token": coin.token, "chip": chip, "min_stake": "1", "max_stake": "2", "vein_per_round": "0", "vein_halving_seconds": 0 }),
            NearToken::from_near(0),
            "already been initialized",
        )
        .await;
    }

    // ---- starter chips: each player claims CHIP and JAMBO, once
    for p in &players {
        for token in [&chip, &jambo] {
            w.ok(token, p, "claim_starter", json!({})).await;
        }
        assert_eq!(w.balance(&chip, p).await, 1_000 * ONE);
    }
    w.refused(&chip, &players[0], "claim_starter", json!({}), NearToken::from_near(0), "already claimed").await;

    // ---- play
    let mut rng = Rng(0x2026_1114_0001);
    let mut pending: Option<u64> = None;
    let mut emission_events = 0u32;
    for k in 0..=rounds {
        let round = w.next_round().await;
        println!("-- boundary {k}: round {round}");

        // Settle the round that just ended, in both mines.
        if let Some(previous) = pending.take() {
            for coin in &mut coins {
                let logs = w
                    .ok(&coin.mine, &keeper, "settle", json!({ "round": previous.to_string() }))
                    .await;
                let evs = events(&logs);
                if let Some(e) = evs.iter().find(|e| e["event"] == "round_settled") {
                    let d = &e["data"][0];
                    let total = amount(&d["total"]);
                    let burned = amount(&d["burned"]);
                    let vein = amount(&d["vein"]);
                    let awards: u128 = d["winners"].as_array().unwrap().iter().map(|x| amount(&x["award"])).sum();
                    let staked_on_winner: u128 = d["winners"].as_array().unwrap().iter().map(|x| amount(&x["staked"])).sum();
                    let losing = total - staked_on_winner;
                    assert_eq!(awards + burned, total + vein, "{}: round {previous} pays out exactly what was staked", coin.name);
                    assert_eq!(burned, losing * 10 / 100, "{}: round {previous} burns 10% of the losing stakes", coin.name);
                    coin.settled += 1;
                    coin.burned_in_events += burned;
                    println!("   {} round {previous}: square {} total {} burned {}", coin.name, d["winning_square"], total / ONE, burned as f64 / ONE as f64);
                } else if evs.iter().any(|e| e["event"] == "round_refunded") {
                    coin.refunded += 1;
                    println!("   {} round {previous}: empty square, refunded", coin.name);
                } else {
                    panic!("{}: settle logged neither a settle nor a refund: {logs:?}", coin.name);
                }
            }
        }

        if k == rounds {
            break;
        }
        // Stake in this round. Every player puts a random amount on four different squares in
        // each mine, so most rounds have a winner. Players run in parallel (each has its own
        // nonce); one player's own transactions run in order. In the CHIP mine, Alice and Carol
        // use CHIP's no-deposit `mine_deploy`; everything else is `ft_transfer_call`, which is
        // what any wallet sends.
        let mut plans: Vec<Vec<(usize, u64, u128)>> = vec![Vec::new(); players.len()];
        for plan in plans.iter_mut() {
            for coin_index in 0..coins.len() {
                let mut squares = Vec::new();
                while squares.len() < 4 {
                    let square = rng.next() % 25;
                    if !squares.contains(&square) {
                        squares.push(square);
                    }
                }
                for square in squares {
                    plan.push((coin_index, square, (10 + rng.next() % 20) as u128 * ONE));
                }
            }
        }
        let results = futures_join(
            players
                .iter()
                .enumerate()
                .zip(plans)
                .map(|((index, player), plan)| {
                    let (w, coins) = (&w, &coins);
                    async move {
                        let mut out = Vec::new();
                        for (coin_index, square, stake) in plan {
                            let coin = &coins[coin_index];
                            let used_deploy = coin.name == "CHIP" && index != 1;
                            let logs = if used_deploy {
                                w.ok(&coin.token, player, "mine_deploy", json!({
                                    "mine": coin.mine, "square": square, "amount": stake.to_string(), "round": round.to_string()
                                })).await
                            } else {
                                w.ok_with(&coin.token, player, "ft_transfer_call", json!({
                                    "receiver_id": coin.mine, "amount": stake.to_string(),
                                    "msg": json!({ "square": square, "round": round }).to_string()
                                }), NearToken::from_yoctonear(1)).await
                            };
                            let evs = events(&logs);
                            let staked = evs.iter().any(|e| e["event"] == "staked");
                            if !staked {
                                // Only a transaction that spilled into the next minute may be refused.
                                let refusal = evs.iter().find(|e| e["event"] == "refused");
                                assert!(refusal.is_some(), "{} {player}: neither staked nor refused: {logs:?}", coin.name);
                                println!("   {} {player}: refused ({})", coin.name, refusal.unwrap()["data"][0]["reason"]);
                            }
                            out.push((coin_index, stake, staked));
                        }
                        out
                    }
                }),
        )
        .await;
        for (coin_index, stake, staked) in results.into_iter().flatten() {
            if staked {
                coins[coin_index].staked += stake;
            }
        }
        pending = Some(round);
        emission_events += 1;
    }

    // ---- let the last payouts and burns land, then reconcile every unit
    let mut totals: BTreeMap<&str, u128> = BTreeMap::new();
    for coin in &coins {
        let mut stats = Value::Null;
        for _ in 0..40 {
            stats = w.view(&coin.mine, "get_stats", json!({})).await;
            let f = |k: &str| amount(&stats[k]);
            let accounted = f("held") + f("paid_total") + f("claimable_total") + f("burned_by_burn")
                + f("burned_by_transfer") + f("pending_burn");
            if f("staked_total") == accounted {
                break;
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
        let f = |k: &str| amount(&stats[k]);
        println!("{} mine stats: {stats}", coin.name);
        assert_eq!(f("held"), 0, "{}: every round was settled", coin.name);
        assert_eq!(f("staked_total"), coin.staked, "{}: the mine saw exactly the stakes that were accepted", coin.name);
        assert_eq!(
            f("staked_total"),
            f("paid_total") + f("claimable_total") + f("burned_by_burn") + f("burned_by_transfer") + f("pending_burn"),
            "{}: every coin staked was paid to a player or burned",
            coin.name
        );
        assert_eq!(f("burned_by_burn"), coin.burned_in_events, "{}: ft_burn burned what the rounds said", coin.name);
        assert_eq!(stats["rounds_settled"].as_u64().unwrap() as u32, coin.settled);
        assert_eq!(stats["rounds_refunded"].as_u64().unwrap() as u32, coin.refunded);
        // What the mine holds of the coin is only what is owed to players.
        assert_eq!(
            w.balance(&coin.token, &coin.mine).await,
            f("claimable_total") + f("vein") + f("pending_burn"),
            "{}: the mine's balance is exactly what it owes",
            coin.name
        );
        totals.insert(coin.name, f("burned_by_burn"));
    }
    // JAMBO: nothing but the starter claims ever minted it, so its supply is those less the burn.
    let jambo_supply = w.n(&jambo, "ft_total_supply", json!({}), None).await;
    assert_eq!(jambo_supply, 3 * 1_000 * ONE - totals["JAMBO"]);
    // CHIP: starter claims plus whatever mining minted, less the burn, and it is all in the five
    // places CHIP can be.
    let stats = w.view(&chip, "get_stats", json!({})).await;
    let chip_supply = amount(&stats["total_supply"]);
    assert_eq!(chip_supply, amount(&stats["total_minted"]) - amount(&stats["total_burned"]));
    assert_eq!(amount(&stats["total_burned"]), totals["CHIP"]);
    assert_eq!(amount(&stats["starter_minted"]), 3_000 * ONE);
    assert_eq!(
        amount(&stats["total_minted"]),
        amount(&stats["starter_minted"]) + amount(&stats["emission_minted"]) + amount(&stats["motherlode_minted"])
    );
    let mut held = w.balance(&chip, &coins[0].mine).await;
    for p in &players {
        held += w.balance(&chip, p).await;
    }
    assert_eq!(held, chip_supply, "the supply is the players' CHIP plus what is in the CHIP mine");
    assert!(amount(&stats["total_minted"]) <= amount(&stats["cap"]));
    // The emission never exceeded 10 CHIP in any minute.
    let rate = amount(&stats["emission_rate"]);
    assert_eq!(rate, 10 * ONE);
    assert!(
        amount(&stats["emission_minted"]) <= 10 * ONE * u128::from(emission_events),
        "{emission_events} minutes, two mines sharing at most 10 CHIP a minute in all"
    );
    println!(
        "CHIP: minted {} (emission {}, motherlode {}), burned {}, supply {}",
        amount(&stats["total_minted"]) / ONE,
        amount(&stats["emission_minted"]) as f64 / ONE as f64,
        amount(&stats["motherlode_minted"]) as f64 / ONE as f64,
        amount(&stats["total_burned"]) as f64 / ONE as f64,
        chip_supply as f64 / ONE as f64
    );
    Ok(())
}

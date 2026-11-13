//! End-to-end on a local NEAR sandbox: deploy, starter claims, one full table with its burn,
//! a refund triggered by a third account, settler-only reporting, and the contract interface.

use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use near_sdk::serde_json::{Value, json};
use std::sync::Arc;

const ONE: u128 = 1_000_000_000_000_000_000;

/// Every method the contract exposes. If a method that can change a rule ever appears, this
/// list stops matching and the test fails.
const EXPECTED_METHODS: &[&str] = &[
    "claim_daily",
    "claim_starter",
    "close_day",
    "collect_blinds",
    "compute_commitment",
    "contract_source_metadata",
    "create_clan",
    "ft_balance_of",
    "ft_metadata",
    "ft_resolve_transfer",
    "ft_total_supply",
    "ft_transfer",
    "ft_transfer_call",
    "get_account_clan",
    "get_clan",
    "get_clan_day",
    "get_clans",
    "get_config",
    "get_daily_claim",
    "get_day",
    "get_day_clan",
    "get_holder",
    "get_stats",
    "get_table",
    "get_tables",
    "join_clan",
    "join_table",
    "leave_clan",
    "lock_table",
    "new",
    "open_table",
    "settle_round",
    "start_round",
    "storage_balance_bounds",
    "storage_balance_of",
    "storage_deposit",
    "storage_unregister",
    "storage_withdraw",
    "void_table",
];

struct Env {
    sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    chip: AccountId,
}

impl Env {
    async fn call(
        &self,
        who: &AccountId,
        method: &str,
        args: Value,
    ) -> near_api::types::transaction::result::TransactionResult {
        near_api::Contract(self.chip.clone())
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(100))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .expect("transaction was sent")
    }

    async fn ok(&self, who: &AccountId, method: &str, args: Value) -> Vec<String> {
        let result = self.call(who, method, args).await;
        let logs = result.logs().iter().map(|l| l.to_string()).collect();
        assert!(result.is_success(), "{method} by {who} failed: {result:?}");
        logs
    }

    async fn refused(&self, who: &AccountId, method: &str, args: Value, reason: &str) {
        let result = self.call(who, method, args).await;
        assert!(result.is_failure(), "{method} by {who} should fail");
        let text = format!("{result:?}");
        assert!(
            text.contains(reason),
            "{method}: expected {reason:?} in {text}"
        );
    }

    async fn view(&self, method: &str, args: Value) -> Value {
        near_api::Contract(self.chip.clone())
            .call_function(method, args)
            .read_only::<Value>()
            .fetch_from(&self.net)
            .await
            .expect("view call")
            .data
    }

    async fn balance(&self, who: &AccountId) -> u128 {
        let v = self
            .view("ft_balance_of", json!({ "account_id": who }))
            .await;
        v.as_str().unwrap().parse().unwrap()
    }

    async fn supply_holds(&self, holders: &[&AccountId]) {
        let stats = self.view("get_stats", json!({})).await;
        let n = |k: &str| stats[k].as_str().unwrap().parse::<u128>().unwrap();
        let mut sum = 0u128;
        for h in holders {
            let view = self.view("get_holder", json!({ "account_id": h })).await;
            sum += view["stored_balance"]
                .as_str()
                .unwrap()
                .parse::<u128>()
                .unwrap();
        }
        assert_eq!(
            n("circulating"),
            sum,
            "circulating equals the sum of balances"
        );
        assert_eq!(n("total_supply"), sum + n("treasury") + n("escrow"));
        assert_eq!(
            n("total_supply"),
            n("initial_supply") + n("total_minted") - n("total_burned")
        );
    }
}

async fn account(sandbox: &near_sandbox::Sandbox, name: &str) -> AccountId {
    let id: AccountId = name.parse().unwrap();
    sandbox
        .create_account(id.as_str().parse().unwrap())
        .initial_balance(NearToken::from_near(20))
        .send()
        .await
        .expect("account created");
    id
}

#[tokio::test]
async fn full_table_burn_refund_and_interface() -> testresult::TestResult<()> {
    let wasm_path = cargo_near_build::build_with_cli(Default::default())?;
    let wasm = std::fs::read(&wasm_path)?;

    // The build writes the ABI beside the wasm. Its method list is the contract's interface.
    let abi_path = wasm_path.as_str().replace(".wasm", "_abi.json");
    let abi: Value = near_sdk::serde_json::from_slice(&std::fs::read(&abi_path)?)?;
    let mut methods: Vec<String> = abi["body"]["functions"]
        .as_array()
        .expect("abi functions")
        .iter()
        .map(|f| f["name"].as_str().unwrap().to_string())
        .collect();
    methods.extend(["contract_source_metadata".to_string()]);
    methods.sort();
    methods.dedup();
    assert_eq!(
        methods, EXPECTED_METHODS,
        "no method may change a parameter"
    );
    for name in &methods {
        assert!(
            !name.starts_with("set_")
                && !name.contains("owner")
                && !name.contains("upgrade")
                && !name.contains("migrate"),
            "unexpected admin-style method {name}"
        );
    }

    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(
        near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?,
    )?;
    let chip = account(&sandbox, "chip.sandbox").await;
    let settler = account(&sandbox, "settler.sandbox").await;
    let house = account(&sandbox, "house.sandbox").await;
    let alice = account(&sandbox, "alice.sandbox").await;
    let bob = account(&sandbox, "bob.sandbox").await;
    let carol = account(&sandbox, "carol.sandbox").await;

    let init_args = json!({
        "metadata": {
            "spec": "ft-1.0.0",
            "name": "Kova Chip",
            "symbol": "CHIP",
            "decimals": 18
        },
        "config": {
            "settler": settler,
            "starter_amount": (1_000 * ONE).to_string(),
            "min_stake": ONE.to_string(),
            "max_stake": (1_000 * ONE).to_string(),
            "pot_burn_bps": 1000,
            "daily_target_tables": 20,
            "daily_mint": (5_000 * ONE).to_string(),
            "daily_miss_burn_bps": 200,
            "blind_grace_seconds": 259200,
            "blind_period_seconds": 86400,
            "blind_bps": 100,
            "blind_floor": (100 * ONE).to_string(),
            "clan_create_burn": (100 * ONE).to_string(),
            "clan_max_members": 50,
            "clan_top_weight": 2
        },
        "treasury_supply": (1_000_000 * ONE).to_string(),
        "house_account": house,
        "house_bankroll": (50_000 * ONE).to_string()
    });
    near_api::Contract::deploy(chip.clone())
        .use_code(wasm)
        .with_init_call("new", init_args.clone())?
        .with_signer(signer.clone())
        .send_to(&net)
        .await?
        .assert_success();

    let env = Env {
        sandbox,
        net,
        signer,
        chip,
    };

    // A second init with the same, valid arguments is refused, even from the contract account.
    env.refused(&env.chip, "new", init_args, "already").await;

    // Starter claims, once each.
    for p in [&alice, &bob, &carol] {
        env.ok(p, "claim_starter", json!({})).await;
    }
    assert_eq!(env.balance(&alice).await, 1_000 * ONE);
    env.refused(&alice, "claim_starter", json!({}), "already claimed")
        .await;

    // Clans: founding burns 100 CHIP; an account is in one clan at a time.
    env.ok(&alice, "create_clan", json!({ "name": "red" }))
        .await;
    assert_eq!(env.balance(&alice).await, 900 * ONE);
    env.ok(&bob, "join_clan", json!({ "name": "red" })).await;
    env.refused(
        &bob,
        "create_clan",
        json!({ "name": "blue" }),
        "Already in a clan",
    )
    .await;
    env.refused(
        &carol,
        "join_clan",
        json!({ "name": "nope" }),
        "Clan not found",
    )
    .await;
    let red = env.view("get_clan", json!({ "name": "red" })).await;
    assert_eq!(red["members"].as_array().unwrap().len(), 2);

    // One full table: alice opens, bob joins, the table locks.
    let pick = |p: &AccountId, m: &str| json!({ "player": p, "market": m, "salt": format!("salt-{p}-0123456789") });
    let env_ref = &env;
    let commit = |v: Value| async move {
        env_ref
            .view("compute_commitment", v)
            .await
            .as_str()
            .unwrap()
            .to_string()
    };
    let alice_commit = commit(pick(&alice, "near:blackdragon")).await;
    let bob_commit = commit(pick(&bob, "near:lonk")).await;
    let stake = 25 * ONE + 3;
    let opened = env
        .call(
            &alice,
            "open_table",
            json!({ "stake": stake.to_string(), "seats": 2, "round_seconds": 30, "open_seconds": 120, "commitment": alice_commit }),
        )
        .await;
    let table_id: String = opened.assert_success().json()?;
    env.ok(
        &bob,
        "join_table",
        json!({ "table_id": table_id, "commitment": bob_commit }),
    )
    .await;
    let table = env.view("get_table", json!({ "table_id": table_id })).await;
    assert_eq!(table["status"], "Locked");

    // Only the settler may reveal.
    let reveals = json!([
        { "player": alice, "market": "near:blackdragon", "salt": format!("salt-{alice}-0123456789"), "start_price": ONE.to_string() },
        { "player": bob, "market": "near:lonk", "salt": format!("salt-{bob}-0123456789"), "start_price": ONE.to_string() },
    ]);
    env.refused(
        &carol,
        "start_round",
        json!({ "table_id": table_id, "reveals": reveals }),
        "Only the settler",
    )
    .await;
    env.ok(
        &settler,
        "start_round",
        json!({ "table_id": table_id, "reveals": reveals }),
    )
    .await;

    // Wait for the round to end, then settle. Alice's pick doubled.
    let reports = json!([
        { "player": alice, "end_price": (2 * ONE).to_string() },
        { "player": bob, "end_price": (ONE / 2).to_string() },
    ]);
    let alice_before = env.balance(&alice).await;
    let bob_before = env.balance(&bob).await;
    let mut settled_logs = None;
    for _ in 0..60 {
        let result = env
            .call(
                &settler,
                "settle_round",
                json!({ "table_id": table_id, "reports": reports }),
            )
            .await;
        if result.is_success() {
            settled_logs = Some(
                result
                    .logs()
                    .iter()
                    .map(|l| l.to_string())
                    .collect::<Vec<_>>(),
            );
            break;
        }
        assert!(
            format!("{result:?}").contains("Round is still running"),
            "{result:?}"
        );
        env.sandbox.fast_forward(10).await?;
    }
    let logs = settled_logs.expect("round settled within the window");
    let pot = 2 * stake;
    let burn = pot / 10;
    assert_eq!(env.balance(&alice).await, alice_before + pot - burn);
    assert_eq!(env.balance(&bob).await, bob_before);
    assert!(
        logs.iter()
            .any(|l| l.contains("ft_burn") && l.contains(&format!("pot_burn:table:{table_id}")))
    );
    assert!(logs.iter().any(|l| l.contains("round_settled")));
    println!("settled table {table_id}: pot {pot}, burned {burn}");

    // Both players are red, so the table counts once for red, which now leads the day.
    let stats = env.view("get_stats", json!({})).await;
    let today = stats["today"].as_u64().unwrap();
    let day = env.view("get_day", json!({ "day": today })).await;
    assert_eq!(day["top_clan"], "red");
    assert_eq!(day["top_clan_tables"], 1);
    let red_day = env
        .view("get_clan_day", json!({ "day": today, "name": "red" }))
        .await;
    assert_eq!(red_day["tables"], 1);
    assert_eq!(red_day["players"], 2);
    assert_eq!(stats["clan_burned"], (100 * ONE).to_string());

    // A table that never fills: carol voids it after the window and alice is refunded.
    let lonely = env
        .call(
            &alice,
            "open_table",
            json!({ "stake": ONE.to_string(), "seats": 3, "round_seconds": 30, "open_seconds": 30, "commitment": commit(pick(&alice, "near:a")).await }),
        )
        .await;
    let lonely_id: String = lonely.assert_success().json()?;
    let before = env.balance(&alice).await;
    let mut voided = false;
    for _ in 0..60 {
        let result = env
            .call(&carol, "void_table", json!({ "table_id": lonely_id }))
            .await;
        if result.is_success() {
            voided = true;
            break;
        }
        env.sandbox.fast_forward(10).await?;
    }
    assert!(voided, "a third account could void the table");
    assert_eq!(env.balance(&alice).await, before + ONE);
    let lonely = env
        .view("get_table", json!({ "table_id": lonely_id }))
        .await;
    assert_eq!(lonely["status"], "Cancelled");

    env.supply_holds(&[&house, &alice, &bob, &carol]).await;
    let stats = env.view("get_stats", json!({})).await;
    println!("stats after the run: {stats}");
    Ok(())
}

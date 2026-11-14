use super::*;
use near_sdk::mock::MockAction;
use near_sdk::test_utils::{VMContextBuilder, get_created_receipts};
use near_sdk::{PromiseResult, testing_env};

const FACTORY: &str = "mines.test";
const CHIP: &str = "chip.test";
const BRRRAIN: &str = "token.brrrain.test";
const HASH: &str = "68vt1eobvgmM4x1zn3ofZBnXetoXqo9bZGYTkZ66Myin";

fn id(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn config() -> Config {
    Config {
        mine_code_hash: HASH.parse().unwrap(),
        chip: id(CHIP),
        allowed_tokens: vec![id(CHIP), id(BRRRAIN)],
        allowed_suffixes: vec![".meme-cooking.test".to_string()],
    }
}

fn context(predecessor: &str, deposit: NearToken) -> near_sdk::VMContext {
    VMContextBuilder::new()
        .current_account_id(id(FACTORY))
        .predecessor_account_id(id(predecessor))
        .attached_deposit(deposit)
        .block_timestamp(1_700_000_000_000_000_000)
        .build()
}

fn factory() -> Factory {
    testing_env!(context(FACTORY, NearToken::from_near(0)));
    Factory::new(
        config().mine_code_hash,
        id(CHIP),
        config().allowed_tokens,
        config().allowed_suffixes,
    )
}

fn attempt<T>(run: impl FnOnce() -> T) -> bool {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(run)).is_ok()
}

fn open(factory: &mut Factory, token: &str, deposit: NearToken) -> Promise {
    testing_env!(context("opener.test", deposit));
    factory.open_mine(id(token), U128(10), U128(1_000), U128(0), 0)
}

#[test]
fn the_factory_accepts_the_right_coins_and_rejects_the_rest() {
    let config = config();
    for accepted in [
        CHIP,
        BRRRAIN,
        "jambo.meme-cooking.test",
        "purge-1.meme-cooking.test",
    ] {
        assert!(token_allowed(&id(accepted), &config), "{accepted}");
    }
    for rejected in [
        "meme-cooking.test",            // the launchpad itself
        "fake.test",                    // some other coin
        "xmeme-cooking.test",           // looks like the suffix without the dot
        "evil-meme-cooking.test",       // same
        "a.b.meme-cooking.test",        // not a direct child
        "jambo.meme-cooking.near",      // another network's launchpad
        "token.brrrain.test.evil",      // starts like a listed coin
        "other.brrrain.test",           // sibling of a listed coin
        "jambo.meme-cooking.test.evil", // the suffix is not at the end
    ] {
        assert!(!token_allowed(&id(rejected), &config), "{rejected}");
    }
}

#[test]
fn a_mine_is_named_after_its_coin() {
    let factory = id(FACTORY);
    assert_eq!(
        mine_account(&id("jambo.meme-cooking.test"), &factory),
        id("jambo-meme-cooking-test.mines.test")
    );
    assert_eq!(mine_account(&id(CHIP), &factory), id("chip-test.mines.test"));
}

#[test]
fn a_long_coin_name_gets_a_short_hashed_mine_name() {
    testing_env!(context(FACTORY, NearToken::from_near(0)));
    let factory = id("kova-mines-factory.testnet");
    let token = id(&format!("{}.meme-cooking.testnet", "a".repeat(40)));
    let mine = mine_account(&token, &factory);
    assert!(mine.as_str().len() <= 64, "{mine}");
    assert!(mine.as_str().ends_with(".kova-mines-factory.testnet"));
    // The same coin always gets the same mine; a different coin gets a different one.
    assert_eq!(mine, mine_account(&token, &factory));
    let other = id(&format!("{}.meme-cooking.testnet", "b".repeat(40)));
    assert_ne!(mine, mine_account(&other, &factory));
}

#[test]
fn opening_a_mine_creates_a_keyless_account_on_the_immutable_code() {
    let mut factory = factory();
    let deposit = NearToken::from_millinear(250);
    let _ = open(&mut factory, "jambo.meme-cooking.test", deposit);
    let receipts = get_created_receipts();
    let mine = id("jambo-meme-cooking-test.mines.test");
    let batch = receipts.iter().find(|r| r.receiver_id == mine).expect("a batch for the mine");
    let kinds: Vec<&str> = batch
        .actions
        .iter()
        .filter_map(|action| match action {
            MockAction::CreateAccount { .. } => Some("create_account"),
            MockAction::Transfer { .. } => Some("transfer"),
            MockAction::UseGlobalContract { .. } => Some("use_global_contract"),
            MockAction::FunctionCallWeight { .. } => Some("function_call"),
            MockAction::AddKeyWithFullAccess { .. } | MockAction::AddKeyWithFunctionCall { .. } => {
                Some("ADD_KEY")
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        kinds,
        ["create_account", "transfer", "use_global_contract", "function_call"],
        "no key is ever added"
    );
    for action in &batch.actions {
        match action {
            MockAction::Transfer { deposit: sent, .. } => assert_eq!(*sent, deposit),
            MockAction::UseGlobalContract { contract_id, .. } => {
                let shown = format!("{contract_id:?}");
                assert!(shown.contains("CodeHash"), "referenced by hash, not by account: {shown}");
            }
            MockAction::FunctionCallWeight { method_name, args, .. } => {
                assert_eq!(method_name, b"new");
                let args: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(args).unwrap();
                assert_eq!(args["token"], "jambo.meme-cooking.test");
                assert_eq!(args["chip"], CHIP);
                assert_eq!(args["max_stake"], "1000");
            }
            _ => {}
        }
    }
    let info = factory.get_mine(id("jambo.meme-cooking.test")).unwrap();
    assert_eq!(info.mine, mine);
    assert_eq!(info.opener, id("opener.test"));
    assert_eq!(factory.get_mines_count(), 1);
}

#[test]
fn opening_a_mine_is_refused_for_a_bad_coin_a_duplicate_or_a_small_deposit() {
    let mut factory = factory();
    let enough = MINE_DEPOSIT;
    assert!(!attempt(|| open(&mut factory, "fake.test", enough)), "coin not accepted");
    assert!(
        !attempt(|| open(&mut factory, CHIP, NearToken::from_millinear(199))),
        "deposit below 0.2 NEAR"
    );
    assert!(attempt(|| open(&mut factory, CHIP, enough)));
    assert!(!attempt(|| open(&mut factory, CHIP, enough)), "one mine per coin");
    testing_env!(context("opener.test", enough));
    assert!(!attempt(|| factory.open_mine(id(BRRRAIN), U128(0), U128(5), U128(0), 0)), "zero minimum");
    assert!(!attempt(|| factory.open_mine(id(BRRRAIN), U128(9), U128(5), U128(0), 0)), "max under min");
    assert!(
        !attempt(|| factory.open_mine(id(BRRRAIN), U128(1), U128(5), U128(100), 0)),
        "a vein needs a halving period"
    );
    assert_eq!(factory.get_mines_count(), 1);
}

#[test]
fn a_mine_that_could_not_be_created_is_forgotten_and_the_deposit_returned() {
    let mut factory = factory();
    let _ = open(&mut factory, CHIP, MINE_DEPOSIT);
    assert!(factory.get_mine(id(CHIP)).is_some());
    testing_env!(
        context(FACTORY, NearToken::from_near(0)),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![PromiseResult::Failed]
    );
    let opened = factory.on_mine_opened(id(CHIP), id("chip-test.mines.test"), id("opener.test"), MINE_DEPOSIT);
    assert!(!opened);
    assert!(factory.get_mine(id(CHIP)).is_none(), "the coin can try again");
    let refund = get_created_receipts()
        .into_iter()
        .find(|r| r.receiver_id == id("opener.test"))
        .expect("a refund to the opener");
    assert!(refund.actions.iter().any(
        |a| matches!(a, MockAction::Transfer { deposit, .. } if *deposit == MINE_DEPOSIT)
    ));
}

#[test]
fn the_setup_must_be_coherent() {
    testing_env!(context(FACTORY, NearToken::from_near(0)));
    assert!(
        !attempt(|| Factory::new(config().mine_code_hash, id(CHIP), vec![id(BRRRAIN)], vec![])),
        "CHIP must be accepted"
    );
    assert!(
        !attempt(|| Factory::new(
            config().mine_code_hash,
            id(CHIP),
            vec![id(CHIP)],
            vec!["meme-cooking.test".to_string()]
        )),
        "a suffix without its leading dot would match too much"
    );
}

#[test]
fn mines_are_listed_in_pages() {
    let mut factory = factory();
    for token in [CHIP, BRRRAIN, "jambo.meme-cooking.test"] {
        let _ = open(&mut factory, token, MINE_DEPOSIT);
    }
    testing_env!(context("anyone.test", NearToken::from_near(0)));
    assert_eq!(factory.get_mines(None, None).len(), 3);
    assert_eq!(factory.get_mines(Some(1), Some(1)).len(), 1);
    assert_eq!(factory.get_mines(Some(5), None).len(), 0);
    assert_eq!(factory.get_required_deposit(), MINE_DEPOSIT);
}

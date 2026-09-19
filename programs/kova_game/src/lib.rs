use anchor_lang::prelude::*;
use anchor_spl::token_2022;
use anchor_spl::token_2022::spl_token_2022::extension::{
    BaseStateWithExtensions, ExtensionType, StateWithExtensions,
};
use anchor_spl::token_2022::spl_token_2022::state::Mint as Token2022Mint;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use solana_sha256_hasher::hashv;

declare_id!("AJeX3fo46PTu6StNorvkSatRwXLKAvfZpDv6PAzJVCjj");

const VERSION: u8 = 1;
const MIN_PLAYERS: u8 = 2;
const MAX_PLAYERS: u8 = 6;
const MAX_OPEN_SECONDS: i64 = 600;
const ACTIVATION_WINDOW_SECONDS: i64 = 120;
const MAX_ROUND_SECONDS: u16 = 900;
const SETTLEMENT_WINDOW_SECONDS: i64 = 300;
const MAX_STAKE_RAW: u64 = 10_000_000;
const REQUIRED_STAKE_DECIMALS: u8 = 6;
const MAX_PRICE_18: u128 = 1_000_000_000_000_000_000_000_000;
const START_CHAIN_DOMAIN: &[u8] = b"KOVA_START_CHAIN_V1";
const ROSTER_CHAIN_DOMAIN: &[u8] = b"KOVA_ROSTER_CHAIN_V1";

#[program]
pub mod kova_game {
    use super::*;

    pub fn initialize_table(
        ctx: Context<InitializeTable>,
        table_id: [u8; 16],
        stake_raw: u64,
        max_players: u8,
        open_for_seconds: u16,
        round_seconds: u16,
        oracle: Pubkey,
        admission_authority: Pubkey,
    ) -> Result<()> {
        require!(
            ctx.accounts.token_program.key() == token_2022::ID,
            KovaError::UnsupportedTokenProgram
        );
        require!(
            ctx.accounts.stake_mint.decimals == REQUIRED_STAKE_DECIMALS,
            KovaError::InvalidStakeMint
        );
        validate_stake_mint_extensions(&ctx.accounts.stake_mint.to_account_info())?;
        require!(
            ctx.accounts.stake_mint.mint_authority.is_none()
                && ctx.accounts.stake_mint.freeze_authority.is_none(),
            KovaError::MutableStakeMint
        );
        require!(
            (MIN_PLAYERS..=MAX_PLAYERS).contains(&max_players),
            KovaError::InvalidPlayerCount
        );
        require!(
            stake_raw > 0 && stake_raw <= MAX_STAKE_RAW,
            KovaError::InvalidStake
        );
        require!(
            open_for_seconds > 0 && i64::from(open_for_seconds) <= MAX_OPEN_SECONDS,
            KovaError::InvalidOpenWindow
        );
        require!(
            round_seconds > 0 && round_seconds <= MAX_ROUND_SECONDS,
            KovaError::InvalidRoundWindow
        );
        require!(
            oracle != Pubkey::default() && admission_authority != Pubkey::default(),
            KovaError::InvalidAuthority
        );

        let now = Clock::get()?.unix_timestamp;
        let table = &mut ctx.accounts.table;
        table.version = VERSION;
        table.bump = ctx.bumps.table;
        table.creator = ctx.accounts.creator.key();
        table.oracle = oracle;
        table.admission_authority = admission_authority;
        table.stake_mint = ctx.accounts.stake_mint.key();
        table.token_program = ctx.accounts.token_program.key();
        table.table_id = table_id;
        table.stake_raw = stake_raw;
        table.max_players = max_players;
        table.funded_players = 0;
        table.start_records = 0;
        table.result_records = 0;
        table.status = TableStatus::Open;
        table.open_until = now
            .checked_add(i64::from(open_for_seconds))
            .ok_or(KovaError::ArithmeticOverflow)?;
        table.activation_deadline = 0;
        table.planned_start = 0;
        table.starts_at = 0;
        table.ends_at = 0;
        table.settlement_deadline = 0;
        table.round_seconds = round_seconds;
        table.start_digest = [0; 32];
        table.roster_hash = [0; 32];
        table.winner_count = 0;
        table.pot_raw = 0;
        table.total_awards = 0;
        Ok(())
    }

    pub fn join_table(
        ctx: Context<JoinTable>,
        commitment: [u8; 32],
        sealed_market_hash: [u8; 32],
    ) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        require!(table.status == TableStatus::Open, KovaError::TableNotOpen);
        require!(now <= table.open_until, KovaError::OpenWindowExpired);
        require!(
            table.funded_players < table.max_players,
            KovaError::TableFull
        );
        require!(
            ctx.accounts.admission_authority.key() == table.admission_authority,
            KovaError::InvalidAdmissionAuthority
        );
        require!(
            commitment != [0; 32] && sealed_market_hash != [0; 32],
            KovaError::InvalidCommitment
        );

        let decimals = ctx.accounts.stake_mint.decimals;
        let transfer_accounts = TransferChecked {
            from: ctx.accounts.player_tokens.to_account_info(),
            mint: ctx.accounts.stake_mint.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.player.to_account_info(),
        };
        token_interface::transfer_checked(
            CpiContext::new(ctx.accounts.token_program.key(), transfer_accounts),
            table.stake_raw,
            decimals,
        )?;

        let entry = &mut ctx.accounts.entry;
        entry.version = VERSION;
        entry.bump = ctx.bumps.entry;
        entry.table = table.key();
        entry.player = ctx.accounts.player.key();
        entry.commitment = commitment;
        entry.sealed_market_hash = sealed_market_hash;
        entry.funded = true;
        entry.start_recorded = false;
        entry.result_recorded = false;
        entry.claimed = false;
        entry.refunded = false;
        entry.start_price_18 = 0;
        entry.end_price_18 = 0;
        entry.score_bps = 0;
        entry.award_raw = 0;
        entry.start_leaf = [0; 32];
        table.funded_players = table
            .funded_players
            .checked_add(1)
            .ok_or(KovaError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn lock_table(ctx: Context<CreatorTableAction>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        require!(table.status == TableStatus::Open, KovaError::TableNotOpen);
        require!(now <= table.open_until, KovaError::OpenWindowExpired);
        require!(
            table.funded_players >= MIN_PLAYERS,
            KovaError::InsufficientPlayers
        );
        table.status = TableStatus::Locking;
        table.planned_start = now;
        table.activation_deadline = now
            .checked_add(ACTIVATION_WINDOW_SECONDS)
            .ok_or(KovaError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn record_start(
        ctx: Context<OracleEntryAction>,
        start_price_18: u128,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        let table = &mut ctx.accounts.table;
        require!(
            table.status == TableStatus::Locking,
            KovaError::TableNotLocking
        );
        require!(
            ctx.accounts.oracle.key() == table.oracle,
            KovaError::InvalidOracle
        );
        require!(
            start_price_18 > 0 && start_price_18 <= MAX_PRICE_18,
            KovaError::InvalidPrice
        );
        require!(evidence_hash != [0; 32], KovaError::InvalidEvidence);
        let entry = &mut ctx.accounts.entry;
        require!(
            entry.funded && !entry.start_recorded,
            KovaError::StartAlreadyRecorded
        );

        let start_price_bytes = start_price_18.to_le_bytes();
        let scheduled_start_bytes = table.planned_start.to_le_bytes();
        entry.start_leaf = hashv(&[
            b"KOVA_START_V1".as_slice(),
            table.table_id.as_slice(),
            entry.player.as_ref(),
            entry.commitment.as_slice(),
            entry.sealed_market_hash.as_slice(),
            start_price_bytes.as_slice(),
            scheduled_start_bytes.as_slice(),
            evidence_hash.as_slice(),
        ])
        .to_bytes();
        entry.start_price_18 = start_price_18;
        entry.start_recorded = true;
        table.start_records = table
            .start_records
            .checked_add(1)
            .ok_or(KovaError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn activate_table(
        ctx: Context<OracleTableAction>,
        start_digest: [u8; 32],
        roster_hash: [u8; 32],
    ) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        require!(
            table.status == TableStatus::Locking,
            KovaError::TableNotLocking
        );
        require!(
            ctx.accounts.oracle.key() == table.oracle,
            KovaError::InvalidOracle
        );
        require!(
            now < table.activation_deadline,
            KovaError::ActivationWindowExpired
        );
        require!(
            table.start_records == table.funded_players,
            KovaError::IncompleteStarts
        );
        require!(
            start_digest != [0; 32] && roster_hash != [0; 32],
            KovaError::InvalidEvidence
        );
        table.status = TableStatus::Active;
        table.starts_at = now;
        table.ends_at = now
            .checked_add(i64::from(table.round_seconds))
            .ok_or(KovaError::ArithmeticOverflow)?;
        table.settlement_deadline = table
            .ends_at
            .checked_add(SETTLEMENT_WINDOW_SECONDS)
            .ok_or(KovaError::ArithmeticOverflow)?;
        table.start_digest = start_digest;
        table.roster_hash = roster_hash;
        table.pot_raw = table
            .stake_raw
            .checked_mul(u64::from(table.funded_players))
            .ok_or(KovaError::ArithmeticOverflow)?;
        Ok(())
    }

    pub fn record_result(ctx: Context<OracleEntryAction>, end_price_18: u128) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        require!(
            table.status == TableStatus::Active || table.status == TableStatus::Settling,
            KovaError::TableNotActive
        );
        require!(
            ctx.accounts.oracle.key() == table.oracle,
            KovaError::InvalidOracle
        );
        require!(now >= table.ends_at, KovaError::RoundStillActive);
        require!(end_price_18 <= MAX_PRICE_18, KovaError::InvalidPrice);
        require!(
            now < table.settlement_deadline,
            KovaError::SettlementDeadlineReached
        );
        let entry = &mut ctx.accounts.entry;
        require!(
            entry.start_recorded && !entry.result_recorded,
            KovaError::ResultAlreadyRecorded
        );
        entry.end_price_18 = end_price_18;
        entry.score_bps = calculate_score_bps(entry.start_price_18, end_price_18)?;
        entry.result_recorded = true;
        table.result_records = table
            .result_records
            .checked_add(1)
            .ok_or(KovaError::ArithmeticOverflow)?;
        table.status = TableStatus::Settling;
        Ok(())
    }

    pub fn finalize_result(ctx: Context<OracleTableAction>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        require!(
            table.status == TableStatus::Settling,
            KovaError::TableNotSettling
        );
        require!(
            ctx.accounts.oracle.key() == table.oracle,
            KovaError::InvalidOracle
        );
        require!(
            now < table.settlement_deadline,
            KovaError::SettlementDeadlineReached
        );
        require!(
            table.result_records == table.funded_players,
            KovaError::IncompleteResults
        );
        require!(
            ctx.remaining_accounts.len() == usize::from(table.funded_players),
            KovaError::InvalidEntrySet
        );

        let mut prior_wallet: Option<Pubkey> = None;
        let mut start_chain = hashv(&[START_CHAIN_DOMAIN, table.table_id.as_slice()]).to_bytes();
        let mut roster_chain = hashv(&[ROSTER_CHAIN_DOMAIN, table.table_id.as_slice()]).to_bytes();
        let mut winning_score = i64::MIN;
        let mut winner_count: u8 = 0;
        for account_info in ctx.remaining_accounts.iter() {
            require!(
                account_info.owner == ctx.program_id,
                KovaError::InvalidEntrySet
            );
            let entry = Account::<Entry>::try_from(account_info)?;
            require!(
                entry.table == table.key()
                    && entry.funded
                    && entry.start_recorded
                    && entry.result_recorded,
                KovaError::InvalidEntrySet
            );
            if let Some(previous) = prior_wallet {
                require!(
                    previous.to_bytes() < entry.player.to_bytes(),
                    KovaError::EntriesNotSorted
                );
            }
            prior_wallet = Some(entry.player);
            roster_chain = hashv(&[
                ROSTER_CHAIN_DOMAIN,
                table.table_id.as_slice(),
                roster_chain.as_slice(),
                entry.player.as_ref(),
            ])
            .to_bytes();
            start_chain = hashv(&[
                START_CHAIN_DOMAIN,
                table.table_id.as_slice(),
                start_chain.as_slice(),
                entry.start_leaf.as_slice(),
            ])
            .to_bytes();
            if entry.score_bps > winning_score {
                winning_score = entry.score_bps;
                winner_count = 1;
            } else if entry.score_bps == winning_score {
                winner_count = winner_count
                    .checked_add(1)
                    .ok_or(KovaError::ArithmeticOverflow)?;
            }
        }
        require!(
            start_chain == table.start_digest,
            KovaError::StartDigestMismatch
        );
        require!(
            roster_chain == table.roster_hash,
            KovaError::RosterHashMismatch
        );
        require!(winner_count > 0, KovaError::InvalidEntrySet);

        let quotient = table.pot_raw / u64::from(winner_count);
        let mut remainder = table.pot_raw % u64::from(winner_count);
        let mut total_awards = 0u64;
        for account_info in ctx.remaining_accounts.iter() {
            let mut entry = Account::<Entry>::try_from(account_info)?;
            let award = if entry.score_bps == winning_score {
                let bonus = u64::from(remainder > 0);
                remainder = remainder.saturating_sub(bonus);
                quotient
                    .checked_add(bonus)
                    .ok_or(KovaError::ArithmeticOverflow)?
            } else {
                0
            };
            entry.award_raw = award;
            total_awards = total_awards
                .checked_add(award)
                .ok_or(KovaError::ArithmeticOverflow)?;
            entry.exit(ctx.program_id)?;
        }
        require!(total_awards == table.pot_raw, KovaError::PotNotConserved);
        table.status = TableStatus::Settled;
        table.winner_count = winner_count;
        table.total_awards = total_awards;
        Ok(())
    }

    pub fn void_expired_table(ctx: Context<PermissionlessTableAction>) -> Result<()> {
        let table = &mut ctx.accounts.table;
        let now = Clock::get()?.unix_timestamp;
        let timeout_due = match table.status {
            TableStatus::Open => now >= table.open_until,
            TableStatus::Locking => now >= table.activation_deadline,
            TableStatus::Active | TableStatus::Settling => now >= table.settlement_deadline,
            _ => false,
        };
        require!(timeout_due, KovaError::TimeoutNotDue);
        table.status = if table.status == TableStatus::Open || table.status == TableStatus::Locking
        {
            TableStatus::Cancelled
        } else {
            TableStatus::Voided
        };
        Ok(())
    }

    pub fn claim_payout(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.table.status == TableStatus::Settled,
            KovaError::ResultNotFinal
        );
        require!(
            !ctx.accounts.entry.claimed && !ctx.accounts.entry.refunded,
            KovaError::AlreadyClaimed
        );
        let amount = ctx.accounts.entry.award_raw;
        transfer_from_vault(&ctx, amount)?;
        ctx.accounts.entry.claimed = true;
        Ok(())
    }

    pub fn claim_refund(ctx: Context<Claim>) -> Result<()> {
        require!(
            ctx.accounts.table.status == TableStatus::Cancelled
                || ctx.accounts.table.status == TableStatus::Voided,
            KovaError::RefundNotAvailable
        );
        require!(
            !ctx.accounts.entry.claimed && !ctx.accounts.entry.refunded,
            KovaError::AlreadyClaimed
        );
        let amount = ctx.accounts.table.stake_raw;
        transfer_from_vault(&ctx, amount)?;
        ctx.accounts.entry.refunded = true;
        Ok(())
    }
}

fn transfer_from_vault(ctx: &Context<Claim>, amount: u64) -> Result<()> {
    let table = &ctx.accounts.table;
    let bump = [table.bump];
    let signer: &[&[u8]] = &[b"table", table.creator.as_ref(), &table.table_id, &bump];
    let signer_seeds = &[signer];
    let transfer_accounts = TransferChecked {
        from: ctx.accounts.vault.to_account_info(),
        mint: ctx.accounts.stake_mint.to_account_info(),
        to: ctx.accounts.player_tokens.to_account_info(),
        authority: table.to_account_info(),
    };
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            transfer_accounts,
            signer_seeds,
        ),
        amount,
        ctx.accounts.stake_mint.decimals,
    )
}

fn validate_stake_mint_extensions(mint: &AccountInfo<'_>) -> Result<()> {
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<Token2022Mint>::unpack(&data)?;
    for extension in state.get_extension_types()? {
        require!(
            matches!(
                extension,
                ExtensionType::MetadataPointer | ExtensionType::TokenMetadata
            ),
            KovaError::UnsupportedStakeMintExtension
        );
    }
    Ok(())
}

pub fn calculate_score_bps(start_price_18: u128, end_price_18: u128) -> Result<i64> {
    require!(start_price_18 > 0, KovaError::InvalidPrice);
    let start = i128::try_from(start_price_18).map_err(|_| KovaError::PriceOutOfRange)?;
    let end = i128::try_from(end_price_18).map_err(|_| KovaError::PriceOutOfRange)?;
    let numerator = end
        .checked_sub(start)
        .and_then(|delta| delta.checked_mul(10_000))
        .ok_or(KovaError::ArithmeticOverflow)?;
    let score = numerator
        .checked_div(start)
        .ok_or(KovaError::ArithmeticOverflow)?;
    i64::try_from(score).map_err(|_| error!(KovaError::ScoreOutOfRange))
}

#[derive(Accounts)]
#[instruction(table_id: [u8; 16])]
pub struct InitializeTable<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Table::INIT_SPACE,
        seeds = [b"table", creator.key().as_ref(), table_id.as_ref()],
        bump
    )]
    pub table: Account<'info, Table>,
    #[account(
        init,
        payer = creator,
        token::mint = stake_mint,
        token::authority = table,
        token::token_program = token_program,
        seeds = [b"vault", table.key().as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinTable<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    pub admission_authority: Signer<'info>,
    #[account(mut, has_one = stake_mint, has_one = token_program)]
    pub table: Account<'info, Table>,
    #[account(
        init,
        payer = player,
        space = 8 + Entry::INIT_SPACE,
        seeds = [b"entry", table.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub entry: Account<'info, Entry>,
    #[account(mut, seeds = [b"vault", table.key().as_ref()], bump, token::mint = stake_mint, token::authority = table, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = player, token::token_program = token_program)]
    pub player_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatorTableAction<'info> {
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator)]
    pub table: Account<'info, Table>,
}

#[derive(Accounts)]
pub struct OracleTableAction<'info> {
    pub oracle: Signer<'info>,
    #[account(mut)]
    pub table: Account<'info, Table>,
}

#[derive(Accounts)]
pub struct OracleEntryAction<'info> {
    pub oracle: Signer<'info>,
    #[account(mut)]
    pub table: Account<'info, Table>,
    #[account(mut, has_one = table)]
    pub entry: Account<'info, Entry>,
}

#[derive(Accounts)]
pub struct PermissionlessTableAction<'info> {
    #[account(mut)]
    pub table: Account<'info, Table>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(mut, has_one = stake_mint, has_one = token_program)]
    pub table: Account<'info, Table>,
    #[account(mut, has_one = table, has_one = player)]
    pub entry: Account<'info, Entry>,
    #[account(mut, seeds = [b"vault", table.key().as_ref()], bump, token::mint = stake_mint, token::authority = table, token::token_program = token_program)]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub stake_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = stake_mint, token::authority = player, token::token_program = token_program)]
    pub player_tokens: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[account]
#[derive(InitSpace)]
pub struct Table {
    pub version: u8,
    pub bump: u8,
    pub creator: Pubkey,
    pub oracle: Pubkey,
    pub admission_authority: Pubkey,
    pub stake_mint: Pubkey,
    pub token_program: Pubkey,
    pub table_id: [u8; 16],
    pub stake_raw: u64,
    pub max_players: u8,
    pub funded_players: u8,
    pub start_records: u8,
    pub result_records: u8,
    pub status: TableStatus,
    pub open_until: i64,
    pub activation_deadline: i64,
    pub planned_start: i64,
    pub starts_at: i64,
    pub ends_at: i64,
    pub settlement_deadline: i64,
    pub round_seconds: u16,
    pub start_digest: [u8; 32],
    pub roster_hash: [u8; 32],
    pub winner_count: u8,
    pub pot_raw: u64,
    pub total_awards: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Entry {
    pub version: u8,
    pub bump: u8,
    pub table: Pubkey,
    pub player: Pubkey,
    pub commitment: [u8; 32],
    pub sealed_market_hash: [u8; 32],
    pub funded: bool,
    pub start_recorded: bool,
    pub result_recorded: bool,
    pub claimed: bool,
    pub refunded: bool,
    pub start_price_18: u128,
    pub end_price_18: u128,
    pub score_bps: i64,
    pub award_raw: u64,
    pub start_leaf: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum TableStatus {
    Draft,
    Open,
    Locking,
    Active,
    Settling,
    Settled,
    Cancelled,
    Voided,
}

#[error_code]
pub enum KovaError {
    #[msg("Only Token-2022 stake mints are supported.")]
    UnsupportedTokenProgram,
    #[msg("The stake mint must use the configured six decimal places.")]
    InvalidStakeMint,
    #[msg("The stake mint must have no mint or freeze authority.")]
    MutableStakeMint,
    #[msg("The stake mint contains an unsupported Token-2022 extension.")]
    UnsupportedStakeMintExtension,
    #[msg("Player count is outside the supported range.")]
    InvalidPlayerCount,
    #[msg("Stake is outside the supported range.")]
    InvalidStake,
    #[msg("Open window is outside the supported range.")]
    InvalidOpenWindow,
    #[msg("Round window is outside the supported range.")]
    InvalidRoundWindow,
    #[msg("Authority is invalid.")]
    InvalidAuthority,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Table is not open.")]
    TableNotOpen,
    #[msg("Open window expired.")]
    OpenWindowExpired,
    #[msg("Table is full.")]
    TableFull,
    #[msg("Admission authority does not match the table.")]
    InvalidAdmissionAuthority,
    #[msg("Commitment is invalid.")]
    InvalidCommitment,
    #[msg("At least two funded players are required.")]
    InsufficientPlayers,
    #[msg("Table is not locking.")]
    TableNotLocking,
    #[msg("Oracle does not match the table.")]
    InvalidOracle,
    #[msg("Price is invalid.")]
    InvalidPrice,
    #[msg("Evidence hash is invalid.")]
    InvalidEvidence,
    #[msg("Start was already recorded.")]
    StartAlreadyRecorded,
    #[msg("Activation window expired.")]
    ActivationWindowExpired,
    #[msg("Not every funded entry has a start mark.")]
    IncompleteStarts,
    #[msg("Table is not active.")]
    TableNotActive,
    #[msg("Round is still active.")]
    RoundStillActive,
    #[msg("Settlement deadline was reached.")]
    SettlementDeadlineReached,
    #[msg("Result was already recorded.")]
    ResultAlreadyRecorded,
    #[msg("Table is not settling.")]
    TableNotSettling,
    #[msg("Not every funded entry has a result.")]
    IncompleteResults,
    #[msg("Entry set is incomplete or invalid.")]
    InvalidEntrySet,
    #[msg("Entries must be ordered by decoded wallet bytes.")]
    EntriesNotSorted,
    #[msg("Start digest does not match the activated digest.")]
    StartDigestMismatch,
    #[msg("Roster hash does not match the funded entry set.")]
    RosterHashMismatch,
    #[msg("Pot is not conserved.")]
    PotNotConserved,
    #[msg("No timeout is currently due.")]
    TimeoutNotDue,
    #[msg("Result is not final.")]
    ResultNotFinal,
    #[msg("This entry was already paid or refunded.")]
    AlreadyClaimed,
    #[msg("Refund is not available.")]
    RefundNotAvailable,
    #[msg("Price exceeds the signed scoring range.")]
    PriceOutOfRange,
    #[msg("Score exceeds the signed output range.")]
    ScoreOutOfRange,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn score_vectors_match_typescript_contract() {
        let scale = 1_000_000_000_000_000_000u128;
        assert_eq!(
            calculate_score_bps(100 * scale, 112_345 * scale / 1_000).unwrap(),
            1_234
        );
        assert_eq!(
            calculate_score_bps(100 * scale, 87_655 * scale / 1_000).unwrap(),
            -1_234
        );
        assert_eq!(calculate_score_bps(3 * scale, 2 * scale).unwrap(), -3_333);
        assert!(calculate_score_bps(0, 0).is_err());
    }

    #[test]
    fn fixed_bounds_remain_small() {
        assert_eq!(MIN_PLAYERS, 2);
        assert_eq!(MAX_PLAYERS, 6);
        assert_eq!(MAX_ROUND_SECONDS, 900);
        assert_eq!(SETTLEMENT_WINDOW_SECONDS, 300);
        assert_eq!(REQUIRED_STAKE_DECIMALS, 6);
        assert_eq!(MAX_PRICE_18, 1_000_000_000_000_000_000_000_000);
    }
}

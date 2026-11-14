//! The pure rules of a mine: which square wins, how a round pays, how the vein halves, and where
//! a round sits against the UTC day. Nothing here touches the chain, so every rule has a plain
//! unit test.

pub const SQUARES: usize = 25;
pub const ROUND_SECONDS: u64 = 60;
pub const SECONDS_PER_DAY: u64 = 86_400;
/// 1,440. A round is exactly one minute and a day is a whole number of minutes, so a round can
/// never cross 00:00 UTC.
pub const ROUNDS_PER_DAY: u64 = SECONDS_PER_DAY / ROUND_SECONDS;
pub const BPS: u128 = 10_000;
/// Share of the losing stakes that is burned: 10%.
pub const BURN_BPS: u128 = 1_000;

/// The round a moment belongs to: the minute since the Unix epoch, in UTC.
pub fn round_of(unix_seconds: u64) -> u64 {
    unix_seconds / ROUND_SECONDS
}

pub fn round_end(round: u64) -> u64 {
    (round + 1) * ROUND_SECONDS
}

pub fn round_start(round: u64) -> u64 {
    round * ROUND_SECONDS
}

/// The 23:59 round. Nobody can stake in it, so a round that started at 23:58 is settled, and its
/// coins are back in wallets, before 00:00 UTC (BRRRAIN snapshots balances at 00:00 UTC and
/// gives contracts no daily AI quota).
pub fn is_closed_round(round: u64) -> bool {
    round % ROUNDS_PER_DAY == ROUNDS_PER_DAY - 1
}

/// The square from a 32-byte hash. Bytes below 250 are used, so every square has exactly ten
/// of the 250 accepted values and the choice has no modulo bias. A hash with no byte below 250
/// (probability (6/256)^32) falls back to its first eight bytes.
pub fn square_from_hash(hash: &[u8; 32]) -> u8 {
    for byte in hash {
        if *byte < 250 {
            return byte % SQUARES as u8;
        }
    }
    let mut head = [0u8; 8];
    head.copy_from_slice(&hash[..8]);
    (u64::from_le_bytes(head) % SQUARES as u64) as u8
}

/// The full 256-bit product `a * b` as `(high, low)`.
fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    const MASK: u128 = u64::MAX as u128;
    let (a0, a1) = (a & MASK, a >> 64);
    let (b0, b1) = (b & MASK, b >> 64);
    let p00 = a0 * b0;
    let p01 = a0 * b1;
    let p10 = a1 * b0;
    let p11 = a1 * b1;
    let mid = (p00 >> 64) + (p01 & MASK) + (p10 & MASK);
    let low = (p00 & MASK) | ((mid & MASK) << 64);
    let high = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (high, low)
}

/// `floor(a * b / c)` without overflowing in the middle. `None` if `c` is zero or the answer
/// does not fit in 128 bits.
pub fn mul_div(a: u128, b: u128, c: u128) -> Option<u128> {
    if c == 0 {
        return None;
    }
    let (high, low) = mul_wide(a, b);
    if high >= c {
        return None;
    }
    let mut rem = high;
    let mut quotient = 0u128;
    for bit in (0..128).rev() {
        let carry = rem >> 127;
        rem = (rem << 1) | ((low >> bit) & 1);
        if carry == 1 || rem >= c {
            rem = rem.wrapping_sub(c);
            quotient |= 1u128 << bit;
        }
    }
    Some(quotient)
}

/// How a round with winners pays.
#[derive(Debug, PartialEq, Eq)]
pub struct Split {
    /// Burned: 10% of the losing stakes, rounded down.
    pub burn: u128,
    /// One per winning stake, in the order given: the stake back plus its weighted share of the
    /// rest of the losing stakes and the vein release. Indivisible dust goes to the first winner.
    pub awards: Vec<u128>,
}

/// `winner_stakes` must not be empty and must hold no zero. `bonus` is the vein release.
///
/// The awards and the burn always add up to the stakes plus the bonus, exactly.
pub fn split(winner_stakes: &[u128], losing_total: u128, bonus: u128) -> Option<Split> {
    if winner_stakes.is_empty() || winner_stakes.contains(&0) {
        return None;
    }
    let winning_total = winner_stakes
        .iter()
        .try_fold(0u128, |sum, stake| sum.checked_add(*stake))?;
    let burn = mul_div(losing_total, BURN_BPS, BPS)?;
    let pool = (losing_total - burn).checked_add(bonus)?;
    let mut awards = Vec::with_capacity(winner_stakes.len());
    let mut shared = 0u128;
    for stake in winner_stakes {
        let share = mul_div(pool, *stake, winning_total)?;
        shared += share;
        awards.push(stake.checked_add(share)?);
    }
    awards[0] = awards[0].checked_add(pool - shared)?;
    Some(Split { burn, awards })
}

/// What the vein releases to one round's winners: `per_round`, halved once for every full
/// `halving_seconds` since the mine opened.
pub fn vein_rate(per_round: u128, elapsed_seconds: u64, halving_seconds: u64) -> u128 {
    if per_round == 0 || halving_seconds == 0 {
        return 0;
    }
    let halvings = elapsed_seconds / halving_seconds;
    if halvings >= 128 {
        0
    } else {
        per_round >> halvings
    }
}

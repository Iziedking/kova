//! The pure rules of CHIP's emission: the halving schedule, the weighted split and the
//! Motherlode roll. Nothing here touches the chain.

pub const ROUND_SECONDS: u64 = 60;

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

/// CHIP released per minute: `initial`, halved once for every full `halving_seconds` since launch.
pub fn emission_rate(initial: u128, elapsed_seconds: u64, halving_seconds: u64) -> u128 {
    if initial == 0 || halving_seconds == 0 {
        return 0;
    }
    let halvings = elapsed_seconds / halving_seconds;
    if halvings >= 128 {
        0
    } else {
        initial >> halvings
    }
}

/// Splits `amount` between `weights`, in proportion. The parts add up to `amount` exactly: the
/// indivisible remainder goes to the first weight. `None` if there are no weights, a weight is
/// zero, or the weights overflow.
pub fn split_by_weight(amount: u128, weights: &[u128]) -> Option<Vec<u128>> {
    if weights.is_empty() || weights.contains(&0) {
        return None;
    }
    let total = weights
        .iter()
        .try_fold(0u128, |sum, weight| sum.checked_add(*weight))?;
    let mut parts = Vec::with_capacity(weights.len());
    let mut given = 0u128;
    for weight in weights {
        let part = mul_div(amount, *weight, total)?;
        given += part;
        parts.push(part);
    }
    parts[0] += amount - given;
    Some(parts)
}

/// True for 1 in `odds` hashes. The first eight bytes are read as a number and reduced; the bias
/// from the reduction is at most `odds / 2^64`.
pub fn is_motherlode(hash: &[u8; 32], odds: u32) -> bool {
    let mut head = [0u8; 8];
    head.copy_from_slice(&hash[..8]);
    u64::from_le_bytes(head) % u64::from(odds.max(1)) == 0
}

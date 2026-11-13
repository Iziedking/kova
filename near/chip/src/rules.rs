//! Pure game arithmetic. No storage, no environment, so every rule here is tested directly.

/// Basis points in one whole.
pub const BPS: u128 = 10_000;

/// Prices are reported with 18 decimals. This bound matches the Solana program.
pub const MAX_PRICE: u128 = 1_000_000_000_000_000_000_000_000;

/// Price move in basis points, rounded toward zero. Same vectors as the Solana program and
/// `src/domain/game` in the app.
pub fn score_bps(start: u128, end: u128) -> Result<i64, &'static str> {
    if start == 0 {
        return Err("Start price must be positive");
    }
    if start > MAX_PRICE || end > MAX_PRICE {
        return Err("Price is outside the supported range");
    }
    let start = start as i128;
    let end = end as i128;
    let score = (end - start) * 10_000 / start;
    i64::try_from(score).map_err(|_| "Score is outside the supported range")
}

/// The result of settling one pot.
#[derive(Debug, PartialEq, Eq)]
pub struct PotSplit {
    pub burn: u128,
    pub awards: Vec<u128>,
    pub winners: u8,
}

/// Burns `burn_bps` of the pot and splits the rest between the seats with the best score.
/// Ties share equally. The indivisible remainder goes one unit at a time to the tied winners
/// in seat order, so `burn + sum(awards) == pot` always holds.
pub fn split_pot(pot: u128, burn_bps: u16, scores: &[i64]) -> Result<PotSplit, &'static str> {
    if scores.is_empty() {
        return Err("No seats to settle");
    }
    if u128::from(burn_bps) > BPS {
        return Err("Burn share is above 100%");
    }
    let burn = pot * u128::from(burn_bps) / BPS;
    let payout = pot - burn;
    let best = *scores.iter().max().expect("not empty");
    let winners = scores.iter().filter(|score| **score == best).count() as u128;
    let quotient = payout / winners;
    let mut remainder = payout % winners;
    let awards = scores
        .iter()
        .map(|score| {
            if *score != best {
                return 0;
            }
            if remainder > 0 {
                remainder -= 1;
                quotient + 1
            } else {
                quotient
            }
        })
        .collect::<Vec<_>>();
    debug_assert_eq!(burn + awards.iter().sum::<u128>(), pot);
    Ok(PotSplit {
        burn,
        awards,
        winners: winners as u8,
    })
}

/// Blind parameters, fixed at deploy.
#[derive(Clone, Copy, Debug)]
pub struct BlindRule {
    /// Seconds after an account's last stake before blinds start.
    pub grace_seconds: u64,
    /// Length of one blind period in seconds.
    pub period_seconds: u64,
    /// Share of the balance taken per full idle period, in basis points.
    pub bps: u16,
    /// A balance is never taken below this amount by blinds.
    pub floor: u128,
}

/// Blind owed by an idle holder, and the new "charged through" time.
///
/// Periods are counted from the later of the end of the grace period and the last time a blind
/// was charged, so no idle second is charged twice. The rate is simple, not compounding, and the
/// result never takes the balance below the floor.
pub fn blind_owed(
    balance: u128,
    last_play: u64,
    charged_through: u64,
    now: u64,
    rule: BlindRule,
) -> (u128, u64) {
    if rule.bps == 0 || rule.period_seconds == 0 {
        return (0, charged_through.max(now));
    }
    let from = last_play
        .saturating_add(rule.grace_seconds)
        .max(charged_through);
    if now <= from {
        return (0, charged_through);
    }
    let periods = (now - from) / rule.period_seconds;
    if periods == 0 {
        return (0, charged_through.max(from));
    }
    let through = from + periods * rule.period_seconds;
    let rate = u128::from(rule.bps)
        .saturating_mul(u128::from(periods))
        .min(BPS);
    let raw = balance * rate / BPS;
    let owed = raw.min(balance.saturating_sub(rule.floor));
    (owed, through)
}

/// UTC day number for a unix time in seconds.
pub fn day_of(seconds: u64) -> u32 {
    (seconds / 86_400) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    const ONE: u128 = 1_000_000_000_000_000_000;

    #[test]
    fn score_vectors_match_the_solana_program() {
        assert_eq!(score_bps(100 * ONE, 112_345 * ONE / 1_000), Ok(1_234));
        assert_eq!(score_bps(100 * ONE, 87_655 * ONE / 1_000), Ok(-1_234));
        assert_eq!(score_bps(3 * ONE, 2 * ONE), Ok(-3_333));
        assert_eq!(score_bps(5 * ONE, 0), Ok(-10_000));
        assert!(score_bps(0, ONE).is_err());
        assert!(score_bps(ONE, MAX_PRICE + 1).is_err());
    }

    fn conserved(pot: u128, split: &PotSplit) {
        assert_eq!(split.burn + split.awards.iter().sum::<u128>(), pot);
    }

    #[test]
    fn single_winner_takes_the_pot_after_burn() {
        let split = split_pot(2_000, 1_000, &[50, -20]).unwrap();
        assert_eq!(split.burn, 200);
        assert_eq!(split.awards, vec![1_800, 0]);
        assert_eq!(split.winners, 1);
        conserved(2_000, &split);
    }

    #[test]
    fn ties_split_with_remainder_in_seat_order() {
        // 3 seats, 7 units each, 10% burn: pot 21, burn 2, payout 19, two winners 10 + 9.
        let split = split_pot(21, 1_000, &[5, 5, -1]).unwrap();
        assert_eq!(split.burn, 2);
        assert_eq!(split.awards, vec![10, 9, 0]);
        conserved(21, &split);
    }

    #[test]
    fn six_seats_and_full_tie_conserve_every_unit() {
        for pot in [6u128, 7, 1_000_003, 6 * ONE + 5] {
            for bps in [0u16, 1, 333, 1_000, 5_000] {
                let split = split_pot(pot, bps, &[1, 1, 1, 1, 1, 1]).unwrap();
                conserved(pot, &split);
                assert_eq!(split.winners, 6);
                let max = *split.awards.iter().max().unwrap();
                let min = *split.awards.iter().min().unwrap();
                assert!(max - min <= 1);
            }
        }
    }

    #[test]
    fn split_refuses_bad_input() {
        assert!(split_pot(10, 1_000, &[]).is_err());
        assert!(split_pot(10, 10_001, &[1]).is_err());
    }

    const RULE: BlindRule = BlindRule {
        grace_seconds: 86_400,
        period_seconds: 86_400,
        bps: 200,
        floor: 100,
    };

    #[test]
    fn no_blind_inside_the_grace_period() {
        assert_eq!(blind_owed(10_000, 0, 0, 86_400, RULE), (0, 0));
        assert_eq!(blind_owed(10_000, 0, 0, 86_400 + 86_399, RULE), (0, 86_400));
    }

    #[test]
    fn the_right_blind_after_the_grace_period() {
        // One full idle period after grace: 2% of 10_000.
        assert_eq!(
            blind_owed(10_000, 0, 0, 2 * 86_400, RULE),
            (200, 2 * 86_400)
        );
        // Three periods: 6%. Partial periods are not charged yet.
        assert_eq!(
            blind_owed(10_000, 0, 0, 4 * 86_400 + 500, RULE),
            (600, 4 * 86_400)
        );
    }

    #[test]
    fn no_period_is_charged_twice() {
        let (first, through) = blind_owed(10_000, 0, 0, 2 * 86_400, RULE);
        assert_eq!(first, 200);
        let (again, through_again) = blind_owed(9_800, 0, through, 2 * 86_400 + 10, RULE);
        assert_eq!((again, through_again), (0, through));
        let (next, _) = blind_owed(9_800, 0, through, 3 * 86_400, RULE);
        assert_eq!(next, 196);
    }

    #[test]
    fn the_cap_holds() {
        // Years idle cannot take the balance below the floor.
        let (owed, _) = blind_owed(10_000, 0, 0, 3_650 * 86_400, RULE);
        assert_eq!(owed, 10_000 - 100);
        // At or under the floor nothing is taken.
        assert_eq!(blind_owed(100, 0, 0, 3_650 * 86_400, RULE).0, 0);
        assert_eq!(blind_owed(50, 0, 0, 3_650 * 86_400, RULE).0, 0);
    }

    #[test]
    fn a_new_stake_restarts_the_grace_period() {
        // Played at day 5, checked at day 6: still inside grace.
        assert_eq!(
            blind_owed(10_000, 5 * 86_400, 2 * 86_400, 6 * 86_400, RULE).0,
            0
        );
    }

    #[test]
    fn days_are_utc() {
        assert_eq!(day_of(0), 0);
        assert_eq!(day_of(86_399), 0);
        assert_eq!(day_of(86_400), 1);
    }
}

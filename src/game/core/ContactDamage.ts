/**
 * ContactDamage — what it costs to have enemies standing on you.
 *
 * ## Third design. The two before it, and why they failed
 *
 * **1. Discrete hits behind global i-frames.** `player.takeDamage(dmg * dt)`
 * into a method that floored at 1 and granted 0.5s of invulnerability. Every
 * enemy dealt exactly 1, armour was subtracted from 0.08 and did nothing, and
 * — worst of all — i-frames capped *all* incoming damage at 2 HP/s. One bat and
 * forty Doom Harbingers cost the same. Crowd size was free.
 *
 * **2. A continuous stream with a crowd cap.** Fixed the armour and made
 * crowds stack, but left two problems. A drain of 0.3 HP per frame does not
 * *read* as being hurt — there is no moment, nothing to react to, and the HP
 * bar just slides. And `CROWD_CAP = 4` meant a hundred enemies still cost the
 * same as four. A real 10-minute run: 12019 kills, 5994 HP healed, the player
 * standing in the middle of the arena circling for repair cells, because
 * standing still out-healed everything the crowd could do.
 *
 * **3. This one: every enemy bites on its own clock.**
 *
 *   - Each enemy carries its own `biteTimer`. There are **no global i-frames**,
 *     so twelve enemies land twelve bites — the exact failure of design 1 is
 *     structurally impossible.
 *   - Damage arrives in chunks you can see and react to. Losing 9 HP at once is
 *     an event; losing 0.3 HP sixty times a second is weather.
 *   - Armour is still applied per bite, with a floor, so it is strong against
 *     many weak enemies and modest against one big one.
 *
 * ## Why there is still a cap, and why it is a different kind of cap
 *
 * `MAX_BITERS` is not a damage multiplier — it is **how many bodies physically
 * fit against you**. The contact ring around the player is about 190px around
 * and enemies are 24–40px across, so six is roughly what geometry allows;
 * separation forces keep them apart until a pile overwhelms them. Capping the
 * number of *mouths* is a rule about the arena. Capping total damage at "4x the
 * strongest attacker", the way design 2 did, was a rule about nothing.
 *
 * The nearest enemies bite first, which is both fair and what you would guess
 * from looking at the screen.
 */

/** Fraction of a bite that armor can never remove */
export const ARMOR_FLOOR = 0.2;

/** Seconds between one enemy's bites */
export const BITE_INTERVAL = 0.8;

/**
 * How hard one bite lands, as a multiple of the enemy's damage-per-second times
 * the interval.
 *
 * **Below 1 on purpose: individual enemies got gentler.** The danger now comes
 * from how many of them reach you, not from how hard each one hits — crowds
 * scale linearly to MAX_BITERS instead of being capped at "4x the strongest
 * with a falloff", so a full ring is about 2.4x worse than the old model while
 * a single enemy is about 30% cheaper.
 *
 * That is the shape the game actually needed. Brushing past one thing while
 * kiting should cost almost nothing; letting six close in should be the thing
 * that kills you.
 *
 * The first cut used 1.6 and a test caught it immediately: fully surrounded at
 * minute ten, a 300 HP player died in 0.85s — no time to read the screen, let
 * alone walk out. At 0.7 that is about two seconds, which is frightening and
 * survivable, which is the point.
 */
export const BITE_PUNCH = 0.7;

/** How many enemies can have their teeth in you at once */
export const MAX_BITERS = 6;

/**
 * How many bites may be banked while nothing is touching you.
 *
 * The rate limiter is a token bucket, and a bucket that banks its full capacity
 * has a nasty property: walk into a standing crowd with six tokens saved and
 * **six bites land on the same frame**. In play that reads as "I stepped in and
 * instantly died" with no ramp at all — the player's words were "раз, и я
 * умер". The sustained rate was never the problem; the entry burst was.
 *
 * Two keeps the top-end rate exactly where it was (MAX_BITERS per
 * BITE_INTERVAL) while making the first half-second of a pile a ramp instead of
 * a wall.
 */
export const BITE_BUDGET_CAP = 2;

/**
 * Extra reach on a bite, beyond the touching radii.
 *
 * Contact knockback shoves an enemy 190px/s away while it only walks back at
 * ~100, so a *lone* attacker spends most of its time just out of overlap: it
 * landed a bite every ~1.3s instead of every 0.8, which measured as 3.6 HP/s —
 * invisible on a 150 HP bar. In a crowd nobody can be shoved anywhere, because
 * the bodies behind are in the way, so the same enemies bit at full rate. That
 * gap is what made one enemy feel like nothing and eight feel like death.
 *
 * A few pixels of slack closes it without making knockback useless as an
 * escape — you still break contact by *moving*, just not by standing there
 * while the shove does it for you.
 */
export const BITE_REACH = 9;

/**
 * Damage one enemy's bite deals through `armor`.
 *
 * `damage` is the enemy's damage-per-second from ENEMY_CONFIG — the column is
 * still written in per-second terms so the difficulty scaling keeps working
 * unchanged.
 */
export function biteDamage(damage: number, armor: number): number {
    const raw = damage * BITE_INTERVAL * BITE_PUNCH;
    return Math.max(raw * ARMOR_FLOOR, raw - armor);
}

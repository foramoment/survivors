/**
 * ContactDamage — what it costs to have enemies standing on you.
 *
 * ## Fourth design, and the first one that is not a rate limiter
 *
 * The three before it all tried to bound **how often** damage arrives. All
 * three failed, because what was actually broken is **how big each hit is**.
 *
 *   1. **Global i-frames.** `player.takeDamage(dmg * dt)` into a method that
 *      floored at 1 and granted 0.5s of invulnerability. Armour did nothing and
 *      all incoming damage was capped at 2 HP/s, so one bat and forty Doom
 *      Harbingers cost exactly the same. Standing in a crowd was free.
 *   2. **A continuous stream capped at `CROWD_CAP` x the strongest attacker**,
 *      with a `1/sqrt(k)` falloff. Armour worked again, but a hundred enemies
 *      still cost what four did, and a 0.3 HP-per-frame drain does not read as
 *      damage — a real run ended 12019 kills and 5994 HP healed with the player
 *      standing still in the middle of the arena.
 *   3. **A bite per enemy on its own clock, plus a token bucket.** Crowds
 *      finally scaled with their size — and then the numbers exploded.
 *
 * They exploded because contact damage was multiplied by four independent
 * scalars at once: enemy tier (x7.2) x run time (x2) x adaptive intensity
 * (x1.53) x stage `damageScale` (x1.5) = **x33 across a run**. Measured on the
 * shipping build: one lone tier-10 enemy on Void Nexus bit for 87 against a
 * realistic 115 HP pool, and a full ring killed in 0.18s. A fourth rate limiter
 * would have failed the same way, because a limit on frequency cannot fix a
 * fault in magnitude.
 *
 * ## The pillar: health is a budget for the whole run
 *
 * The player's pool grows roughly **x1.2** over a run (75-150 by class, +20 a
 * pick, and nobody spends eight picks on Barrier Field). Nothing that grows x33
 * can be balanced against that, at any tuning.
 *
 * So contact damage is now **almost flat** — see `ENEMY_CONFIG.baseDamage`, and
 * note that `DifficultyDirector` no longer scales it at all. The late game
 * escalates through enemy *count* and *health*, which is what that file's
 * comments always claimed it did.
 *
 * Small numbers are the design, not a side effect. Damage taken is a resource
 * spent across ten minutes instead of a per-fight bar that refills, and that is
 * the whole reason +20 max HP is worth a pick.
 *
 * ## The model
 *
 *     drain per second = SUM(touching enemies) x armour x ramp
 *
 * **No crowd cap and no falloff.** Both existed only to tame a big number.
 * Geometry already caps the crowd: 6-9 bodies physically fit against the
 * player, and `touching` is built from real overlap, so the sum is bounded by
 * the arena rather than by a constant. Capping it again was a rule about
 * nothing.
 */

/**
 * Armour softening constant, `K` in `K / (armour + K)`.
 *
 * Armour used to be **flat subtraction** with a 20% floor, which is the shape
 * that guarantees the stat dies: eight stacks of Void Shield removed 8 from a
 * bite that had grown to 87, so the whole card was worth 9% at the moment it
 * was supposed to matter most.
 *
 * The League of Legends curve fixes that and brings a property worth having:
 * every point of armour adds the *same* amount of effective health, because
 * `effective HP = HP x (1 + armour / K)`. Armour and max HP **multiply**, so a
 * defensive build compounds instead of competing with itself. It also can never
 * reach immunity, so no floor constant is needed.
 *
 * Only the **ratio** of armour to K means anything, so K is picked to make the
 * numbers on the cards small and legible rather than to be a round 100: a class
 * grants 1-2 armour and a Void Shield stack is 1, exactly the values these
 * stats had back when armour was flat. If you retune K, scale every armour
 * value in GameData with it or you have silently rebalanced the game.
 */
export const ARMOR_K = 10;

/** Ceiling of the standing-still multiplier */
export const CONTACT_RAMP_MAX = 2.5;

/** Seconds of unbroken contact needed to reach `CONTACT_RAMP_MAX` */
export const CONTACT_RAMP_FULL = 3;

/** Seconds clear of everything needed to shed a full ramp */
export const CONTACT_RAMP_DECAY = 1.5;

/**
 * Extra reach on contact, beyond the touching radii.
 *
 * Contact knockback shoves an enemy 190px/s away while it only walks back at
 * ~100, so a lone attacker spends much of its time just outside overlap and
 * flickers in and out of the touching set. A few pixels of slack keeps the
 * drain (and therefore the ramp) continuous without making knockback useless as
 * an escape — you still break contact by *moving*.
 */
export const CONTACT_REACH = 9;

/**
 * Damage multiplier left after armour. 1 at zero armour, above 1 when armour is
 * negative (the Berserker), and asymptotically approaching but never reaching 0.
 */
export function armorMultiplier(armor: number): number {
    // Clamped so the Berserker's negative armour cannot cross the pole at -K
    // and flip the sign of every hit in the game.
    const a = Math.max(armor, -ARMOR_K * 0.5);
    return ARMOR_K / (a + ARMOR_K);
}

/**
 * The standing-still multiplier, from seconds of unbroken contact.
 *
 * This is a turret in League of Legends: diving is cheap, camping is fatal.
 * It is the piece that lets contact damage be small — the *base* number no
 * longer has to be scary on its own, because the danger is a function of how
 * long you choose to stay, which is the one variable the player controls.
 *
 * It is also what killed design 2 in reverse: standing still used to out-heal
 * the drain, and no amount of standing still can out-heal a drain that grows
 * the longer you do it.
 */
export function contactRamp(contactTime: number): number {
    const t = Math.min(Math.max(contactTime, 0) / CONTACT_RAMP_FULL, 1);
    return 1 + t * (CONTACT_RAMP_MAX - 1);
}

/**
 * Total HP per second drained by every enemy currently touching the player.
 *
 * `damages` are the raw per-second values off `ENEMY_CONFIG` — the column is
 * still written in per-second terms, it is just no longer scaled by time,
 * intensity or stage.
 */
export function contactDamagePerSecond(damages: number[], armor: number, ramp: number): number {
    if (damages.length === 0) return 0;

    let total = 0;
    for (const d of damages) total += d;

    return total * armorMultiplier(armor) * ramp;
}

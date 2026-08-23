/**
 * BOSS ARMOUR — the rule that lets a boss fight use the damage you actually
 * built.
 *
 * ## The measurement
 *
 * A 25-minute Void Nexus clear. The final boss carries tier-10 health times the
 * clock times the stage times twelve times three — about **2.5 million HP**.
 * The player fought it from 15:00 to 25:09: **609 seconds**, and the play report
 * was "I hit the boss for a very long time, it felt like I did not have enough
 * damage".
 *
 * They had plenty. The run's smoothed damage at that moment — during the boss
 * fight — was **1,000,000 per second**, and roughly **4,000** of it was landing
 * on the boss. Their damage could not be aimed:
 *
 *   - every weapon in the build was an area weapon, worth its value times the
 *     number of bodies standing in it, and a boss is one body
 *   - First Strike (+72%) only applies to a target at full health, so against a
 *     boss it fires once per fight
 *   - Kill Echo's blast is capped by what the corpse was worth, so trash cannot
 *     take boss-sized bites (deliberately — see killEchoDamage)
 *   - Static Discharge's burn is quartered against bosses (BOSS_FLAT_RESIST)
 *
 * Three of those four are rules this project added ON PURPOSE, each closing a
 * real exploit. Together they left the boss immune to most of a build.
 *
 * ## The rule
 *
 * A boss wears armour. While it is up the boss takes a fraction of everything
 * (BOSS_ARMOR_ABSORB). Every escort that dies near the boss knocks a plate off,
 * and when the last plate goes the boss is **exposed** for a few seconds and
 * takes full damage from everything.
 *
 * So clearing the crowd is how you earn damage on the boss — which is the same
 * shape as the bug that had to be killed twice ("melt the boss by farming its
 * escort"), and this time it is bounded by construction rather than by a
 * percentage nobody sized:
 *
 *   - the crowd does not damage the boss. It opens a **window**
 *   - what happens in the window is your own weapons, at their own numbers,
 *     credited to them in the run summary
 *   - the window has a length, so no amount of kill rate converts into more
 *     than one window per cycle
 *
 * It also gives the fight a rhythm instead of a hold-the-button: break, burst,
 * reposition, break again. And it bounds the top end — a build with ten times
 * the single-target damage still needs the same number of windows, because most
 * of the fight is spent behind armour.
 */

/** What a boss takes while its armour is up */
export const BOSS_ARMOR_ABSORB = 0.15;

/**
 * Escort deaths needed to strip the armour, and how close they have to die.
 *
 * Sized against a real clear rate: the measured build killed about ten a second
 * across the arena and maybe four of those inside this radius, so a plate falls
 * in three or four seconds of active clearing. A build that cannot clear still
 * grinds the boss down through BOSS_ARMOR_ABSORB — slowly, which is the honest
 * outcome for a build with no answer to a crowd.
 */
export const BOSS_PLATE_KILLS = 14;
export const BOSS_ESCORT_RADIUS = 360;

/** Seconds of full damage once the last plate falls */
export const BOSS_VULNERABLE_TIME = 6;

/**
 * The armour also fails on its own after this long, however far you fought
 * from it.
 *
 * Without it the rule has a hole big enough to lose a run in: kite the boss
 * away from the crowd, clear the crowd somewhere else, and no plate ever falls
 * — a boss that takes 15% of your damage forever is worse than the ten-minute
 * sponge this replaces. **A mechanic that can be refused has to still
 * terminate.**
 *
 * At fourteen seconds against roughly three or four for a player actually
 * fighting beside the boss, staying close is worth about four times the
 * windows. That is a reward for engaging, not a punishment for not.
 */
export const BOSS_PLATE_TIMEOUT = 14;

/**
 * How stripped the armour looks right now, 0..1 — the better of the two ways
 * it is coming off, so the shell always visibly erodes toward the next window.
 */
export function armorProgress(kills: number, sinceWindow: number): number {
    return Math.min(1, Math.max(kills / BOSS_PLATE_KILLS, sinceWindow / BOSS_PLATE_TIMEOUT));
}

/**
 * Anything the armour rule needs to know about a target.
 *
 * Keyed off its own flag rather than off `isBoss`, and that is not a detail.
 * Wave minibosses are bosses too, and armouring them would have made each one
 * take **seven times longer** to kill while one more spawns every sixty
 * seconds — the arena would fill with immortal landmarks. A miniboss is a fat
 * target in the middle of a fight; only the stage's final boss is a fight of
 * its own, and only it wears this.
 */
export interface Armoured {
    armored?: boolean;
    vulnerableFor?: number;
}

/**
 * Multiplier applied to every point of damage aimed at `target`.
 *
 * Lives in `DamageSystem.applyDamage` next to corrosion, so it catches every
 * source there is — weapons, perks, hazards, damage-over-time — without any of
 * them having to know a boss is a boss.
 */
export function armorMultiplierFor(target: Armoured): number {
    if (!target?.armored) return 1;
    return (target.vulnerableFor ?? 0) > 0 ? 1 : BOSS_ARMOR_ABSORB;
}

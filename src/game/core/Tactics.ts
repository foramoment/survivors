/**
 * TACTICS — powerups that change how the run plays instead of moving a number.
 *
 * The powerup pool used to be fourteen flat multipliers. Picking one never
 * changed a decision: +8% might and +9% area are the same card wearing
 * different hats, and one of them (projectile speed) was not even perceptible.
 * These four have a behaviour attached, so a build starts to have a shape.
 *
 *   Static Discharge — contact damage charges a capacitor that detonates
 *                      around you. The one perk that turns being surrounded
 *                      into an advantage.
 *   Kill Echo        — kills sometimes detonate. Rewards clearing fast.
 *   Adrenal Surge    — you hit harder and move faster while nearly dead.
 *   Vital Siphon     — kills sometimes drop a repair pickup. Healing you have
 *                      to walk to, so it can never turn into standing still.
 *
 * The numbers live here rather than in GameData so the balance of a mechanic
 * sits next to the rule it drives.
 */

/**
 * HP that must be absorbed before the capacitor fires. **Flat**, not per stack.
 *
 * It used to be `26 x stacks`, which made the perk's damage-per-second exactly
 * constant: the blast scaled with stacks and so did the wait, and the two
 * cancelled. Eight picks bought a lumpier version of one pick. Then the
 * internal cooldown below arrived and made it worse — with firing rate capped,
 * a bigger threshold could only ever be a downgrade.
 *
 * Flat threshold + scaling blast + a hard rate cap gives the perk one readable
 * promise: **every stack is a bigger bang, never a faster one.**
 */
export const DISCHARGE_CHARGE_COST = 26;
/** Blast radius, and its damage as a multiple of the stack count */
export const DISCHARGE_RADIUS = 190;
export const DISCHARGE_DAMAGE = 34;
export const DISCHARGE_KNOCKBACK = 420;
/** Extra blast radius per stack past the first, so the growth is visible */
export const DISCHARGE_RADIUS_PER_STACK = 0.07;

/**
 * Internal cooldown, in seconds — the capacitor cannot fire again inside this
 * window however fast it refills.
 *
 * The charge threshold alone was not a rate limit. Standing inside a late-game
 * crowd absorbs damage far faster than 26 HP/s per stack, so the perk fired
 * every few frames and the knockback became a permanent field pushing the whole
 * arena away. That is the failure mode every proc in an ARPG eventually finds,
 * and the standard fix is the one used here: charge keeps accumulating during
 * the window (nothing you absorbed is wasted), it simply cannot *discharge*
 * until the window is up.
 */
export const DISCHARGE_COOLDOWN = 3.5;

/**
 * Ceiling on stored charge, as a multiple of the firing threshold.
 *
 * Without it the capacitor banks the whole cooldown window and then fires
 * several times back-to-back the moment it opens — the same burst, just
 * delayed.
 */
export const DISCHARGE_CHARGE_CAP = 1.5;

/**
 * Kill Echo's blast, as a fraction of **the CURRENT HP of each enemy it hits**.
 *
 * Three designs, and the reasoning for landing here:
 *
 *   1. `0.55 x the corpse's max HP` — a fat body was a bomb. Kill one late
 *      elite inside a pack and it deleted the pack, then every one of those
 *      deaths rolled its own echo. A screen wipe.
 *   2. `0.18 x the victim's max HP` — fixes the fat-corpse spike, but leaves a
 *      hole the user spotted: bosses walk surrounded by trash, and each piece
 *      of trash you kill takes a flat 18% off the *boss's* enormous maximum.
 *      You melt a boss by farming its escort.
 *   3. Current HP, which is what this is. The same mechanic as Blade of the
 *      Ruined King in League — percent of *current* health, so it hits like a
 *      truck on something untouched and fades to nothing on something nearly
 *      dead. (The item's number moved around a lot across patches, somewhere
 *      in the 8–12% range; I would not trust a specific patch value from me.)
 *
 * Why it is the right tool: the damage **shrinks as the target weakens**, which
 * is precisely backwards from what a cascade needs. Combined with the rule
 * below that an echo can never land a killing blow, the perk physically cannot
 * chain — it softens, and your weapons finish. That also makes it a companion
 * to a build rather than a replacement for one.
 */
export const KILL_ECHO_DAMAGE_SHARE = 0.15;
/**
 * Bosses take a quarter, the same courtesy every stun source gives them. A
 * percent-of-current-health effect is at its strongest against exactly the kind
 * of health pool a boss has.
 */
export const KILL_ECHO_BOSS_RESIST = 0.25;
/**
 * Tightened from 84. Enemies travel packed together, so a generous radius here
 * is not "a blast" — it is "everything on top of the corpse", every time.
 */
export const KILL_ECHO_RADIUS = 62;
/** Burn left on survivors, as a share of their own max HP per second */
export const KILL_ECHO_BURN_SHARE = 0.05;

/** Below this share of max HP the adrenal bonus is live */
export const ADRENALINE_THRESHOLD = 0.35;

/** HP restored by one repair pickup, and how long it stays on the ground */
export const REPAIR_HEAL = 6;
export const REPAIR_LIFETIME = 12;

/**
 * Seconds without taking damage before regeneration starts again.
 *
 * This is what makes the whole regen model safe. `regen` is now a fraction of
 * **missing** health per second, which is the right shape — it is worth most
 * exactly when you are hurt, and nothing at all when you are full — but it has
 * an obvious failure mode: give it a generous number and standing next to a
 * single chaser becomes free again, which is precisely what the bite rework
 * just removed.
 *
 * Gating on being out of combat makes that **structurally impossible** rather
 * than numerically unlikely — the same move as "an echo can never land a
 * killing blow". Regeneration cannot out-heal a fight it is not allowed to run
 * during, so the number is free to be big enough to feel like something.
 *
 * It also gives the two healing sources genuinely different jobs, which they
 * did not have before: **repair cells work during a fight** (you break out, you
 * go and get one, they are flat and they top you off), **regen works between
 * fights** (automatic, fastest when you are worst hurt, and by its exponential
 * nature never quite finishes).
 */
export const REGEN_COMBAT_DELAY = 3;

/**
 * Bonus multiplier from Adrenal Surge — 1 while healthy, 1 + stacks while
 * bloodied. Applied to both damage and move speed so the perk reads as a
 * single "cornered animal" state rather than two effects.
 */
export function adrenalineMultiplier(hp: number, maxHp: number, adrenaline: number): number {
    if (adrenaline <= 0 || maxHp <= 0) return 1;
    if (hp / maxHp >= ADRENALINE_THRESHOLD) return 1;
    return 1 + adrenaline;
}

/**
 * Absorbed damage needed before the capacitor fires.
 *
 * Independent of stack count — see DISCHARGE_CHARGE_COST. Zero stacks is
 * unreachable, which is what stops the perk firing before it is picked.
 */
export function dischargeThreshold(stacks: number): number {
    return stacks > 0 ? DISCHARGE_CHARGE_COST : Infinity;
}

/** Blast radius at this stack count */
export function dischargeRadius(stacks: number): number {
    return DISCHARGE_RADIUS * (1 + Math.max(0, stacks - 1) * DISCHARGE_RADIUS_PER_STACK);
}

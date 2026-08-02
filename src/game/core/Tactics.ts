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

/** HP/s that must be absorbed per discharge stack before the capacitor fires */
export const DISCHARGE_CHARGE_COST = 26;
/** Blast radius, and its damage as a multiple of the stack count */
export const DISCHARGE_RADIUS = 190;
export const DISCHARGE_DAMAGE = 34;
export const DISCHARGE_KNOCKBACK = 420;

/**
 * Kill Echo's blast, as a fraction of the dead enemy's max HP.
 *
 * It was 0.55 and it chained. On a hard stage a late-tier corpse carries five
 * figures of HP, so one echo deleted everything near it, every one of those
 * deaths rolled its own echo, and a single detonation could clear the screen.
 * A player who had never built the perk before won a run on it by accident and
 * was — correctly — annoyed.
 *
 * Two things hold it now: this share is less than half what it was, and
 * `Enemy.echoed` stops an echo kill from echoing again (see
 * GameManager.killEcho). The chain was the real bug; the share is what makes a
 * single blast a hit rather than a wipe.
 */
export const KILL_ECHO_DAMAGE_SHARE = 0.22;
export const KILL_ECHO_RADIUS = 84;
/** Burn left on whatever survives the blast, as a share of the same HP */
export const KILL_ECHO_BURN_SHARE = 0.06;

/** Below this share of max HP the adrenal bonus is live */
export const ADRENALINE_THRESHOLD = 0.35;

/** HP restored by one repair pickup, and how long it stays on the ground */
export const REPAIR_HEAL = 6;
export const REPAIR_LIFETIME = 12;

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

/** HP/s of absorbed damage needed before the capacitor fires at this stack */
export function dischargeThreshold(stacks: number): number {
    return DISCHARGE_CHARGE_COST * stacks;
}

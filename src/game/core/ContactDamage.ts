/**
 * ContactDamage — how much a pile of enemies standing on the player costs
 * per second.
 *
 * This exists because contact damage used to be silently broken. GameManager
 * called `player.takeDamage(enemy.damage * dt)` — roughly 0.08 per frame — into
 * a method that did `Math.max(1, amount - armor)` and then granted 0.5s of
 * invulnerability. Three things followed:
 *
 *   1. every enemy dealt exactly 1 damage; the whole `damage` column of
 *      ENEMY_CONFIG was dead data
 *   2. `armor` was subtracted from 0.08 and hit the same floor, so it did
 *      literally nothing — the "+1 armor" powerup was a wasted pick
 *   3. i-frames capped ALL incoming damage at 2 HP/s no matter how many
 *      enemies were touching, so standing inside a crowd cost the same as
 *      brushing one bat
 *
 * Contact damage is now continuous (HP per second, no i-frames — those are for
 * discrete hits like meteors) and crowds genuinely stack:
 *
 *   - armor is applied PER ENEMY, so it is strong against many weak enemies
 *     and modest against one big one, with a floor so nothing is ever immune
 *   - overlapping enemies stack with 1/sqrt(k) falloff — the second body hurts
 *     70% as much as the first, the fourth 50% — because a mob pressed against
 *     the player only has so much surface to bite with
 *   - the total is capped at CROWD_CAP× the strongest attacker so a 40-enemy
 *     pile is lethal but not instant, and the player can still walk out
 */

/** Fraction of an enemy's damage that armor can never remove */
export const ARMOR_FLOOR = 0.2;

/** Hard ceiling on crowd stacking, as a multiple of the strongest attacker */
export const CROWD_CAP = 4;

/** Weight of the k-th strongest attacker (k = 0 is the strongest) */
export function crowdWeight(k: number): number {
    return 1 / Math.sqrt(k + 1);
}

/**
 * Total contact damage per second from every enemy currently overlapping the
 * player. `damages` are the raw per-second values of those enemies.
 */
export function contactDamagePerSecond(damages: number[], armor: number): number {
    if (damages.length === 0) return 0;

    const reduced = damages
        .map(d => Math.max(d * ARMOR_FLOOR, d - armor))
        .sort((a, b) => b - a);

    let total = 0;
    for (let k = 0; k < reduced.length; k++) {
        total += reduced[k] * crowdWeight(k);
    }

    return Math.min(total, reduced[0] * CROWD_CAP);
}

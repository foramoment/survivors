/**
 * DAMAGE SYSTEM - Centralized damage calculation and events
 * 
 * All damage flows through this system for consistent:
 * - Critical hit calculation
 * - Damage modifiers (might, armor)
 * - Event emission for damage numbers
 * - Future: status effects, damage types
 * 
 * USAGE:
 *   // From weapon (crit + might applied):
 *   damageSystem.dealDamage({ baseDamage: 10, source: weapon, target: enemy, position: enemy.pos })
 *   
 *   // From zone with pre-calculated damage (no modifiers):
 *   damageSystem.dealDamage({ baseDamage: 50, source: null, target: enemy, position: enemy.pos, skipModifiers: true })
 */
import type { Vector2 } from '../../engine/Utils';
import { events } from '../../engine/EventBus';
import { armorMultiplierFor } from './BossArmor';

export interface DamageParams {
    baseDamage: number;
    source: any;        // Weapon, projectile, or zone
    target: any;        // Enemy
    position: Vector2;  // Where to show damage number
    skipModifiers?: boolean;  // If true, skip crit/might (for pre-calculated damage)
}

/**
 * There is no global damage multiplier, and there must never be one again.
 *
 * There used to be `GLOBAL_DAMAGE = 2` here — the fossil of an older bug where
 * the crit branch read `isCrit ? critDamage : 2`, doubling every *normal* hit.
 * Removing the doubling would have halved the game, so it was kept as an
 * explicit constant. That was the right call at the time and the wrong thing to
 * live with: it meant every number the UI could show was half of what the
 * player saw. A weapon card promising "36 damage" landed for 95, and no amount
 * of honest UI work could fix that, because the lie was in the damage pipeline.
 *
 * It is gone, and enemy health was rebased by the same factor in the same
 * commit, so time-to-kill did not move — only the size of the digits.
 *
 * **The invariant this buys: one point of weapon damage is one point of enemy
 * health.** Anything a weapon, perk or class advertises is what lands. If a
 * future change ever wants "everything hits harder", it belongs in the weapon
 * table or in `might`, where it is visible — not in a constant here.
 */

export interface DamageResult {
    finalDamage: number;
    isCrit: boolean;
    killed: boolean;
}

/**
 * Which weapon a hit came from.
 *
 * The id lives on the weapon, but the thing that landed the hit is usually a
 * projectile or a zone the weapon spawned — hence the two hops. Environmental
 * damage (a meteor, a rift collapsing) has no weapon and returns null, which is
 * a real answer: the arena killed that one, not the build.
 */
export function weaponIdOf(source: any): string | null {
    return source?.weaponId ?? source?.source?.weaponId ?? null;
}

class DamageSystemClass {
    /**
     * Deal damage from a weapon/projectile to an enemy
     * This is the main damage method - all damage should go through here.
     */
    dealDamage(params: DamageParams): DamageResult {
        const { baseDamage, source, target, position, skipModifiers = false } = params;

        // If skipModifiers, just deal raw damage (for zones with pre-calculated damage)
        if (skipModifiers) {
            return this.applyDamage(baseDamage, target, position, false, source);
        }

        // Get player stats (owner of weapon)
        const player = this.getPlayer(source);
        if (!player) {
            // Fallback: just deal raw damage
            return this.applyDamage(baseDamage, target, position, false, source);
        }

        // Calculate crit
        const isCrit = Math.random() < player.stats.critChance;
        const critMultiplier = isCrit ? player.stats.critDamage : 1;

        // `effectiveMight` is the seam for conditional damage bonuses; plain
        // `stats.might` is the fallback for the mock owners used in tests
        const might = player.effectiveMight ?? player.stats.might;
        const opener = 1 + this.openerBonus(player, target);
        const finalDamage = baseDamage * might * critMultiplier * opener;

        return this.applyDamage(finalDamage, target, position, isCrit, source);
    }



    /**
     * First Strike: extra damage against a target still at full health.
     *
     * The one damage bonus in the game that cannot feed a cascade. It applies
     * to the *opening* hit and nothing else, so it can never help finish
     * anything, never compounds with itself, and never turns a wounded pack
     * into a chain reaction — the failure mode every other on-hit multiplier we
     * have tried eventually found.
     *
     * What it changes is aim: it rewards spreading damage across fresh bodies
     * rather than dumping everything into whatever is already dying, which is
     * the opposite of how the auto-targeting weapons naturally behave.
     *
     * A hair of slack on the "full health" test, because damage-over-time ticks
     * can shave a fraction off a target between the shot and the hit.
     */
    private openerBonus(player: any, target: any): number {
        const bonus = player.stats?.firstStrike ?? 0;
        if (bonus <= 0 || !target?.maxHp) return 0;
        return target.hp >= target.maxHp * 0.999 ? bonus : 0;
    }

    /**
     * Internal method to apply damage and emit events
     */
    private applyDamage(damage: number, target: any, position: Vector2, isCrit: boolean, source: any = null): DamageResult {
        const wasAlive = !target.isDead;

        // Corrosion amplifies EVERY source, including infection ticks and
        // environmental hazards — applied here rather than in dealDamage so a
        // `skipModifiers` hit still benefits. That is what makes acid a setup
        // tool instead of just another damage-over-time.
        //
        // Boss armour divides in the same place and for the same reason: a
        // boss is armoured against *everything* until its escort has been
        // cleared, and no weapon, perk or hazard should have to know that.
        const finalDamage = damage
            * (1 + (target.corrosion?.amp ?? 0))
            * armorMultiplierFor(target);

        // Stamped on every hit, so whatever is here when the target dies is the
        // weapon that landed the killing blow. This is the only place that sees
        // both the source and the target; the run's kill attribution reads it
        // out of the death loop in GameManager.
        target.lastHitBy = weaponIdOf(source);

        target.takeDamage(finalDamage);
        const killed = wasAlive && target.isDead;

        // Emit event for damage tracking
        events.emit({
            type: 'ENEMY_DAMAGED',
            enemy: target,
            damage: finalDamage,
            source: null
        });

        // Emit damage number
        this.emitDamageNumber(position, finalDamage, isCrit, source);

        return { finalDamage, isCrit, killed };
    }

    /**
     * Calculate damage without applying (for preview/tooltips)
     */
    calculateDamage(baseDamage: number, player: any): { damage: number, isCrit: boolean } {
        const isCrit = Math.random() < player.stats.critChance;
        const critMultiplier = isCrit ? player.stats.critDamage : 1;
        const damage = baseDamage * player.stats.might * critMultiplier;
        return { damage, isCrit };
    }

    /**
     * Emit damage number event
     */
    private emitDamageNumber(pos: Vector2, amount: number, isCrit: boolean, source: any) {
        (this as any)._onDamageNumber?.(pos, amount, isCrit, source);
    }

    /**
     * Set the callback for damage number display.
     * `source` rides along so the run's best-hit record can name the weapon —
     * this is the only place that knows which one landed the blow.
     */
    setDamageNumberCallback(
        callback: (pos: Vector2, amount: number, isCrit: boolean, source: any) => void
    ) {
        (this as any)._onDamageNumber = callback;
    }

    /**
     * Get player from source (weapon or projectile)
     */
    private getPlayer(source: any): any {
        // Try direct owner (weapon.owner = player)
        if (source?.owner?.stats) {
            return source.owner;
        }
        // Try source.source (projectile/zone -> weapon)
        if (source?.source?.owner?.stats) {
            return source.source.owner;
        }
        // Try source.owner.owner (legacy projectile -> weapon -> player)
        if (source?.owner?.owner?.stats) {
            return source.owner.owner;
        }
        return null;
    }
}

// Singleton instance
export const damageSystem = new DamageSystemClass();

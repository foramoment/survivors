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
import type { Vector2 } from './Utils';
import { events } from './EventBus';

export interface DamageParams {
    baseDamage: number;
    source: any;        // Weapon, projectile, or zone
    target: any;        // Enemy
    position: Vector2;  // Where to show damage number
    skipModifiers?: boolean;  // If true, skip crit/might (for pre-calculated damage)
}

/**
 * Flat multiplier on every modified hit.
 *
 * History: the crit branch used to read `isCrit ? critDamage : 2`, so *normal*
 * hits were doubled and a default 1.5x crit landed for LESS than a normal hit.
 * The whole game was balanced around that doubling, so the fix keeps it — as an
 * explicit global multiplier — and lets the crit multiplier stack on top of it
 * instead of replacing it. Non-crit damage is unchanged; a crit is now
 * genuinely critDamage times stronger than a normal hit.
 */
export const GLOBAL_DAMAGE = 2;

export interface DamageResult {
    finalDamage: number;
    isCrit: boolean;
    killed: boolean;
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

        // `effectiveMight` folds in conditional bonuses (Adrenal Surge); plain
        // `stats.might` is the fallback for the mock owners used in tests
        const might = player.effectiveMight ?? player.stats.might;
        const finalDamage = baseDamage * might * GLOBAL_DAMAGE * critMultiplier;

        return this.applyDamage(finalDamage, target, position, isCrit, source);
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
        const finalDamage = damage * (1 + (target.corrosion?.amp ?? 0));

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
        const damage = baseDamage * player.stats.might * GLOBAL_DAMAGE * critMultiplier;
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

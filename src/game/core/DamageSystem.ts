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
 *   damageSystem.dealRawDamage(enemy, 50, enemy.pos)
 */
import { type Vector2 } from './Utils';
import { events } from './EventBus';

export interface DamageParams {
    baseDamage: number;
    source: any;        // Weapon, projectile, or zone
    target: any;        // Enemy
    position: Vector2;  // Where to show damage number
    skipModifiers?: boolean;  // If true, skip crit/might (for pre-calculated damage)
}

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
            return this.applyDamage(baseDamage, target, position, false);
        }

        // Get player stats (owner of weapon)
        const player = this.getPlayer(source);
        if (!player) {
            // Fallback: just deal raw damage
            return this.applyDamage(baseDamage, target, position, false);
        }

        // Calculate crit
        const isCrit = Math.random() < player.stats.critChance;
        const critMultiplier = isCrit ? player.stats.critDamage : 1;

        // Calculate final damage
        const finalDamage = baseDamage * player.stats.might * critMultiplier;

        return this.applyDamage(finalDamage, target, position, isCrit);
    }

    /**
     * Deal raw damage without any modifiers.
     * Use this for zones/effects with pre-calculated damage.
     */
    dealRawDamage(target: any, damage: number, position: Vector2, isCrit: boolean = false): DamageResult {
        return this.applyDamage(damage, target, position, isCrit);
    }

    /**
     * Internal method to apply damage and emit events
     */
    private applyDamage(damage: number, target: any, position: Vector2, isCrit: boolean): DamageResult {
        const wasAlive = !target.isDead;
        target.takeDamage(damage);
        const killed = wasAlive && target.isDead;

        // Emit event for damage tracking
        events.emit({
            type: 'ENEMY_DAMAGED',
            enemy: target,
            damage: damage,
            source: null
        });

        // Emit damage number
        this.emitDamageNumber(position, damage, isCrit);

        return { finalDamage: damage, isCrit, killed };
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
    private emitDamageNumber(pos: Vector2, amount: number, isCrit: boolean) {
        (this as any)._onDamageNumber?.(pos, amount, isCrit);
    }

    /**
     * Set the callback for damage number display
     */
    setDamageNumberCallback(callback: (pos: Vector2, amount: number, isCrit: boolean) => void) {
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
        // Try source.owner.owner (projectile -> weapon -> player)
        if (source?.owner?.owner?.stats) {
            return source.owner.owner;
        }
        return null;
    }
}

// Singleton instance
export const damageSystem = new DamageSystemClass();

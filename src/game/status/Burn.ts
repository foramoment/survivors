/**
 * BURN - Damage over time effect
 * 
 * Deals periodic fire damage with visual feedback.
 * Damage can crit through source weapon.
 */
import { StatusEffect } from './StatusEffect';
import type { Enemy } from '../entities/Enemy';
import type { Weapon } from '../Weapon';
import { damageSystem } from '../core/DamageSystem';
import { particles } from '../core/ParticleSystem';

export class Burn extends StatusEffect {
    damagePerTick: number;
    tickInterval: number = 0.5;
    private tickTimer: number = 0;

    constructor(duration: number, damagePerTick: number, source: Weapon | null = null) {
        super(duration, source);
        this.damagePerTick = damagePerTick;
    }

    update(dt: number, target: Enemy) {
        this.duration -= dt;
        this.tickTimer += dt;

        if (this.tickTimer >= this.tickInterval) {
            this.tickTimer -= this.tickInterval;

            damageSystem.dealDamage({
                baseDamage: this.damagePerTick,
                source: this.source,
                target: target,
                position: target.pos
            });

            // Fire visual effect
            particles.emitFire(target.pos.x, target.pos.y);
        }
    }
}

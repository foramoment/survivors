/**
 * BASE WEAPON CLASSES
 * Abstract weapon types for projectile and zone weapons.
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import type { Vector2 } from '../../core/Utils';
import { Projectile } from './Projectile';
import { Zone } from './Zone';

// ============================================
// PROJECTILE PARAMS - For factory method
// ============================================
export interface ProjectileParams {
    x: number;
    y: number;
    velocity: Vector2;
    duration: number;
    damage: number;
    pierce: number;
    emoji: string;
}

// ============================================
// PROJECTILE WEAPON - Fires projectiles at enemies
// ============================================
export abstract class ProjectileWeapon extends Weapon {
    abstract projectileEmoji: string;
    abstract pierce: number;

    update(dt: number) {
        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();
            if (target) {
                this.fire(target);
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }

    fire(target: Entity) {
        const velocity = this.calculateVelocityToTarget(target);

        const proj = this.createProjectile({
            x: this.owner.pos.x,
            y: this.owner.pos.y,
            velocity,
            duration: this.duration * this.owner.stats.duration,
            damage: this.damage,
            pierce: this.pierce,
            emoji: this.projectileEmoji
        });
        proj.source = this;

        this.onProjectileCreated(proj);
        this.onSpawn(proj);
    }

    /**
     * Factory method for creating projectiles.
     * Override to create different projectile types (BouncingProjectile, PlasmaProjectile, etc.)
     */
    protected createProjectile(params: ProjectileParams): Projectile {
        return new Projectile(
            params.x, params.y, params.velocity,
            params.duration, params.damage, params.pierce, params.emoji
        );
    }

    /**
     * Hook called after projectile is created but before spawning.
     * Override to add evolved behavior or callbacks.
     */
    protected onProjectileCreated(_proj: Projectile): void { }
}

// ============================================
// ZONE WEAPON - Creates damage zones
// ============================================
export abstract class ZoneWeapon extends Weapon {
    abstract zoneEmoji: string;
    abstract interval: number;

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            this.spawnZone();
            this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
        }
    }

    spawnZone() {
        const baseInterval = Math.max(0.1, this.interval - this.owner.stats.tick);

        const zone = new Zone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * this.owner.stats.area,
            this.duration * this.owner.stats.duration,
            this.damage,
            Math.max(0.01, baseInterval),
            this.zoneEmoji
        );
        zone.source = this;
        this.onSpawn(zone);
    }
}

/**
 * BASE WEAPON CLASSES
 * Abstract weapon types for projectile and zone weapons.
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2, normalize, distance } from '../../core/Utils';
import { Projectile } from './Projectile';
import { Zone } from './Zone';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// PROJECTILE WEAPON - Fires projectiles at enemies
// ============================================
export abstract class ProjectileWeapon extends Weapon {
    abstract projectileEmoji: string;
    abstract pierce: number;

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = Infinity;

            const searchRadius = this.area * (this.owner as any).stats.area;
            const nearby = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of nearby) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < searchRadius && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    fire(target: Entity) {
        const dir = normalize({
            x: target.pos.x - this.owner.pos.x,
            y: target.pos.y - this.owner.pos.y
        });

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);

        const proj = new Projectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            damage,
            this.pierce,
            this.projectileEmoji
        );

        this.onSpawn(proj);
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// ============================================
// ZONE WEAPON - Creates damage zones
// ============================================
export abstract class ZoneWeapon extends Weapon {
    abstract zoneEmoji: string;
    abstract interval: number;

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            this.spawnZone();
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    spawnZone() {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const baseInterval = Math.max(0.1, this.interval - (this.owner as any).stats.tick);
        const boostedInterval = baseInterval / speedBoost;

        const { damage } = (this.owner as any).getDamage(this.damage);

        const zone = new Zone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * (this.owner as any).stats.area,
            this.duration * (this.owner as any).stats.duration,
            damage,
            Math.max(0.01, boostedInterval),
            this.zoneEmoji
        );
        this.onSpawn(zone);
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

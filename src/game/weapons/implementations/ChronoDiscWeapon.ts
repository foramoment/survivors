/**
 * CHRONO DISC WEAPON
 * Ricochet disc that bounces between enemies.
 */
import { ProjectileWeapon, BouncingProjectile } from '../base';
import { Entity } from '../../Entity';
import { distance } from '../../core/Utils';
import { WEAPON_STATS } from '../../data/GameData';
import { levelSpatialHash } from '../../core/SpatialHash';

export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 0;
    private stats = WEAPON_STATS['chrono_disc'];
    private pendingDiscs: { delay: number; target: Entity }[] = [];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        for (let i = this.pendingDiscs.length - 1; i >= 0; i--) {
            this.pendingDiscs[i].delay -= dt;
            if (this.pendingDiscs[i].delay <= 0) {
                this.fire(this.pendingDiscs[i].target);
                this.pendingDiscs.splice(i, 1);
            }
        }

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
                const count = (this.stats.count || 1) + Math.floor((this.level - 1) * (this.stats.countScaling || 0));

                this.fire(target);

                for (let i = 1; i < count; i++) {
                    this.pendingDiscs.push({
                        delay: i * 0.2,
                        target: target
                    });
                }

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const bounces = (this.stats.pierce || 5) + this.level;

        const projectile = new BouncingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            (this.owner as any).getDamage(this.damage).damage,
            bounces,
            this.projectileEmoji,
            this.stats.area
        );

        this.onSpawn(projectile);
    }

    // Uses base class upgrade()
}

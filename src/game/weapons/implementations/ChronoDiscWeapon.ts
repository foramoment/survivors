/**
 * CHRONO DISC WEAPON
 * Ricochet disc that bounces between enemies.
 */
import { ProjectileWeapon, BouncingProjectile } from '../base';
import { Entity } from '../../Entity';
import { distance } from '../../core/Utils';
import { levelSpatialHash } from '../../core/SpatialHash';

export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 0;
    private pendingDiscs: { delay: number; target: Entity }[] = [];

    static readonly CONFIG = {
        damage: 25,
        cooldown: 2.5,
        area: 400,
        speed: 500,
        duration: 5,
        pierce: 5,
        count: 1,
        countScaling: 1,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = ChronoDiscWeapon.CONFIG.cooldown;
        this.damage = ChronoDiscWeapon.CONFIG.damage;
        this.speed = ChronoDiscWeapon.CONFIG.speed;
        this.duration = ChronoDiscWeapon.CONFIG.duration;
        this.pierce = ChronoDiscWeapon.CONFIG.pierce || 3;
        this.area = ChronoDiscWeapon.CONFIG.area;
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
                const count = (ChronoDiscWeapon.CONFIG.count || 1) + Math.floor((this.level - 1) * (ChronoDiscWeapon.CONFIG.countScaling || 0));

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

        const bounces = (ChronoDiscWeapon.CONFIG.pierce || 5) + this.level;

        const projectile = new BouncingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            (this.owner as any).getDamage(this.damage).damage,
            bounces,
            this.projectileEmoji,
            this.area
        );

        this.onSpawn(projectile);
    }

    // Uses base class upgrade()
}

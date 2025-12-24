/**
 * CHRONO DISC WEAPON
 * Ricochet disc that bounces between enemies.
 */
import { ProjectileWeapon, BouncingProjectile } from '../base';
import { Entity } from '../../Entity';

export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 5;
    private pendingDiscs: { delay: number; target: Entity }[] = [];

    readonly stats = {
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
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
        this.pierce = this.stats.pierce;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        this.cooldown -= dt * speedBoost;

        for (let i = this.pendingDiscs.length - 1; i >= 0; i--) {
            this.pendingDiscs[i].delay -= dt;
            if (this.pendingDiscs[i].delay <= 0) {
                this.fire(this.pendingDiscs[i].target);
                this.pendingDiscs.splice(i, 1);
            }
        }

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

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

    fire(target: Entity) {
        const velocity = this.calculateVelocityToTarget(target);
        const bounces = this.stats.pierce + this.level;

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
}

/**
 * PLASMA CANNON WEAPON
 * Fires massive explosive plasma rounds.
 * 
 * Evolved: Fusion Core - Creates pull zone on explosion
 */
import { ProjectileWeapon, PlasmaProjectile } from '../base';
import { Entity } from '../../Entity';
import { distance } from '../../core/Utils';
import { FusionCoreSingularity } from '../EvolutionTypes';
import { WEAPON_STATS } from '../../data/GameData';
import { levelSpatialHash } from '../../core/SpatialHash';

export class PlasmaCannonWeapon extends ProjectileWeapon {
    name = "Plasma Cannon";
    emoji = "🔋";
    description = "Fires massive explosive plasma rounds.";
    projectileEmoji = "🟢";
    pierce = 999;
    private stats = WEAPON_STATS['plasma_cannon'];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = this.area * (this.owner as any).stats.area;

            const searchRadius = minDst;
            const potentialTargets = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of potentialTargets) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);
                const cdMultiplier = this.evolved ? 1.4 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
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

        const { damage } = (this.owner as any).getDamage(this.damage);
        const isEvolved = this.evolved;

        const plasma = new PlasmaProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration,
            damage,
            1
        );

        if (isEvolved) {
            plasma.onExplosion = (x: number, y: number) => {
                const pullZone = new FusionCoreSingularity(x, y, damage * 0.15);
                this.onSpawn(pullZone);
            };
        }

        this.onSpawn(plasma);
    }

    // Uses base class upgrade()
}

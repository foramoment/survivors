/**
 * SINGULARITY ORB WEAPON
 * Slow moving orb that pulls enemies.
 * 
 * Evolved: Black Hole - Creates black hole zone on death
 */
import { ProjectileWeapon, SingularityProjectile } from '../base';
import { Entity } from '../../Entity';
import { distance } from '../../core/Utils';
import { BlackHoleProjectile, BlackHoleZone } from '../EvolutionTypes';
import { WEAPON_STATS } from '../../data/GameData';
import { levelSpatialHash } from '../../core/SpatialHash';

export class SingularityOrbWeapon extends ProjectileWeapon {
    name = "Singularity Orb";
    emoji = "⚫";
    description = "Slow moving orb of destruction.";
    projectileEmoji = "";
    pierce = 999;
    private stats = WEAPON_STATS['singularity_orb'];
    private activeBlackHole: any = null;
    private waitingForCollapse: boolean = false;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        const isEvolved = this.evolved;

        if (isEvolved && this.waitingForCollapse) {
            if (this.activeBlackHole && this.activeBlackHole.isDead) {
                this.waitingForCollapse = false;
                this.activeBlackHole = null;
            }
            return;
        }

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = this.area * (this.owner as any).stats.area;

            const searchRadius = minDst;
            const nearbyEnemies = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of nearbyEnemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);
                const cdMultiplier = isEvolved ? 2.0 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: Entity) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);
        const isEvolved = this.evolved;

        if (isEvolved) {
            const proj = new BlackHoleProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * (this.owner as any).stats.duration,
                damage,
                this.pierce
            );

            proj.onDeath = (x: number, y: number) => {
                const zone = new BlackHoleZone(x, y, 100, 3.0, damage * 0.2);
                this.activeBlackHole = zone;
                this.onSpawn(zone);
            };

            this.waitingForCollapse = true;
            this.onSpawn(proj);
        } else {
            const proj = new SingularityProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * (this.owner as any).stats.duration,
                damage,
                this.pierce
            );
            proj.pullStrength = 80;
            this.onSpawn(proj);
        }
    }

    // Uses base class upgrade()
}

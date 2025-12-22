/**
 * ACID POOL WEAPON
 * Throws acid flasks that create damaging puddles.
 */
import { Weapon } from '../../Weapon';
import { type Vector2, distance } from '../../core/Utils';
import { LobbedProjectile, AcidZone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { WEAPON_STATS } from '../../data/GameData';
import { levelSpatialHash } from '../../core/SpatialHash';

export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Throws acid flasks that create puddles.";
    private stats = WEAPON_STATS['acid_pool'];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            let target: any = null;
            let minDst = Infinity;

            const searchRadius = 500;
            const nearby = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of nearby) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < searchRadius && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                const lob = new LobbedProjectile(
                    this.owner.pos.x,
                    this.owner.pos.y,
                    target.pos,
                    0.8,
                    '🧪'
                );

                lob.onLand = (x, y) => {
                    particles.emitPoison(x, y);
                    const zone = new AcidZone(
                        x, y,
                        this.area * (this.owner as any).stats.area,
                        this.stats.duration * (this.owner as any).stats.duration,
                        (this.owner as any).getDamage(this.damage).damage,
                        0.5
                    );
                    this.onSpawn(zone);
                };

                this.onSpawn(lob);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

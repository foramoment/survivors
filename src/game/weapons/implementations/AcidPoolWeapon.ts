/**
 * ACID POOL WEAPON
 * Throws acid flasks that create damaging puddles.
 */
import { Weapon } from '../../Weapon';
import { type Vector2, distance } from '../../core/Utils';
import { LobbedProjectile, AcidZone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Throws acid flasks that create puddles.";

    static readonly CONFIG = {
        damage: 10,
        cooldown: 2.0,
        area: 80,
        speed: 0,
        duration: 3.0,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = AcidPoolWeapon.CONFIG.cooldown;
        this.damage = AcidPoolWeapon.CONFIG.damage;
        this.area = AcidPoolWeapon.CONFIG.area;
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
                        AcidPoolWeapon.CONFIG.duration * (this.owner as any).stats.duration,
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

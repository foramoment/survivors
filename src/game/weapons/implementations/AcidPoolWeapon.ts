/**
 * ACID POOL WEAPON
 * Throws acid flasks that create damaging puddles.
 */
import { Weapon } from '../../Weapon';
import { LobbedProjectile, AcidZone } from '../base';
import { particles } from '../../core/ParticleSystem';

export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Throws acid flasks that create puddles.";

    readonly stats = {
        damage: 10,
        cooldown: 2.0,
        area: 80,
        speed: 0,
        duration: 3.0,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        this.cooldown -= dt * speedBoost;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy(500);

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
}

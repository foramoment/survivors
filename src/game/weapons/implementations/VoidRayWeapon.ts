/**
 * VOID RAY WEAPON
 * Fires a powerful charging beam at enemies.
 * 
 * Evolved: Void Cannon - Double damage, wider beam
 */
import { Weapon } from '../../Weapon';
import { VoidRayBeam } from '../base';

export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a powerful charging beam.";

    readonly stats = {
        damage: 25,
        cooldown: 2.0,
        area: 1,
        speed: 0,
        duration: 0.5,
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
            const target = this.findClosestEnemy(600);

            if (target) {
                const isEvolved = this.evolved;
                const result = (this.owner as any).getDamage(this.damage);
                const damage = result.damage * (isEvolved ? 2 : 1);
                const isCrit = result.isCrit;

                const beam = new VoidRayBeam(
                    this.owner,
                    target,
                    damage,
                    isEvolved,
                    (pos, amount) => this.onDamage(pos, amount, isCrit)
                );
                this.onSpawn(beam);

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }
}

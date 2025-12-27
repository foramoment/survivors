/**
 * SPINNING EMBER WEAPON
 * Fireballs that orbit around the player.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { OrbitingProjectile } from '../base';

export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: OrbitingProjectile[] = [];

    readonly stats = {
        damage: 15,
        cooldown: 3.0,
        area: 100,
        speed: 3,
        duration: 4,
        count: 2,
        countScaling: 1,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
    }

    update(dt: number) {
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = this.owner.weaponSpeedBoost || 1;
        this.cooldown -= dt * speedBoost;
        if (this.cooldown <= 0) {
            const count = (this.stats.count || 2) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
            const duration = this.stats.duration * this.owner.stats.duration;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const proj = new OrbitingProjectile(
                    this.owner,
                    this.stats.area,
                    this.stats.speed,
                    duration,
                    this.owner.getDamage(this.damage).damage,
                    '🔥'
                );
                proj.angle = angle;
                this.onSpawn(proj);
                this.projectiles.push(proj);
            }

            this.cooldown = this.baseCooldown * this.owner.stats.cooldown + duration;
        }
    }
}

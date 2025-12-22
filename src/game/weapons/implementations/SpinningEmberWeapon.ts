/**
 * SPINNING EMBER WEAPON
 * Fireballs that orbit around the player.
 */
import { Weapon } from '../../Weapon';
import { type Vector2 } from '../../core/Utils';
import { OrbitingProjectile } from '../base';

export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: OrbitingProjectile[] = [];

    static readonly CONFIG = {
        damage: 15,
        cooldown: 3.0,
        area: 100,
        speed: 3,
        duration: 4,
        count: 2,
        countScaling: 1,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = SpinningEmberWeapon.CONFIG.cooldown;
        this.damage = SpinningEmberWeapon.CONFIG.damage;
    }

    update(dt: number) {
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const count = (SpinningEmberWeapon.CONFIG.count || 2) + Math.floor((this.level - 1) * (SpinningEmberWeapon.CONFIG.countScaling || 1));
            const duration = SpinningEmberWeapon.CONFIG.duration * (this.owner as any).stats.duration;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const proj = new OrbitingProjectile(
                    this.owner,
                    SpinningEmberWeapon.CONFIG.area,
                    SpinningEmberWeapon.CONFIG.speed,
                    duration,
                    (this.owner as any).getDamage(this.damage).damage,
                    '🔥'
                );
                proj.angle = angle;
                this.onSpawn(proj);
                this.projectiles.push(proj);
            }

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown + duration;
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

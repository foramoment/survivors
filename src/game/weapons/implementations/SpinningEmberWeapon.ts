/**
 * SPINNING EMBER WEAPON
 * Fireballs that orbit around the player.
 */
import { Weapon } from '../../Weapon';
import { type Vector2 } from '../../core/Utils';
import { OrbitingProjectile } from '../base';
import { WEAPON_STATS } from '../../data/GameData';

export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: OrbitingProjectile[] = [];
    private stats = WEAPON_STATS['spinning_ember'];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
    }

    update(dt: number) {
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            const count = (this.stats.count || 2) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
            const duration = this.stats.duration * (this.owner as any).stats.duration;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const proj = new OrbitingProjectile(
                    this.owner,
                    this.stats.area,
                    this.stats.speed,
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

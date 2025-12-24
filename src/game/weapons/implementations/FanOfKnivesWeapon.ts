/**
 * FAN OF KNIVES WEAPON
 * Fires a spread of knives at enemies.
 */
import { ProjectileWeapon, Projectile } from '../base';

export class FanOfKnivesWeapon extends ProjectileWeapon {
    name = "Fan of Knives";
    emoji = "🗡️";
    description = "Fires a spread of knives.";
    projectileEmoji = "🗡️";
    pierce = 2;

    readonly stats = {
        damage: 12,
        cooldown: 1.5,
        area: 0,
        speed: 700,
        duration: 1.5,
        pierce: 2,
        count: 3,
        countScaling: 0.5,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
        this.area = this.stats.area;
        this.pierce = this.stats.pierce;
    }

    fire(target: any) {
        const count = (this.stats.count || 3) + Math.floor((this.level - 1) * (this.stats.countScaling || 0.5));
        const spread = Math.PI / 4;

        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const baseAngle = Math.atan2(dir.y, dir.x);

        for (let i = 0; i < count; i++) {
            const offset = count > 1 ? -spread / 2 + (spread / (count - 1)) * i : 0;
            const angle = baseAngle + offset;

            const velocity = {
                x: Math.cos(angle) * this.speed * (this.owner as any).stats.speed,
                y: Math.sin(angle) * this.speed * (this.owner as any).stats.speed
            };

            const proj = new Projectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * (this.owner as any).stats.duration,
                (this.owner as any).getDamage(this.damage).damage,
                this.pierce,
                this.projectileEmoji
            );
            this.onSpawn(proj);
        }
    }
}

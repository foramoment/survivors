/**
 * NANOBOT SWARM WEAPON
 * Swarm of nanobots that damage enemies around the player.
 */
import { Weapon } from '../../Weapon';
import { type Vector2 } from '../../core/Utils';
import { NanobotCloud } from '../base';

export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Swarm of nanobots that devour enemies.";
    private activeCloud: NanobotCloud | null = null;

    static readonly CONFIG = {
        damage: 0.8,
        cooldown: 0.5,
        area: 1.0,
        speed: 0,
        duration: 5,
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = NanobotSwarmWeapon.CONFIG.cooldown;
        this.damage = NanobotSwarmWeapon.CONFIG.damage;
        this.duration = NanobotSwarmWeapon.CONFIG.duration;
        this.area = NanobotSwarmWeapon.CONFIG.area;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.activeCloud && this.activeCloud.isDead) {
            this.activeCloud = null;
        }

        if (this.cooldown <= 0 && !this.activeCloud) {
            const radius = 60 + this.level * 10 * (this.owner as any).stats.area;
            const baseInterval = Math.max(0.1, 0.5 - (this.owner as any).stats.tick);
            const boostedInterval = baseInterval / speedBoost;

            const cloud = new NanobotCloud(
                this.owner,
                radius,
                this.duration * (this.owner as any).stats.duration,
                (this.owner as any).getDamage(this.damage).damage,
                Math.max(0.05, boostedInterval)
            );
            this.onSpawn(cloud);
            this.activeCloud = cloud;

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    // Uses base class upgrade()

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

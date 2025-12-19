/**
 * NANOBOT SWARM WEAPON
 * Swarm of nanobots that damage enemies around the player.
 */
import { Weapon } from '../../Weapon';
import { Entity } from '../../Entity';
import { type Vector2 } from '../../core/Utils';
import { NanobotCloud } from '../base';
import { WEAPON_STATS } from '../../data/GameData';

function getStats(weaponId: string) {
    return WEAPON_STATS[weaponId] || {
        damage: 10, cooldown: 1.0, area: 100, speed: 0, duration: 1.0
    };
}

export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Swarm of nanobots that devour enemies.";
    private activeCloud: NanobotCloud | null = null;
    private stats = getStats('nanobot_swarm');

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.duration = this.stats.duration;
        this.area = this.stats.area;
    }

    update(dt: number, _enemies: Entity[]) {
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

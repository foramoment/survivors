/**
 * NANOBOT SWARM WEAPON
 * Swarm of nanobots that damage enemies around the player.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { NanobotCloud } from '../base';

export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Swarm of nanobots that devour enemies.";
    private activeCloud: NanobotCloud | null = null;

    readonly stats = {
        damage: 5,
        cooldown: 4,
        area: 1.0,
        speed: 0,
        duration: 5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.duration = this.stats.duration;
        this.area = this.stats.area;
    }

    update(dt: number) {
        // Check if the active cloud has expired
        if (this.activeCloud && this.activeCloud.isDead) {
            this.activeCloud = null;
        }

        // Cooldown only ticks when there's no active cloud
        if (!this.activeCloud) {
            this.cooldown -= dt;
        }

        if (this.cooldown <= 0 && !this.activeCloud) {
            const radius = 60 + this.level * 10 * this.owner.stats.area;
            const baseInterval = Math.max(0.1, 0.5 - this.owner.stats.tick);

            const cloud = new NanobotCloud(
                this.owner,
                radius,
                this.duration * this.owner.stats.duration,
                this.owner.getDamage(this.damage).damage,
                Math.max(0.05, baseInterval)
            );
            this.onSpawn(cloud);
            this.activeCloud = cloud;

            this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
        }
    }
}

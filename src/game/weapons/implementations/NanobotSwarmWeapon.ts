/**
 * NANOBOT SWARM WEAPON
 *
 * An aura of nanites that grinds down anything standing next to the player.
 *
 * Evolved — Nanite Hive: the aura stays, but four drones now orbit it and
 * *lunge* at whatever comes close, hitting far harder than the aura tick. The
 * old evolution was the same cloud with a bigger radius, which read as "no
 * change" — this one has a behaviour of its own.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { NanobotCloud } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { levelSpatialHash } from '../../core/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../core/ParticleSystem';

interface Drone {
    /** Orbit angle */
    angle: number;
    /** 0 = docked in the orbit, 1 = fully extended into a lunge */
    lunge: number;
    lungeDir: Vector2;
    cooldown: number;
    target: any | null;
    trail: number;
}

// ============================================
// NANITE HIVE - aura plus lunging drones
// ============================================
export class NaniteHiveCloud extends NanobotCloud {
    private drones: Drone[] = [];
    private hitDamage: number;
    private time: number = 0;

    constructor(owner: any, radius: number, duration: number, damage: number, interval: number) {
        super(owner, radius, duration, damage, interval);
        this.hitDamage = damage * 3;
        for (let i = 0; i < 4; i++) {
            this.drones.push({
                angle: (i / 4) * Math.PI * 2,
                lunge: 0,
                lungeDir: { x: 1, y: 0 },
                cooldown: i * 0.25,
                target: null,
                trail: 0,
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.time += dt;

        for (const drone of this.drones) {
            drone.angle += dt * 2.2;

            if (drone.lunge > 0) {
                // Out and back; the hit lands at full extension
                drone.lunge -= dt * 3.4;
                if (drone.lunge <= 0) {
                    drone.lunge = 0;
                    drone.target = null;
                }
                continue;
            }

            drone.cooldown -= dt;
            if (drone.cooldown > 0) continue;

            const target = this.findTarget();
            if (!target) continue;

            drone.target = target;
            drone.cooldown = 0.9;
            drone.lunge = 1;
            const dx = target.pos.x - this.pos.x;
            const dy = target.pos.y - this.pos.y;
            const len = Math.hypot(dx, dy) || 1;
            drone.lungeDir = { x: dx / len, y: dy / len };

            damageSystem.dealDamage({
                baseDamage: this.hitDamage,
                source: this.source,
                target,
                position: target.pos,
            });
            particles.emitHit(target.pos.x, target.pos.y, '#66ffe0');
        }
    }

    private findTarget(): any | null {
        let best: any = null;
        let bestDist = this.radius * 1.35;
        for (const enemy of levelSpatialHash.getNearby(this.pos, this.radius * 1.35)) {
            if (enemy.isDead) continue;
            const dist = distance(this.pos, enemy.pos);
            if (dist < bestDist) {
                bestDist = dist;
                best = enemy;
            }
        }
        return best;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        super.draw(ctx, camera);

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        for (const drone of this.drones) {
            // Ease the lunge: fast out, slower back
            const reach = this.radius * (0.55 + 0.85 * Math.sin(drone.lunge * Math.PI));
            const x = drone.lunge > 0
                ? drone.lungeDir.x * reach
                : Math.cos(drone.angle) * this.radius * 0.55;
            const y = drone.lunge > 0
                ? drone.lungeDir.y * reach
                : Math.sin(drone.angle) * this.radius * 0.55;

            // Motion streak while lunging
            if (drone.lunge > 0.1) {
                ctx.strokeStyle = 'rgba(102, 255, 224, 0.45)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - drone.lungeDir.x * 16, y - drone.lungeDir.y * 16);
                ctx.lineTo(x, y);
                ctx.stroke();
            }

            // Chunky pixel drone: dark hull, bright core, blinking sensor.
            // Deliberately bigger than the aura's particle dots so it reads as
            // a machine rather than more sparkle.
            ctx.fillStyle = '#04201f';
            ctx.fillRect(x - 8, y - 6, 16, 12);
            ctx.fillStyle = '#0d5b57';
            ctx.fillRect(x - 6, y - 4, 12, 8);
            ctx.fillStyle = '#3ce8d0';
            ctx.fillRect(x - 4, y - 2, 8, 4);
            ctx.fillStyle = '#eaffff';
            ctx.fillRect(x - 1, y - 6, 2, 3);
            // Rotor stubs
            ctx.fillStyle = '#0d5b57';
            ctx.fillRect(x - 10, y - 1, 3, 2);
            ctx.fillRect(x + 7, y - 1, 3, 2);
        }

        ctx.restore();
    }
}

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
            const radius = (60 + this.level * 10) * this.owner.stats.area;
            const baseInterval = Math.max(0.1, 0.5 - this.owner.stats.tick);
            const duration = this.duration * this.owner.stats.duration;

            const cloud = this.evolved
                ? new NaniteHiveCloud(this.owner, radius, duration, this.damage, Math.max(0.05, baseInterval))
                : new NanobotCloud(this.owner, radius, duration, this.damage, Math.max(0.05, baseInterval));
            cloud.source = this;
            this.onSpawn(cloud);
            this.activeCloud = cloud;

            this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
        }
    }
}

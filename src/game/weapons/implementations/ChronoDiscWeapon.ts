/**
 * CHRONO DISC WEAPON
 * Ricochet disc that bounces between enemies.
 * 
 * Evolved: Time Shatter - Discs create temporal echoes during flight
 */
import { ProjectileWeapon, BouncingProjectile } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../Entity';
import { type Vector2 } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';

// ============================================
// TEMPORAL ECHO - Small energy projectile without emoji
// ============================================
export class TemporalEchoProjectile extends BouncingProjectile {
    private trailTimer: number = 0;

    update(dt: number) {
        super.update(dt);

        // Trail effect
        this.trailTimer += dt;
        if (this.trailTimer > 0.03) {
            this.trailTimer = 0;
            particles.emitTrail(this.pos.x, this.pos.y, '#00ccff', 2);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Glowing cyan orb
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 8);
        gradient.addColorStop(0, 'rgba(200, 255, 255, 0.9)');
        gradient.addColorStop(0.5, 'rgba(0, 200, 255, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 150, 255, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.fill();

        ctx.restore();
    }
}

// ============================================
// TIME SHATTER PROJECTILE - Creates temporal echoes
// ============================================
export class TimeShatterProjectile extends BouncingProjectile {
    private echoTimer: number = 0;
    private echoInterval: number = 0.4; // Create echo every 0.4 seconds
    private echoesSpawned: number = 0;
    private maxEchoes: number = 3;
    private trailTimer: number = 0;
    onSpawnEcho?: (echo: BouncingProjectile) => void;

    update(dt: number) {
        super.update(dt);

        // Trail effect
        this.trailTimer += dt;
        if (this.trailTimer > 0.05) {
            this.trailTimer = 0;
            particles.emitTrail(this.pos.x, this.pos.y, '#00ffff', 3);
        }

        // Spawn temporal echoes
        this.echoTimer += dt;
        if (this.echoTimer >= this.echoInterval && this.echoesSpawned < this.maxEchoes) {
            this.echoTimer = 0;
            this.echoesSpawned++;
            this.spawnEcho();
        }
    }

    private spawnEcho() {
        // Calculate echo direction: ±60° from current velocity
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        if (speed < 1) return;

        const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
        const offsetAngle = (Math.random() > 0.5 ? 1 : -1) * (Math.PI / 3); // ±60°
        const echoAngle = currentAngle + offsetAngle;

        const echoVelocity: Vector2 = {
            x: Math.cos(echoAngle) * speed * 0.8,
            y: Math.sin(echoAngle) * speed * 0.8
        };

        // Create echo as particle-based projectile (no emoji)
        const echo = new TemporalEchoProjectile(
            this.pos.x,
            this.pos.y,
            echoVelocity,
            this.duration * 0.5,
            this.damage * 0.5,
            Math.floor(this.bouncesLeft * 0.5),
            '', // No emoji
            this.maxBounceRange
        );
        echo.source = this.source;

        // Particle effect at spawn
        particles.emitHit(this.pos.x, this.pos.y, '#00ffff');

        if (this.onSpawnEcho) {
            this.onSpawnEcho(echo);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Glow effect for evolved disc
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 15;

        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }
}

export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 5;
    private pendingDiscs: { delay: number; target: Entity }[] = [];

    readonly stats = {
        damage: 25,
        cooldown: 2.5,
        area: 400,
        speed: 500,
        duration: 5,
        pierce: 5,
        count: 1,
        countScaling: 1,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
        this.pierce = this.stats.pierce;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;

        for (let i = this.pendingDiscs.length - 1; i >= 0; i--) {
            this.pendingDiscs[i].delay -= dt;
            if (this.pendingDiscs[i].delay <= 0) {
                this.fire(this.pendingDiscs[i].target);
                this.pendingDiscs.splice(i, 1);
            }
        }

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

            if (target) {
                const count = (this.stats.count || 1) + Math.floor((this.level - 1) * (this.stats.countScaling || 0));

                this.fire(target);

                for (let i = 1; i < count; i++) {
                    this.pendingDiscs.push({
                        delay: i * 0.2,
                        target: target
                    });
                }

                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }

    fire(target: Entity) {
        const velocity = this.calculateVelocityToTarget(target);
        const bounces = this.stats.pierce + this.level;
        const isEvolved = this.evolved;

        if (isEvolved) {
            // Time Shatter: discs that spawn temporal echoes
            const projectile = new TimeShatterProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                this.damage,
                bounces,
                '💿',
                this.area
            );
            projectile.source = this;
            projectile.onSpawnEcho = (echo) => {
                this.onSpawn(echo);
            };

            this.onSpawn(projectile);
        } else {
            const projectile = new BouncingProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                this.damage,
                bounces,
                this.projectileEmoji,
                this.area
            );
            projectile.source = this;

            this.onSpawn(projectile);
        }
    }
}

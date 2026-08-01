/**
 * PLASMA CANNON WEAPON
 *
 * A heavy round that pierces everything in its path and detonates at the end of
 * its flight. Its problem was that the two halves fought each other: the round
 * is fun *because* it skewers a whole column, but the payoff only happened at
 * maximum range, so against a crowd standing next to you the shot flew past
 * everything and exploded on empty floor.
 *
 * Both forms now pay off along the way:
 *   - the round **ignites** what it passes through, so the pierce itself is the
 *     damage, not just a way to reach the explosion
 *   - the detonation throws a ring of short-range piercing shards, so it works
 *     at the range you are actually fighting at
 *
 * Evolved — Fusion Core: more shards, and they leave the singularity behind
 * that pulls the survivors back into each other.
 */
import { ProjectileWeapon, PlasmaProjectile, Projectile, Zone, type ProjectileParams } from '../base';
import type { Player } from '../../entities/Player';
import type { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { status } from '../../core/StatusEffects';
import { juice } from '../../core/JuiceSystem';
import type { HitResult } from '../../core/CollisionSystem';

// ============================================
// EVOLVED PLASMA CANNON - FUSION CORE
// Creates singularity pull zone on explosion
// ============================================

export class FusionCoreSingularity extends Zone {
    private rotationAngle: number = 0;
    pullStrength: number = 180;

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.2, '');
    }

    update(dt: number) {
        super.update(dt);
        this.rotationAngle += dt * 4;

        // Pull enemies toward center
        const enemiesInSingularity = levelSpatialHash.getWithinRadius(this.pos, this.radius * 1.5);

        for (const enemy of enemiesInSingularity) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = distance(this.pos, enemy.pos);

            if (dist < this.radius * 1.5 && dist > 5) {
                const pullForce = this.pullStrength / dist;
                enemy.pos.x += (dx / dist) * pullForce * dt;
                enemy.pos.y += (dy / dist) * pullForce * dt;
            }
        }

        // Emit particles
        if (Math.random() > 0.8) {
            particles.emitHit(this.pos.x, this.pos.y, '#00ff66');
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration);

        // Pull effect lines
        ctx.rotate(this.rotationAngle);
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(this.radius * 1.2, 0);
            ctx.lineTo(this.radius * 0.3, 0);
            ctx.strokeStyle = `rgba(0, 255, 100, ${0.4 * fade})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.rotate(-this.rotationAngle);

        // Core gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.5);
        gradient.addColorStop(0, `rgba(100, 255, 150, ${0.9 * fade})`);
        gradient.addColorStop(0.5, `rgba(0, 200, 100, ${0.6 * fade})`);
        gradient.addColorStop(1, `rgba(0, 100, 50, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 20 * fade;
        ctx.fill();

        // Energy ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 100, ${0.5 * fade})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }
}

// ============================================
// PLASMA SHARD - the burst thrown by a detonation
// ============================================

/**
 * A short-lived piercing bolt. The point is reach at *close* range: the parent
 * round only pays off at the end of a long flight, and these cover the gap.
 */
export class PlasmaShard extends Projectile {
    igniteDps: number = 0;
    private clock: number = 0;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number) {
        super(x, y, velocity, duration, damage, 3, '');
        this.radius = 7;
    }

    update(dt: number) {
        super.update(dt);
        this.clock += dt;
    }

    handleHit(enemy: Entity): HitResult {
        const result = super.handleHit(enemy);
        if (this.igniteDps > 0) {
            status.infect(enemy as any, {
                dps: this.igniteDps,
                duration: 2,
                source: this.source,
                kind: 'burn',
            });
        }
        return result;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));

        // Stretched bolt — the streak reads as speed at a glance
        const fade = Math.min(1, this.duration * 4);
        ctx.globalAlpha = fade;
        ctx.fillStyle = '#0f7a3a';
        ctx.fillRect(-16, -3, 22, 6);
        ctx.fillStyle = '#3dff86';
        ctx.fillRect(-11, -2, 16, 4);
        ctx.fillStyle = '#e8ffe8';
        ctx.fillRect(-1, -2, 6, 4);

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

export class PlasmaCannonWeapon extends ProjectileWeapon {
    name = "Plasma Cannon";
    emoji = "🔋";
    description = "Fires massive explosive plasma rounds.";
    projectileEmoji = "🟢";
    pierce = 999;

    readonly stats = {
        damage: 40,
        cooldown: 2.5,
        area: 80,      // Explosion radius (FusionCoreSingularity)
        speed: 200,
        duration: 1.5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;  // Explosion radius
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            // Search range = projectile flight distance
            const searchRange = this.speed * this.duration * this.owner.stats.duration;
            const target = this.findClosestEnemy(searchRange);

            if (target) {
                this.fire(target);
                const cdMultiplier = this.evolved ? 1.4 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    protected createProjectile(params: ProjectileParams): PlasmaProjectile {
        const proj = new IgnitingPlasmaProjectile(
            params.x, params.y, params.velocity,
            params.duration, params.damage, params.pierce
        );
        // Piercing a column is the round's identity; a burn on each body makes
        // the pierce itself worth something instead of just a path to the blast
        proj.igniteDps = this.damage * 0.3;
        return proj;
    }

    protected onProjectileCreated(proj: PlasmaProjectile): void {
        proj.onExplosion = (x: number, y: number) => this.detonate(x, y);
    }

    /**
     * The detonation throws a ring of piercing shards. Fireworks, and — more to
     * the point — reach at the range the fight is actually happening at, which
     * a round that only explodes at maximum flight distance never had.
     */
    private detonate(x: number, y: number) {
        const shards = this.evolved ? 8 : 5;
        const speed = 380 * this.owner.stats.speed;
        const life = 0.42 * this.owner.stats.duration;
        const base = Math.random() * Math.PI * 2;

        particles.emitPlasmaBurst(x, y, this.area * this.owner.stats.area, this.evolved);
        juice.shockwave(x, y, this.area * this.owner.stats.area * 1.4, '#3dff86', 0.3, 4);

        for (let i = 0; i < shards; i++) {
            const angle = base + (i / shards) * Math.PI * 2;
            const shard = new PlasmaShard(
                x, y,
                { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                life,
                this.damage * (this.evolved ? 0.45 : 0.35),
            );
            shard.source = this;
            shard.igniteDps = this.damage * 0.22;
            this.onSpawn(shard);
        }

        if (this.evolved) {
            const pullRadius = this.area * this.owner.stats.area;
            const pullDuration = 2.0 * this.owner.stats.duration;
            const pullZone = new FusionCoreSingularity(x, y, pullRadius, pullDuration, this.damage * 0.15);
            pullZone.source = this;
            this.onSpawn(pullZone);
        }
    }
}

/** Plasma round that sets fire to everything it passes through */
class IgnitingPlasmaProjectile extends PlasmaProjectile {
    igniteDps: number = 0;

    handleHit(enemy: Entity): HitResult {
        const result = super.handleHit(enemy);
        if (this.igniteDps > 0) {
            status.infect(enemy as any, {
                dps: this.igniteDps,
                duration: 2.5,
                source: this.source,
                kind: 'burn',
            });
        }
        return result;
    }
}

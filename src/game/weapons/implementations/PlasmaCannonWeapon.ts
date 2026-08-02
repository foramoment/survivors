/**
 * PLASMA CANNON WEAPON
 *
 * A heavy round that **bursts on the first thing it hits**.
 *
 * It used to pierce a whole column and only detonate at the end of its flight,
 * which meant the payoff happened wherever the round ran out of range — usually
 * on empty floor well behind the crowd you were actually fighting. The pierce
 * was the more interesting half on paper and the useless half in practice: at
 * the range this game is played at, the shot went through the two enemies on
 * top of you and exploded off-screen.
 *
 * So the impact *is* the weapon now. The round hits, detonates, ignites what it
 * caught, and throws a ring of short-range shards that set fire to whatever
 * they reach. Everything happens where you were aiming.
 *
 * Evolved — Fusion Core: the same impact, then the fire keeps going off. Three
 * aftershocks roll out of the crater, one per second, each wider than the last.
 */
import { ProjectileWeapon, PlasmaProjectile, Projectile, PlasmaExplosionZone, type ProjectileParams } from '../base';
import type { Player } from '../../entities/Player';
import type { Entity } from '../../Entity';
import { type Vector2 } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../core/JuiceSystem';
import type { HitResult } from '../../core/CollisionSystem';

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
    description = "Heavy round that bursts on impact into igniting shards.";
    projectileEmoji = "🟢";
    /** Zero: the round detonates on the first body it touches */
    pierce = 0;

    readonly stats = {
        damage: 40,
        cooldown: 2.5,
        area: 80,      // Blast radius
        speed: 200,
        duration: 1.5,
    };

    /** Evolved aftershocks: how many, and the seconds between them */
    private static readonly AFTERSHOCKS = 3;
    private static readonly AFTERSHOCK_INTERVAL = 1.0;

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
        // The body it bursts against catches fire too, not just the ring
        proj.igniteDps = this.damage * 0.3;
        return proj;
    }

    protected onProjectileCreated(proj: PlasmaProjectile): void {
        proj.onExplosion = (x: number, y: number) => this.detonate(x, y);
    }

    /**
     * The detonation throws a ring of piercing shards that set fire to what
     * they reach. Fireworks, and — more to the point — reach at the range the
     * fight is actually happening at.
     */
    private detonate(x: number, y: number) {
        const radius = this.area * this.owner.stats.area;
        const shards = this.evolved ? 8 : 5;
        // Shards carry further than they used to: with the round no longer
        // piercing, this ring is how the weapon covers a line of bodies
        const speed = 460 * this.owner.stats.speed;
        const life = 0.5 * this.owner.stats.duration;
        const base = Math.random() * Math.PI * 2;

        particles.emitPlasmaBurst(x, y, radius, this.evolved);
        juice.shockwave(x, y, radius * 1.4, '#3dff86', 0.3, 4);

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

        if (this.evolved) this.rollAftershocks(x, y, radius);
    }

    /**
     * Three waves rolling out of the crater, one per second, each wider and
     * weaker than the last.
     *
     * They are deliberately small: the point is that the ground you just hit
     * stays dangerous for three seconds, so the crater becomes a place enemies
     * have to path around — not a second, third and fourth full blast. Each
     * wave is a delayed detonation on its own timer, so nothing resolves in the
     * same frame as anything else (see the VFX rules in CLAUDE.md).
     */
    private rollAftershocks(x: number, y: number, radius: number) {
        for (let i = 1; i <= PlasmaCannonWeapon.AFTERSHOCKS; i++) {
            const wave = new PlasmaExplosionZone(
                x, y,
                radius * (0.75 + i * 0.25),
                this.damage * 0.22,
                false,
            );
            wave.source = this;
            wave.detonationDelay = i * PlasmaCannonWeapon.AFTERSHOCK_INTERVAL;
            wave.onDetonate = (cx, cy, r) => {
                particles.emitPlasmaBurst(cx, cy, r, true);
                juice.shockwave(cx, cy, r * 1.3, '#ffb03c', 0.28, 3);
            };
            this.onSpawn(wave);
        }
    }
}

/** Plasma round that sets fire to the body it bursts against */
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

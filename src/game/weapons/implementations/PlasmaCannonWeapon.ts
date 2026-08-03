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
 * Evolved — Fusion Core: the shrapnel is contagious. Every shard that bites
 * into a body bursts into a smaller spray from that body, so a hit in the
 * middle of a pack turns into a second wave coming off the pack itself.
 */
import { ProjectileWeapon, PlasmaProjectile, Projectile, type ProjectileParams } from '../base';
import type { Player } from '../../entities/Player';
import type { Entity } from '../../../engine/Entity';
import { type Vector2 } from '../../../engine/Utils';
import { particles } from '../../../engine/ParticleSystem';
import { status } from '../../core/StatusEffects';
import { juice } from '../../../engine/JuiceSystem';
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
    /**
     * How many more times this shard may burst into smaller ones. The evolved
     * cannon starts its shards at 1 and the children at 0, so shrapnel goes
     * exactly two generations deep and cannot cascade.
     */
    splinters: number = 0;
    /** Fired where a shard bit into a body, so the weapon can seed the next set */
    onSplinter?: (x: number, y: number) => void;
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
        if (this.splinters > 0) {
            this.splinters--;
            this.onSplinter?.(enemy.pos.x, enemy.pos.y);
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

    /**
     * Shards thrown by a second-generation burst.
     *
     * Generous on purpose. The evolution's whole payoff is conditional — it
     * only happens where a shard actually connected — so on paper it looked
     * fine and in a real fight it read as barely different from the base gun.
     * A conditional payoff has to be worth *more* than an unconditional one,
     * not the same.
     */
    /**
     * Shards in a detonation: one more every level, three more on evolving.
     * L1 5, L6 10, L6 evolved 13.
     *
     * This weapon was the ONLY one in the pool that never read `this.level` at
     * all — every level was +20% damage on the same five shards and nothing
     * else. For a weapon whose whole identity is "it bursts into shrapnel",
     * the count is the obvious axis and it was the one axis standing still.
     *
     * The evolved bonus stays additive rather than a flat replacement, because
     * the flat 8 it used to be would have been a **downgrade** past level four.
     * An evolution may never hand back fewer of the thing the weapon is about.
     */
    private shardCount(): number {
        const base = 5 + (this.level - 1);
        return this.evolved ? base + 3 : base;
    }

    private static readonly SPLINTER_COUNT = 6;
    /** Size of a second-generation shard relative to its parent */
    private static readonly SPLINTER_SCALE = 0.72;

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
                // Trimmed from 1.4: the evolution pays for itself in a
                // condition (a shard has to connect), so it should not also
                // pay in rate
                const cdMultiplier = this.evolved ? 1.2 : 1.0;
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
        particles.emitPlasmaBurst(x, y, radius, this.evolved);
        juice.shockwave(x, y, radius * 1.4, '#3dff86', 0.3, 4);
        this.throwShards(x, y, this.shardCount(), 1, this.evolved ? 1 : 0);
    }

    /**
     * A ring of shards. `scale` shrinks the whole burst for a second-generation
     * spray, and `splinters` says whether those shards may burst again.
     */
    private throwShards(x: number, y: number, count: number, scale: number, splinters: number) {
        const speed = 460 * scale * this.owner.stats.speed;
        const life = 0.5 * scale * this.owner.stats.duration;
        const base = Math.random() * Math.PI * 2;
        const damage = this.damage * (this.evolved ? 0.45 : 0.35) * scale;

        for (let i = 0; i < count; i++) {
            const angle = base + (i / count) * Math.PI * 2;
            const shard = new PlasmaShard(
                x, y,
                { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                life,
                damage,
            );
            shard.source = this;
            shard.igniteDps = this.damage * 0.22 * scale;
            shard.splinters = splinters;
            if (splinters > 0) shard.onSplinter = (sx, sy) => this.splinter(sx, sy);
            this.onSpawn(shard);
        }
    }

    /**
     * Second-generation shrapnel: a shard that bit into a body bursts, and the
     * body becomes the source of the next spray.
     *
     * This replaced three timed aftershock waves that went off in the crater
     * on their own, which read as explosions arriving out of nowhere. Shrapnel
     * begetting shrapnel is the same idea told through the thing that already
     * feels good about this weapon — the crackle of splinters coming off a hit
     * — and it points the damage at where the enemies actually are, because
     * that is where the first shard landed.
     *
     * The children are deliberately weak (60% of a shard's already-fractional
     * damage, and half its reach) and cannot burst again. The cannon should
     * stay a shrapnel gun, not quietly become an area weapon.
     */
    private splinter(x: number, y: number) {
        particles.emitPlasmaBurst(x, y, this.area * 0.35 * this.owner.stats.area, false);
        particles.emitShrapnel(x, y, this.area * 0.3 * this.owner.stats.area,
            ['#e8ffe8', '#3dff86', '#0f7a3a'], 5);
        this.throwShards(x, y, PlasmaCannonWeapon.SPLINTER_COUNT, PlasmaCannonWeapon.SPLINTER_SCALE, 0);
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

/**
 * CHRONO DISC WEAPON
 *
 * A saw blade that ricochets from enemy to enemy. The base weapon was already
 * the most satisfying thing to watch in the pool — the bounce chain reads
 * instantly — so it is left alone apart from finally drawing a *disc* instead
 * of stamping a `💿` glyph every frame.
 *
 * Evolved — Time Shatter. The old evolution split off echo projectiles at ±60°,
 * which fired into empty space most of the time and just added clutter.
 *
 * The replacement gives the weapon a rule of its own: a blade cannot hit the
 * same enemy twice on one pass (that is what makes the ricochet chain work), so
 * the pay-off for hitting a target *again* has to come from somewhere else.
 * Every cut leaves a **laceration** stack; at LACERATION_THRESHOLD stacks the
 * wound opens into a bleed that keeps ticking. Chasing a target across several
 * throws now means something, and the ricochet's own habit of returning to a
 * crowd it already passed through does the work for you.
 */
import { ProjectileWeapon, BouncingProjectile } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../Entity';
import { type Vector2 } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { status } from '../../core/StatusEffects';
import type { HitResult } from '../../core/CollisionSystem';

/** Cuts on one enemy before the wound opens into a bleed */
export const LACERATION_THRESHOLD = 3;
/** Seconds a laceration stack lingers before it fades */
const LACERATION_LIFETIME = 4;

/**
 * Laceration bookkeeping lives on the enemy, next to the other statuses, but
 * it is weapon-specific enough not to belong in core/StatusEffects: nothing
 * else in the game builds a wound out of repeat hits.
 */
interface Lacerated {
    stacks: number;
    timer: number;
}

/** Add a cut; returns true when this one opened the wound */
export function addLaceration(enemy: any, now: number): boolean {
    const wound: Lacerated | undefined = enemy.__laceration;
    if (!wound || now - wound.timer > LACERATION_LIFETIME) {
        enemy.__laceration = { stacks: 1, timer: now };
        return false;
    }
    wound.timer = now;
    wound.stacks++;
    if (wound.stacks >= LACERATION_THRESHOLD) {
        wound.stacks = 0;
        return true;
    }
    return false;
}

// ============================================
// SAW DISC — the projectile both forms share
// ============================================
export class SawDisc extends BouncingProjectile {
    /** Bleed damage per second applied when a wound opens (0 = base weapon) */
    bleedDps: number = 0;
    /** Spin is baked from a per-disc rate so a volley doesn't spin in lockstep */
    private spin: number = Math.random() * Math.PI * 2;
    private readonly spinRate: number = 14 + Math.random() * 6;
    private clock: number = 0;
    private trailTimer: number = 0;

    constructor(
        x: number, y: number, velocity: Vector2, duration: number,
        damage: number, bounces: number, bounceRange: number,
    ) {
        super(x, y, velocity, duration, damage, bounces, '', bounceRange);
        this.radius = 11;
    }

    update(dt: number) {
        super.update(dt);
        this.clock += dt;
        this.spin += this.spinRate * dt;

        this.trailTimer += dt;
        if (this.trailTimer > 0.05) {
            this.trailTimer = 0;
            particles.emitTrail(this.pos.x, this.pos.y, this.bleedDps > 0 ? '#ff4d7a' : '#5ce1ff', 2);
        }
    }

    handleHit(enemy: Entity): HitResult {
        const result = super.handleHit(enemy);
        // super returns 0 damage for an enemy this disc already cut — only a
        // real cut counts toward the wound
        if (result.damage > 0 && this.bleedDps > 0) {
            if (addLaceration(enemy, performance.now() / 1000)) {
                status.infect(enemy as any, {
                    dps: this.bleedDps,
                    duration: 3.5,
                    source: this.source,
                    kind: 'burn',
                });
                particles.emitHit(enemy.pos.x, enemy.pos.y, '#ff2f5f');
            }
        }
        return result;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.rotate(this.spin);

        const evolved = this.bleedDps > 0;
        const rim = evolved ? '#ff8fa8' : '#bff2ff';
        const body = evolved ? '#b8203f' : '#1f7fa8';
        const core = evolved ? '#ff2f5f' : '#5ce1ff';
        const r = this.radius;

        // Teeth: eight trapezoids around the rim, drawn as one path so the
        // whole blade costs a single fill
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const b = a + 0.26;
            ctx.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
            ctx.lineTo(Math.cos(a + 0.05) * r * 1.35, Math.sin(a + 0.05) * r * 1.35);
            ctx.lineTo(Math.cos(b) * r * 1.2, Math.sin(b) * r * 1.2);
            ctx.lineTo(Math.cos(b + 0.08) * r * 0.82, Math.sin(b + 0.08) * r * 0.82);
            ctx.closePath();
        }
        ctx.fillStyle = rim;
        ctx.fill();

        // Blade body
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();

        // Hub, and a slot so the rotation is actually visible
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, 0);
        ctx.lineTo(r * 0.7, 0);
        ctx.stroke();

        ctx.restore();
    }
}

export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet saw that bounces between enemies.";
    projectileEmoji = "";
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
        // Evolved discs ricochet far longer — that is what feeds the wounds
        const bounces = this.stats.pierce + this.level + (this.evolved ? 6 : 0);

        const disc = new SawDisc(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * this.owner.stats.duration,
            this.damage,
            bounces,
            this.area,
        );
        disc.source = this;
        if (this.evolved) disc.bleedDps = this.damage * 0.5;

        this.onSpawn(disc);
    }
}

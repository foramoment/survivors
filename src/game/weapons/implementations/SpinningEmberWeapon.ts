/**
 * SPINNING EMBER WEAPON
 *
 * A permanent ring of embers orbiting the player. Rewritten because the old
 * version was two `🔥` glyphs on a fixed circle that existed for four seconds
 * out of every seven — it did nothing most of the time, and the moment it did
 * anything it was a flat contact hit.
 *
 * What it does now:
 *   - the ring never goes down; orbs are re-lit the instant one burns out, so
 *     this is the weapon you rely on while nothing else is off cooldown
 *   - orbs *ignite* what they touch (a burn DoT via core/StatusEffects), so a
 *     brush keeps paying after the orb has swung past
 *   - the orbit breathes in and out, sweeping a band instead of tracing one
 *     thin circle a walking enemy can sit inside
 *
 * Evolved — Inferno Lash: every couple of seconds the ring snaps outward in a
 * whip and the orbs lay burning ground on the way, turning the ring from a
 * personal bubble into an area denial tool.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { OrbitingProjectile, Zone } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { status } from '../../core/StatusEffects';
import type { Entity } from '../../Entity';
import type { HitResult } from '../../core/CollisionSystem';

// ============================================
// BURNING TRAIL ZONE - ground left by an Inferno Lash
// ============================================
export class BurningTrailZone extends Zone {
    /** Baked once: flames only bob, they never move to a new spot */
    private readonly flames: { x: number; y: number; scale: number; phase: number }[] = [];
    private readonly maxDuration: number;
    private age: number = 0;
    burnDps: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.3, '');
        this.maxDuration = duration;

        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.6;
            this.flames.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.7,
                scale: 0.6 + Math.random() * 0.6,
                phase: Math.random() * Math.PI * 2,
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.age += dt;

        // Zone damage is applied by CollisionSystem on the tick; this class
        // only adds the lingering burn
        if (this.timer >= this.interval && this.burnDps > 0) {
            for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.radius)) {
                if (distance(this.pos, enemy.pos) > this.radius) continue;
                status.infect(enemy, {
                    dps: this.burnDps,
                    duration: 2,
                    source: this.source,
                    kind: 'burn',
                });
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.max(0, Math.min(1, this.duration / (this.maxDuration * 0.5)));

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        glow.addColorStop(0, `rgba(255, 150, 50, ${0.45 * fade})`);
        glow.addColorStop(0.5, `rgba(255, 80, 20, ${0.26 * fade})`);
        glow.addColorStop(1, 'rgba(200, 50, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Chunky pixel flames — cheaper and more on-style than gradient tongues
        for (const flame of this.flames) {
            const flicker = 1 + Math.sin(this.age * 12 + flame.phase) * 0.25;
            const p = Math.max(2, Math.round(3 * flame.scale * flicker));
            ctx.globalAlpha = fade;
            ctx.fillStyle = '#ff5a1e';
            ctx.fillRect(flame.x - p, flame.y - p, p * 2, p * 2);
            ctx.fillStyle = '#ffb23c';
            ctx.fillRect(flame.x - p / 2, flame.y - p * 1.6, p, p * 1.6);
            ctx.fillStyle = '#fff0b0';
            ctx.fillRect(flame.x - 1, flame.y - p * 1.8, 2, p * 0.8);
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

/** Seconds before an orb may hit the same enemy again */
const HIT_INTERVAL = 0.25;

// ============================================
// EMBER ORB - the orbiting body
// ============================================
export class EmberOrb extends OrbitingProjectile {
    /** Burn applied to anything the orb touches */
    burnDps: number = 0;
    /** How far the orbit breathes in and out */
    pulseAmplitude: number = 18;
    pulseSpeed: number = 2.2;
    /** 0..1 — how far the ring is currently whipped outward (evolved) */
    lash: number = 0;
    onSpawnTrail?: (zone: BurningTrailZone) => void;
    trailDamage: number = 0;
    trailDuration: number = 1.5;

    private readonly baseDistance: number;
    private clock: number = 0;
    private trailTimer: number = 0;
    /** Recently burned targets, so one pass does not re-ignite every frame */
    private touched: Map<any, number> = new Map();

    constructor(owner: any, distance: number, speed: number, duration: number, damage: number) {
        super(owner, distance, speed, duration, damage, '');
        this.baseDistance = distance;
        this.radius = 13;
    }

    update(dt: number) {
        this.clock += dt;

        // Breathing orbit — the ring sweeps a band, not a hairline circle
        const breathe = Math.sin(this.clock * this.pulseSpeed) * this.pulseAmplitude;
        this.distance = this.baseDistance * (1 + this.lash * 0.85) + breathe;

        super.update(dt);

        for (const [enemy, until] of this.touched) {
            if (this.clock > until) this.touched.delete(enemy);
        }

        // Only the lash lays ground fire; a resting ring would carpet the arena
        if (this.lash > 0.15 && this.onSpawnTrail) {
            this.trailTimer -= dt;
            if (this.trailTimer <= 0) {
                this.trailTimer = 0.12;
                const trail = new BurningTrailZone(
                    this.pos.x, this.pos.y, 26, this.trailDuration, this.trailDamage,
                );
                trail.burnDps = this.burnDps * 0.5;
                trail.source = this.source;
                this.onSpawnTrail(trail);
            }
        }
    }

    /**
     * One hit per enemy per HIT_INTERVAL.
     *
     * CollisionSystem calls handleHit every frame an overlap lasts, and the old
     * orbiting fireball just returned its full damage each time — so the weapon
     * dealt more damage on a 144 Hz screen than on a 60 Hz one. Gating on the
     * orb's own clock makes a pass through an enemy worth the same everywhere.
     */
    handleHit(enemy: Entity): HitResult {
        const readyAt = this.touched.get(enemy) ?? 0;
        if (this.clock < readyAt) return { damage: 0, continueChecking: true };
        this.touched.set(enemy, this.clock + HIT_INTERVAL);

        if (this.burnDps > 0) {
            status.infect(enemy as any, {
                dps: this.burnDps,
                duration: 2.5,
                source: this.source,
                kind: 'burn',
            });
            particles.emitHit(enemy.pos.x, enemy.pos.y, '#ff8a2c');
        }
        // Embers never burn out on contact — the ring is a constant, not ammo
        return { damage: this.damage, continueChecking: true };
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const flicker = 1 + Math.sin(this.clock * 16) * 0.12;
        const r = this.radius * flicker;

        // Tail smeared along the direction of travel
        const tangent = this.angle + Math.PI / 2;
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = '#ff6a18';
        ctx.lineWidth = r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-Math.cos(tangent) * r * 1.9, -Math.sin(tangent) * r * 1.9);
        ctx.lineTo(0, 0);
        ctx.stroke();

        ctx.globalAlpha = 1;
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        core.addColorStop(0, '#fff4c4');
        core.addColorStop(0.4, '#ffb03c');
        core.addColorStop(0.75, '#ff5a1e');
        core.addColorStop(1, 'rgba(180, 40, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();

        ctx.restore();
    }
}

export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "A ring of embers that never goes out and sets things alight.";

    private orbs: EmberOrb[] = [];
    /** Counts down to the next Inferno Lash (evolved only) */
    private lashTimer: number = 0;
    private lashPhase: number = 0;
    private lashHit: boolean = false;

    readonly stats = {
        // Higher than the old 15 on purpose: a pass used to land ~7 frames of
        // damage, now it lands one gated tick plus a burn
        damage: 26,
        cooldown: 0.5,   // re-light check, not a real cast cooldown
        area: 96,
        speed: 2.6,
        duration: 6,
        count: 2,
        countScaling: 0.5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
    }

    /** Orbs at the current level (2 at level 1, +1 every two levels, 5 evolved) */
    private orbCount(): number {
        const base = this.stats.count + Math.floor((this.level - 1) * this.stats.countScaling);
        return this.evolved ? base + 2 : base;
    }

    update(dt: number) {
        this.orbs = this.orbs.filter(o => !o.isDead);

        // The ring is a standing effect: top it back up rather than waiting out
        // a cooldown with nothing on screen
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            this.cooldown = this.baseCooldown;
            this.relight();
        }

        if (this.evolved) this.updateLash(dt);
    }

    private relight() {
        const wanted = this.orbCount();
        if (this.orbs.length >= wanted) return;

        const radius = this.area * this.owner.stats.area;
        const duration = this.stats.duration * this.owner.stats.duration;

        // Re-spread every orb so the ring stays even as it refills
        const existing = this.orbs.length;
        for (let i = existing; i < wanted; i++) {
            const orb = new EmberOrb(
                this.owner,
                radius,
                this.speed * this.owner.stats.speed,
                duration,
                this.damage,
            );
            orb.angle = (Math.PI * 2 / wanted) * i;
            orb.source = this;
            orb.burnDps = this.damage * 0.35;
            orb.trailDamage = this.damage * 0.4;
            orb.trailDuration = 1.5 * this.owner.stats.duration;
            orb.onSpawnTrail = zone => this.onSpawn(zone);
            this.onSpawn(orb);
            this.orbs.push(orb);
        }
    }

    /**
     * Inferno Lash: the ring winds up, snaps outward, and reels back in. The
     * whip is what lays the burning ground, so the ability has a rhythm you can
     * play around instead of a permanent carpet of fire.
     */
    private updateLash(dt: number) {
        this.lashTimer -= dt;
        if (this.lashTimer <= 0) {
            this.lashTimer = 2.4;
            this.lashPhase = 1;
            this.lashHit = false;
            particles.emitHit(this.owner.pos.x, this.owner.pos.y, '#ffb03c');
        }

        if (this.lashPhase > 0) {
            this.lashPhase = Math.max(0, this.lashPhase - dt * 1.6);
            // Fast out, slow back
            const extend = Math.sin((1 - this.lashPhase) * Math.PI);
            for (const orb of this.orbs) orb.lash = extend;

            // The whip hit lands once at full extension, not on every frame the
            // ring happens to be wide
            if (extend > 0.85 && !this.lashHit) {
                this.lashHit = true;
                this.whipDamage();
            }
        }
    }

    private whipDamage() {
        const reach = this.area * this.owner.stats.area * 1.85;
        for (const enemy of levelSpatialHash.getWithinRadius(this.owner.pos, reach)) {
            const d = distance(this.owner.pos, enemy.pos);
            if (d < reach * 0.55 || d > reach) continue;
            damageSystem.dealDamage({
                baseDamage: this.damage * 0.5,
                source: this,
                target: enemy,
                position: enemy.pos,
            });
        }
    }
}

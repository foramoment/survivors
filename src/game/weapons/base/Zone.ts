/**
 * BASE ZONE CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { Entity } from '../../Entity';
import type { Weapon } from '../../Weapon';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { juice } from '../../core/JuiceSystem';
import { status } from '../../core/StatusEffects';

// ============================================
// ZONE - Base class for area damage
// ============================================
export class Zone extends Entity {
    duration: number;
    damage: number;
    interval: number;
    timer: number = 0;
    emoji: string;
    slowEffect: number = 0;
    source?: Weapon;

    /**
     * The radius this zone settles at. `radius` is the live one and eases up to
     * it while the zone spreads; subclasses that keep creeping (spores) raise
     * `fullRadius` and let the ramp follow.
     */
    fullRadius: number;
    /**
     * Seconds to creep out from the impact point to full size. 0 means "appear
     * at full size", which is correct for a telegraphed blast — you already
     * watched a reticle close on it — and wrong for anything poured onto the
     * ground. Acid, frost and spores turn it on: a puddle that pops into
     * existence at full width reads as a decal, one that spreads reads as
     * something landing.
     */
    spreadTime: number = 0;
    /** Share of the full radius the zone starts at when it spreads */
    protected static readonly SPREAD_SEED = 0.28;
    private spreadAge: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, emoji: string, slowEffect: number = 0) {
        super(x, y, radius);
        this.fullRadius = radius;
        this.duration = duration;
        this.damage = damage;
        this.interval = interval;
        this.emoji = emoji;
        this.slowEffect = slowEffect;
    }

    /**
     * Turn the spread ramp on. Call from a subclass constructor so the zone is
     * already small before anything draws it.
     */
    protected spreadIn(time: number) {
        this.spreadTime = time;
        this.radius = this.fullRadius * Zone.SPREAD_SEED;
    }

    /**
     * How far along the spread is, 0.28..1. Zones that bake their decoration
     * against `fullRadius` multiply the baked offsets by this so the whole
     * pattern grows together instead of appearing over a growing circle.
     */
    protected get spreadScale(): number {
        return this.fullRadius > 0 ? this.radius / this.fullRadius : 1;
    }

    update(dt: number) {
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;

        this.timer += dt;

        if (this.spreadTime > 0) {
            this.spreadAge = Math.min(this.spreadTime, this.spreadAge + dt);
            const t = this.spreadAge / this.spreadTime;
            // Ease-out: the edge lunges outward and settles, like liquid finding
            // its level. Linear growth looks like a scaling sprite.
            const eased = 1 - (1 - t) * (1 - t);
            this.radius = this.fullRadius * (Zone.SPREAD_SEED + (1 - Zone.SPREAD_SEED) * eased);
        }
    }

    /**
     * Floor on how far a slow may drag an enemy down.
     *
     * Slow is soft crowd control and is allowed to scale — unlike stun, which
     * has an explicit downtime rule in core/StatusEffects. But a 90% slow laid
     * over the whole arena is a stun wearing a different name, and the frost
     * field could reach it. Nothing walks slower than a third of its own pace.
     */
    protected static readonly SLOW_FLOOR = 0.35;

    onOverlap(enemy: any) {
        if (this.slowEffect > 0) {
            enemy.speedMultiplier = Math.max(Zone.SLOW_FLOOR, 1 - this.slowEffect);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        if (this.slowEffect > 0) {
            ctx.fillStyle = '#0088ff';
        } else {
            ctx.fillStyle = '#00ffff';
        }
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }
}

// ============================================
// FROST ZONE - Slows enemies
// ============================================
/**
 * A patch of frozen ground, not a blue disc with triangles on it.
 *
 * The old look was a perfect circle, a dashed ring and eight loose triangles
 * scattered at random — the oldest art in the game and the only zone that still
 * read as programmer placeholder. What replaced it is built from the way ice
 * actually forms: an uneven rimed edge, frost fingers crawling outward from the
 * impact point, and chunky pixel chips frozen into the surface.
 *
 * Everything is baked once against `fullRadius` and multiplied by the spread
 * ramp at draw time, so the whole pattern creeps outward together and nothing
 * is recomputed per frame (see the VFX rules in CLAUDE.md).
 */
export class FrostZone extends Zone {
    private particleTimer: number = 0;
    /** Uneven rim, as unit-length offsets from the centre */
    private rim: Vector2[] = [];
    /** Frost creeping out of the middle: [angle, length, branch offset] */
    private fingers: { angle: number; length: number; kink: number; branch: number }[] = [];
    /** Pixel chips frozen into the surface */
    private chips: { x: number; y: number; w: number; h: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, slowEffect: number = 0.5) {
        super(x, y, radius, duration, damage, interval, '', slowEffect);
        this.spreadIn(0.32);
        this.bakeGeometry();
    }

    private bakeGeometry() {
        const r = this.fullRadius;

        const points = 18;
        for (let i = 0; i < points; i++) {
            const a = (i / points) * Math.PI * 2;
            const wobble = 0.86 + Math.random() * 0.22;
            this.rim.push({ x: Math.cos(a) * r * wobble, y: Math.sin(a) * r * wobble * 0.82 });
        }

        const fingerCount = Math.max(6, Math.min(12, Math.round(r / 14)));
        for (let i = 0; i < fingerCount; i++) {
            this.fingers.push({
                angle: (i / fingerCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4,
                length: r * (0.55 + Math.random() * 0.4),
                kink: (Math.random() - 0.5) * 0.7,
                branch: 0.45 + Math.random() * 0.3,
            });
        }

        const chipCount = Math.max(4, Math.min(9, Math.round(r / 20)));
        for (let i = 0; i < chipCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = r * (0.15 + Math.random() * 0.6);
            const size = Math.max(2, r * (0.05 + Math.random() * 0.06));
            this.chips.push({
                x: Math.cos(a) * d,
                y: Math.sin(a) * d * 0.82,
                w: size,
                h: Math.max(2, size * 0.7),
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.particleTimer += dt;
        if (this.particleTimer > 0.1) {
            this.particleTimer = 0;
            particles.emitColdMist(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const g = this.spreadScale;
        // Fade out over the last half second instead of vanishing mid-frame
        const fade = Math.max(0, Math.min(1, this.duration / 0.5));

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(g, g);

        // Rimed floor: an uneven patch, filled and outlined in one path
        ctx.beginPath();
        ctx.moveTo(this.rim[0].x, this.rim[0].y);
        for (let i = 1; i < this.rim.length; i++) ctx.lineTo(this.rim[i].x, this.rim[i].y);
        ctx.closePath();

        // Saturated blue, not pale grey: at 0.4 alpha a near-white fill over a
        // near-black arena just reads as a grey polygon, which is what the
        // first pass of this looked like
        const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, this.fullRadius);
        floor.addColorStop(0, `rgba(140, 222, 255, ${0.5 * fade})`);
        floor.addColorStop(0.6, `rgba(58, 158, 240, ${0.4 * fade})`);
        floor.addColorStop(1, `rgba(24, 96, 190, ${0.16 * fade})`);
        ctx.fillStyle = floor;
        ctx.fill();

        ctx.strokeStyle = `rgba(176, 230, 255, ${0.6 * fade})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Frost fingers crawling out of the centre. Their reach follows the
        // spread, so the ice visibly grows into the ground.
        ctx.strokeStyle = `rgba(224, 246, 255, ${0.7 * fade})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const f of this.fingers) {
            const cos = Math.cos(f.angle);
            const sin = Math.sin(f.angle) * 0.82;
            const midX = cos * f.length * 0.55;
            const midY = sin * f.length * 0.55;
            const tipX = Math.cos(f.angle + f.kink) * f.length;
            const tipY = Math.sin(f.angle + f.kink) * f.length * 0.82;
            ctx.moveTo(0, 0);
            ctx.lineTo(midX, midY);
            ctx.lineTo(tipX, tipY);
            // One short barb, which is what makes it read as frost and not a spoke
            ctx.moveTo(midX, midY);
            ctx.lineTo(
                midX + Math.cos(f.angle + 1.1) * f.length * f.branch * 0.4,
                midY + Math.sin(f.angle + 1.1) * f.length * f.branch * 0.34,
            );
        }
        ctx.stroke();

        // Chunky chips, aligned to the pixel grid rather than rotated
        ctx.fillStyle = `rgba(240, 252, 255, ${0.85 * fade})`;
        for (const chip of this.chips) {
            ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
        }
        ctx.fillStyle = `rgba(120, 190, 240, ${0.7 * fade})`;
        for (const chip of this.chips) {
            ctx.fillRect(chip.x, chip.y + chip.h, chip.w, Math.max(1, chip.h * 0.4));
        }

        ctx.restore();
    }
}

// ============================================
// ACID ZONE - Bubbling acid puddle
// ============================================
export class AcidZone extends Zone {
    private particleTimer: number = 0;
    private bubbles: { x: number; y: number; size: number; speed: number; offset: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        // Acid is poured, not stamped: the puddle spreads out from where the
        // flask broke (see Zone.spreadIn)
        this.spreadIn(0.28);
        for (let i = 0; i < 12; i++) {
            this.bubbles.push({
                x: (Math.random() - 0.5) * radius * 1.6,
                y: (Math.random() - 0.5) * radius * 1.6,
                size: 3 + Math.random() * 6,
                speed: 20 + Math.random() * 30,
                offset: Math.random() * Math.PI * 2
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        for (const bubble of this.bubbles) {
            bubble.y -= bubble.speed * dt;
            if (bubble.y < -this.fullRadius) {
                bubble.y = this.fullRadius * 0.8;
                bubble.x = (Math.random() - 0.5) * this.fullRadius * 1.6;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.15) {
            this.particleTimer = 0;
            particles.emitAcidBubble(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(this.spreadScale, this.spreadScale);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.fullRadius);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.5)');
        gradient.addColorStop(0.5, 'rgba(50, 200, 0, 0.35)');
        gradient.addColorStop(1, 'rgba(100, 150, 0, 0.1)');

        ctx.beginPath();
        ctx.arc(0, 0, this.fullRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = 'rgba(100, 255, 50, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        for (const bubble of this.bubbles) {
            const dist = Math.hypot(bubble.x, bubble.y);
            if (dist < this.fullRadius) {
                ctx.beginPath();
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(150, 255, 100, ${0.3 + Math.sin(Date.now() / 200 + bubble.offset) * 0.2})`;
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 255, 50, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

// ============================================
// BURNING TRAIL ZONE - ground left on fire
// ============================================

/**
 * A patch of burning floor. Lives here rather than next to one weapon because
 * three of them lay it now: the Inferno Lash whips it out of its ring, a
 * Cluster Bomb leaves it in every crater, and a swept Void Ray drags it along
 * the beam path.
 */
export class BurningTrailZone extends Zone {
    /** Baked once: flames only bob, they never move to a new spot */
    private readonly flames: { x: number; y: number; scale: number; phase: number }[] = [];
    private readonly maxDuration: number;
    private age: number = 0;
    burnDps: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.3, '');
        this.maxDuration = duration;
        this.spreadIn(0.18);

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
        ctx.scale(this.spreadScale, this.spreadScale);

        const fade = Math.max(0, Math.min(1, this.duration / (this.maxDuration * 0.5)));

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.fullRadius);
        glow.addColorStop(0, `rgba(255, 150, 50, ${0.45 * fade})`);
        glow.addColorStop(0.5, `rgba(255, 80, 20, ${0.26 * fade})`);
        glow.addColorStop(1, 'rgba(200, 50, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.fullRadius, 0, Math.PI * 2);
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

// ============================================
// SPORE ZONE - A creeping fungal mat
// ============================================

/**
 * A patch of fungus rather than a coloured circle: mycelium threads crawl
 * across the ground and a cloud of spores breathes above them. Anything
 * standing in it gets *infected* — the damage keeps ticking after the enemy
 * walks out (see core/StatusEffects).
 *
 * Two things this deliberately does NOT draw:
 *   - **pixel mushrooms.** They were the loudest thing in the zone and they
 *     said nothing: caps sprouting one after another read as a decoration you
 *     had to look at, in the middle of a fight where you are reading damage
 *     numbers.
 *   - **a dashed boundary ring.** In a menu that would mark the edge; in
 *     combat it is a UI element painted onto the arena. The mat's own edge
 *     already tells you where it stops.
 *
 * The patch keeps creeping outward for its whole life, not just when evolved —
 * mould grows. All geometry is baked against `fullRadius` and scaled at draw
 * time, and re-baked only when the mat has grown enough to look thin.
 */
export class SporeZone extends Zone {
    /** Damage per second applied as an infection to anything inside */
    infectDps: number = 0;
    infectDuration: number = 3;
    contagious: boolean = false;
    /** Share of the starting radius the mat gains every second */
    creepRate: number = 0.07;

    protected puffs: { x: number; y: number; r: number; phase: number; drift: number }[] = [];
    /** Mycelium: short baked polylines crawling out of the centre */
    protected threads: Vector2[][] = [];
    protected age: number = 0;
    private baseRadius: number;
    private lastGeometryRadius: number;
    private particleTimer: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        this.baseRadius = radius;
        this.lastGeometryRadius = radius;
        this.spreadIn(0.35);
        this.rebuildGeometry();
    }

    /** Baked once, and again once the mat has outgrown the pattern */
    protected rebuildGeometry() {
        const r = this.fullRadius;

        this.puffs.length = 0;
        const puffCount = Math.min(16, 7 + Math.round(r / 20));
        for (let i = 0; i < puffCount; i++) {
            const angle = (i / puffCount) * Math.PI * 2 + Math.random() * 0.5;
            const dist = r * (0.2 + Math.random() * 0.65);
            this.puffs.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.75,
                r: r * (0.16 + Math.random() * 0.2),
                phase: Math.random() * Math.PI * 2,
                drift: 0.6 + Math.random() * 0.8,
            });
        }

        this.threads.length = 0;
        const threadCount = Math.min(10, 5 + Math.round(r / 30));
        for (let i = 0; i < threadCount; i++) {
            let angle = (i / threadCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const steps = 3 + Math.floor(Math.random() * 2);
            const step = (r * (0.6 + Math.random() * 0.35)) / steps;
            const path: Vector2[] = [{ x: 0, y: 0 }];
            let x = 0;
            let y = 0;
            for (let s = 0; s < steps; s++) {
                angle += (Math.random() - 0.5) * 0.9;
                x += Math.cos(angle) * step;
                y += Math.sin(angle) * step * 0.78;
                path.push({ x, y });
            }
            this.threads.push(path);
        }
    }

    update(dt: number) {
        // Creep first, then let the base class ease `radius` toward it
        this.fullRadius = this.baseRadius * (1 + this.creepRate * this.age);
        super.update(dt);
        this.age += dt;

        if (this.fullRadius > this.lastGeometryRadius * 1.35) {
            this.lastGeometryRadius = this.fullRadius;
            this.rebuildGeometry();
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.35) {
            this.particleTimer = 0;
            particles.emitSporeCloud(this.pos.x, this.pos.y, this.radius);
        }
    }

    onOverlap(enemy: any) {
        super.onOverlap(enemy);
        if (this.infectDps <= 0) return;
        status.infect(enemy, {
            dps: this.infectDps,
            duration: this.infectDuration,
            source: this.source,
            contagious: this.contagious,
            spreadRadius: this.radius * 0.8,
        });
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(this.spreadScale, this.spreadScale);

        const fade = Math.min(1, this.duration / 0.6);
        const breathe = 1 + Math.sin(this.age * 1.6) * 0.05;
        const r = this.fullRadius;

        // Damp ground patch
        ctx.globalAlpha = 0.32 * fade;
        ctx.fillStyle = this.contagious ? '#243d10' : '#2a2c14';
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mycelium threads — one path for the whole web
        ctx.globalAlpha = 0.55 * fade;
        ctx.strokeStyle = this.contagious ? '#7fc42c' : '#5d6a2c';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const thread of this.threads) {
            ctx.moveTo(thread[0].x, thread[0].y);
            for (let i = 1; i < thread.length; i++) ctx.lineTo(thread[i].x, thread[i].y);
        }
        ctx.stroke();

        // Spore puffs drifting above the mat
        for (const puff of this.puffs) {
            const lift = Math.sin(this.age * puff.drift + puff.phase) * 5;
            ctx.globalAlpha = (0.2 + 0.1 * Math.sin(this.age * 2 + puff.phase)) * fade;
            ctx.fillStyle = this.contagious ? '#8fd642' : '#7a8b3a';
            ctx.beginPath();
            ctx.arc(puff.x, puff.y + lift, puff.r * breathe, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

// ============================================
// NANOBOT CLOUD - Follows owner
// ============================================
export class NanobotCloud extends Zone {
    owner: any;

    constructor(owner: any, radius: number, duration: number, damage: number, interval: number) {
        super(owner.pos.x, owner.pos.y, radius, duration, damage, interval, '', 0);
        this.owner = owner;
    }

    update(dt: number) {
        this.pos.x = this.owner.pos.x;
        this.pos.y = this.owner.pos.y;

        super.update(dt);
    }

    /**
     * Deliberately draws nothing.
     *
     * The cloud used to paint a dashed ring, a radial haze and twelve orbiting
     * dots centred on the player — a permanent disc of glow sitting under the
     * one thing you need to keep track of, and doing it for the whole run. The
     * drones the weapon actually flies (see NaniteHiveCloud) read far better on
     * their own, so the aura is invisible and only its effect is felt.
     */
    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) {
        // intentionally empty — see the comment above
    }
}

// ============================================
// DELAYED EXPLOSION ZONE - For orbital strike
// ============================================
export class DelayedExplosionZone extends Zone {
    delay: number;
    initialDelay: number;
    exploded: boolean = false;
    isAtomic: boolean = false;

    private beamWidth: number = 0;
    private flashAlpha: number = 0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 0;
    private particlesEmitted: boolean = false;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, emoji: string, isAtomic: boolean = false) {
        super(x, y, radius, delay + 0.8, damage, Number.MAX_VALUE, emoji);
        this.delay = delay;
        this.initialDelay = delay;
        this.isAtomic = isAtomic;
    }

    update(dt: number) {
        if (this.exploded) {
            this.shockwaveRadius += dt * this.radius * 4;
            this.shockwaveAlpha -= dt * 2;
            this.flashAlpha -= dt * 4;

            if (this.shockwaveAlpha <= 0 && this.flashAlpha <= 0) {
                this.isDead = true;
            }
            return;
        }

        this.delay -= dt;

        const progress = 1 - (this.delay / this.initialDelay);
        this.beamWidth = progress * (this.isAtomic ? 40 : 15);

        if (this.delay <= 0) {
            this.explode();
            this.exploded = true;
            this.flashAlpha = 1;
            this.shockwaveAlpha = 1;
            this.shockwaveRadius = 0;
        }
    }

    /**
     * Impact feedback. Subclasses override this to spend a different particle
     * budget — a six-shell barrage cannot afford the single-strike burst.
     */
    protected emitImpact() {
        if (this.isAtomic) {
            particles.emitNuclear(this.pos.x, this.pos.y, this.radius);
            juice.addTrauma(0.55);
            juice.hitStop(0.06);
            juice.flash('#ffeeaa', 0.35, 0.4);
            juice.shockwave(this.pos.x, this.pos.y, this.radius * 2.2, '#ffcc55', 0.55, 8);
        } else {
            particles.emitOrbitalStrike(this.pos.x, this.pos.y, this.radius);
            juice.addTrauma(0.3);
            juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.8, '#ff8844', 0.4, 5);
        }
    }

    explode() {
        if (!this.particlesEmitted) {
            this.particlesEmitted = true;
            this.emitImpact();
        }

        const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInBlast) {
            if (distance(this.pos, enemy.pos) <= this.radius) {
                // Use DamageSystem for consistent damage handling
                damageSystem.dealDamage({
                    baseDamage: this.damage,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos
                });
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (!this.exploded) {
            const progress = 1 - (this.delay / this.initialDelay);

            // Outer target ring
            ctx.save();
            ctx.rotate(Date.now() / 500);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isAtomic ? `rgba(255, 200, 0, ${0.5 + Math.sin(Date.now() / 100) * 0.2})` : `rgba(255, 100, 0, ${0.4 + progress * 0.4})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.stroke();
            ctx.restore();

            // Inner targeting circle
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            const fillGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            if (this.isAtomic) {
                fillGradient.addColorStop(0, `rgba(255, 255, 100, ${0.4 * progress})`);
                fillGradient.addColorStop(0.5, `rgba(255, 150, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            } else {
                fillGradient.addColorStop(0, `rgba(255, 100, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            }
            ctx.fillStyle = fillGradient;
            ctx.fill();

            // Crosshair
            const crosshairLength = this.radius * 0.3;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + progress * 0.4})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(-crosshairLength, 0); ctx.lineTo(-crosshairLength * 0.3, 0);
            ctx.moveTo(crosshairLength * 0.3, 0); ctx.lineTo(crosshairLength, 0);
            ctx.moveTo(0, -crosshairLength); ctx.lineTo(0, -crosshairLength * 0.3);
            ctx.moveTo(0, crosshairLength * 0.3); ctx.lineTo(0, crosshairLength);
            ctx.stroke();

            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + Math.sin(Date.now() / 50) * 0.2})`;
            ctx.fill();

            // Beam from space
            const beamHeight = 800;
            const beamStartY = -beamHeight;

            const beamGlowWidth = this.beamWidth * 3;
            if (beamGlowWidth > 0) {
                const glowGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    glowGradient.addColorStop(0, `rgba(255, 255, 100, 0)`);
                    glowGradient.addColorStop(0.3, `rgba(255, 200, 0, ${0.2 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 150, 0, ${0.5 * progress})`);
                } else {
                    glowGradient.addColorStop(0, `rgba(255, 150, 50, 0)`);
                    glowGradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.15 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 80, 0, ${0.4 * progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth * 1.5, 0);
                ctx.lineTo(-beamGlowWidth * 1.5, 0);
                ctx.closePath();
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }

            if (this.beamWidth > 0) {
                const coreGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    coreGradient.addColorStop(0, `rgba(255, 255, 255, 0.1)`);
                    coreGradient.addColorStop(0.5, `rgba(255, 255, 200, ${progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 255, 150, ${progress})`);
                } else {
                    coreGradient.addColorStop(0, `rgba(255, 200, 100, 0.1)`);
                    coreGradient.addColorStop(0.7, `rgba(255, 150, 50, ${0.8 * progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 200, 100, ${progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth, 0);
                ctx.lineTo(-this.beamWidth, 0);
                ctx.closePath();
                ctx.fillStyle = coreGradient;
                ctx.fill();

                if (progress > 0.5) {
                    const sparkleAlpha = (progress - 0.5) * 2;
                    ctx.shadowColor = this.isAtomic ? '#ffff00' : '#ff6600';
                    ctx.shadowBlur = 30 * sparkleAlpha;
                    ctx.beginPath();
                    ctx.arc(0, 0, 10 + Math.random() * 5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            if (this.isAtomic && progress > 0.3) {
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(255, 200, 0, ${Math.sin(Date.now() / 100) * 0.5 + 0.5})`;
                ctx.fillText('☢️ NUCLEAR STRIKE INCOMING ☢️', 0, -this.radius - 30);
            }

        } else {
            // Explosion phase
            if (this.flashAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.fill();
            }

            if (this.shockwaveAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);

                if (this.isAtomic) {
                    ctx.strokeStyle = `rgba(255, 200, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 20;
                } else {
                    ctx.strokeStyle = `rgba(255, 100, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 10;
                }

                ctx.shadowColor = this.isAtomic ? '#ffcc00' : '#ff6600';
                ctx.shadowBlur = 20;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            if (this.flashAlpha > 0.3) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * (1 - this.flashAlpha * 0.3), 0, Math.PI * 2);
                const explosionGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
                if (this.isAtomic) {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.3, `rgba(255, 200, 0, ${this.flashAlpha * 0.8})`);
                    explosionGradient.addColorStop(0.6, `rgba(255, 100, 0, ${this.flashAlpha * 0.5})`);
                    explosionGradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
                } else {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.5, `rgba(255, 150, 50, ${this.flashAlpha * 0.6})`);
                    explosionGradient.addColorStop(1, `rgba(255, 80, 0, 0)`);
                }
                ctx.fillStyle = explosionGradient;
                ctx.fill();
            }

            if (this.flashAlpha > 0.5) {
                ctx.font = `${this.radius * 1.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillText(this.emoji, 0, 0);
            }

            // Atomic mushroom cloud
            if (this.isAtomic && this.flashAlpha > 0.1) {
                const cloudProgress = 1 - this.flashAlpha;
                const stemHeight = this.radius * 0.8 * cloudProgress;
                const capRadius = this.radius * 0.6 * cloudProgress;

                ctx.fillStyle = `rgba(200, 100, 0, ${this.flashAlpha * 0.7})`;
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                ctx.lineTo(20, 0);
                ctx.lineTo(30, -stemHeight);
                ctx.lineTo(-30, -stemHeight);
                ctx.closePath();
                ctx.fill();

                ctx.beginPath();
                ctx.arc(0, -stemHeight - capRadius * 0.3, capRadius, 0, Math.PI * 2);
                const capGradient = ctx.createRadialGradient(0, -stemHeight - capRadius * 0.3, 0, 0, -stemHeight - capRadius * 0.3, capRadius);
                capGradient.addColorStop(0, `rgba(255, 200, 100, ${this.flashAlpha * 0.8})`);
                capGradient.addColorStop(0.5, `rgba(255, 100, 0, ${this.flashAlpha * 0.6})`);
                capGradient.addColorStop(1, `rgba(100, 50, 0, ${this.flashAlpha * 0.3})`);
                ctx.fillStyle = capGradient;
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

// ============================================
// MIND BLAST ZONE - Psionic explosion
// ============================================
export class MindBlastZone extends Zone {
    stage: 'warning' | 'charge' | 'blast' | 'fade' = 'warning';
    stageTimer: number = 0;
    stunDuration: number = 0;
    private rings: { radius: number; alpha: number }[] = [];
    private chargeParticleTimer: number = 0;
    private blastTriggered: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, stunDuration: number = 0) {
        super(x, y, radius, 2.5, damage, 999, '');
        this.interval = 999;
        this.stunDuration = stunDuration;
    }

    update(dt: number) {
        this.stageTimer += dt;

        for (let i = this.rings.length - 1; i >= 0; i--) {
            this.rings[i].radius += 200 * dt;
            this.rings[i].alpha -= dt * 2;
            if (this.rings[i].alpha <= 0) this.rings.splice(i, 1);
        }

        if (this.stage === 'warning' && this.stageTimer > 0.5) {
            this.stage = 'charge';
        } else if (this.stage === 'charge') {
            this.chargeParticleTimer += dt;
            if (this.chargeParticleTimer > 0.05) {
                this.chargeParticleTimer = 0;
                particles.emitPsionicCharge(this.pos.x, this.pos.y);
            }

            if (this.stageTimer > 1.0) {
                this.stage = 'blast';
                particles.emitPsionicWave(this.pos.x, this.pos.y, this.radius);
                juice.addTrauma(0.22);
                juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.6, '#ff66ff', 0.45, 5);
                for (let i = 0; i < 3; i++) {
                    this.rings.push({ radius: 10 + i * 20, alpha: 1.0 });
                }
            }
        } else if (this.stage === 'blast') {
            if (!this.blastTriggered) {
                this.blastTriggered = true;
                const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

                enemiesInBlast.forEach(e => {
                    if (distance(this.pos, e.pos) <= this.radius) {
                        // Use DamageSystem for consistent damage handling
                        damageSystem.dealDamage({
                            baseDamage: this.damage,
                            source: this.source,
                            target: e,
                            position: e.pos
                        });
                        particles.emitHit(e.pos.x, e.pos.y, '#ff00ff');

                        if (this.stunDuration > 0) {
                            (e as any).stunTimer = this.stunDuration;
                        }
                    }
                });
            }

            if (this.stageTimer > 1.8) {
                this.stage = 'fade';
            }
        } else if (this.stage === 'fade' && this.stageTimer > 2.3) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (this.stage === 'warning') {
            const pulse = Math.sin(this.stageTimer * 10) * 0.2 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 255, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 100, 255, 0.8)';
            ctx.fill();

        } else if (this.stage === 'charge') {
            const progress = (this.stageTimer - 0.5) / 0.5;

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            gradient.addColorStop(0, 'rgba(255, 100, 255, 0.6)');
            gradient.addColorStop(0.5, 'rgba(200, 0, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(150, 0, 200, 0.1)');

            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255, 150, 255, 0.6)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const angle = (this.stageTimer * 3 + i * Math.PI / 3);
                const len = this.radius * progress * 0.8;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
                ctx.stroke();
            }

        } else if (this.stage === 'blast' || this.stage === 'fade') {
            const fadeAlpha = this.stage === 'fade' ? Math.max(0, 1 - (this.stageTimer - 1.8) / 0.5) : 1;

            for (const ring of this.rings) {
                ctx.beginPath();
                ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 100, 255, ${ring.alpha * fadeAlpha})`;
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff00ff';
                ctx.shadowBlur = 15;
                ctx.stroke();
            }

            const coreSize = this.radius * 0.6 * fadeAlpha;
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * fadeAlpha})`);
            gradient.addColorStop(0.3, `rgba(255, 100, 255, ${0.6 * fadeAlpha})`);
            gradient.addColorStop(1, `rgba(150, 0, 200, 0)`);

            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// PLASMA EXPLOSION ZONE - Instant explosion with chain potential
// ============================================
export class PlasmaExplosionZone extends Zone {
    private flashAlpha: number = 1.0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 1.0;
    private damageDealt: boolean = false;
    isEvolved: boolean;
    onChainExplosion?: (x: number, y: number) => void;

    /**
     * Seconds to wait before detonating. Cluster/chain blasts stagger
     * themselves this way so twenty explosions never resolve in one frame.
     */
    detonationDelay: number = 0;
    /** Fired when a delayed blast actually goes off (particles live here) */
    onDetonate?: (x: number, y: number, radius: number) => void;

    constructor(x: number, y: number, radius: number, damage: number, isEvolved: boolean = false) {
        // Short duration for visual effect only
        super(x, y, radius, 0.6, damage, Number.MAX_VALUE, '');
        this.isEvolved = isEvolved;
    }

    update(dt: number) {
        if (this.detonationDelay > 0) {
            this.detonationDelay -= dt;
            this.duration += dt; // don't age while waiting to go off
            if (this.detonationDelay > 0) return;
            this.onDetonate?.(this.pos.x, this.pos.y, this.radius);
        }

        // Deal damage immediately on first frame
        if (!this.damageDealt) {
            this.damageDealt = true;
            const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.radius);

            for (const enemy of enemiesInBlast) {
                const dist = distance(this.pos, enemy.pos);
                if (dist <= this.radius) {
                    damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this.source,
                        target: enemy,
                        position: enemy.pos
                    });

                    // Evolved: trigger chain explosions on hit enemies
                    if (this.isEvolved && this.onChainExplosion && Math.random() < 0.5) {
                        this.onChainExplosion(enemy.pos.x, enemy.pos.y);
                    }
                }
            }
        }

        // Visual fade out
        this.flashAlpha -= dt * 3;
        this.shockwaveRadius += dt * this.radius * 4;
        this.shockwaveAlpha -= dt * 2.5;

        if (this.flashAlpha <= 0 && this.shockwaveAlpha <= 0) {
            this.isDead = true;
        }

        this.duration -= dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        // Nothing to see until the fuse runs out
        if (this.detonationDelay > 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Shockwave ring
        if (this.shockwaveAlpha > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isEvolved
                ? `rgba(255, 150, 50, ${this.shockwaveAlpha})`
                : `rgba(100, 255, 100, ${this.shockwaveAlpha})`;
            ctx.lineWidth = this.isEvolved ? 8 : 5;
            ctx.shadowColor = this.isEvolved ? '#ff6600' : '#00ff00';
            ctx.shadowBlur = 15;
            ctx.stroke();
        }

        // Explosion core
        if (this.flashAlpha > 0) {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * this.flashAlpha);
            if (this.isEvolved) {
                gradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                gradient.addColorStop(0.3, `rgba(255, 150, 50, ${this.flashAlpha * 0.8})`);
                gradient.addColorStop(0.6, `rgba(255, 80, 0, ${this.flashAlpha * 0.5})`);
                gradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
            } else {
                gradient.addColorStop(0, `rgba(200, 255, 200, ${this.flashAlpha})`);
                gradient.addColorStop(0.3, `rgba(100, 255, 100, ${this.flashAlpha * 0.8})`);
                gradient.addColorStop(0.6, `rgba(50, 200, 50, ${this.flashAlpha * 0.5})`);
                gradient.addColorStop(1, `rgba(0, 150, 0, 0)`);
            }

            ctx.beginPath();
            ctx.arc(0, 0, this.radius * this.flashAlpha, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Central flash
            if (this.flashAlpha > 0.5) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * 0.3 * this.flashAlpha, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.fill();
            }

            // Emoji at center during flash
            if (this.flashAlpha > 0.7) {
                ctx.font = `${this.radius * 0.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillText(this.isEvolved ? '💥' : '💣', 0, 0);
            }
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// Re-export distance for use in zones
export { distance };


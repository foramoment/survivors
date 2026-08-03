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
     * The radius the weapon asked for — `area * stats.area`. The live `radius`
     * is this multiplied by the growth ramp below, so area powerups scale what
     * the zone *starts* at and the growth rides on top.
     */
    baseRadius: number;
    /**
     * Radius multipliers at the moment it lands and at the moment it dies.
     *
     * A ground zone grows across its **whole life**, not in a quarter of a
     * second. The first cut of this ramped over 0.3s, which is not "acid
     * spreading" — it is a sprite scaling up. Frost opens at a quarter of its
     * final size and takes the full field duration to reach it; the spore mat
     * opens at its configured size and swells to 1.5x as the fungus grows.
     *
     * 1/1 (the default) means "appear at full size and stay there", which is
     * right for a telegraphed blast — you already watched a reticle close on it.
     */
    growFrom: number = 1;
    growTo: number = 1;
    /** Duration the zone was born with, so the ramp knows how far along it is */
    readonly lifetime: number;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, emoji: string, slowEffect: number = 0) {
        super(x, y, radius);
        this.baseRadius = radius;
        this.lifetime = Math.max(0.0001, duration);
        this.duration = duration;
        this.damage = damage;
        this.interval = interval;
        this.emoji = emoji;
        this.slowEffect = slowEffect;
    }

    /**
     * Turn the growth ramp on. Call from a subclass constructor so the zone is
     * already the right size before anything draws it.
     */
    protected growOver(from: number, to: number) {
        this.growFrom = from;
        this.growTo = to;
        this.radius = this.baseRadius * from;
    }

    /** 0 the instant it lands, 1 the instant it dies */
    protected get lifeProgress(): number {
        return Math.max(0, Math.min(1, 1 - this.duration / this.lifetime));
    }

    /**
     * Current size as a multiple of `baseRadius`. Zones that bake their
     * decoration against `baseRadius` multiply the baked offsets by this, so
     * the whole pattern grows together instead of appearing over a growing
     * circle.
     */
    protected get growScale(): number {
        return this.baseRadius > 0 ? this.radius / this.baseRadius : 1;
    }

    update(dt: number) {
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;

        this.timer += dt;

        if (this.growFrom !== this.growTo) {
            this.radius = this.baseRadius
                * (this.growFrom + (this.growTo - this.growFrom) * this.lifeProgress);
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

        // No glyph in the middle. Every real zone overrides this method, so the
        // base draw is a placeholder — and a placeholder that calls fillText
        // teaches the wrong thing to the next zone that copies it.
        ctx.restore();
    }
}

// ============================================
// FROST ZONE - Slows enemies
// ============================================
/**
 * A patch of frozen ground that creeps outward for the whole time it exists.
 *
 * Two things this went through. The original was a perfect circle, a dashed
 * ring and eight loose triangles — programmer placeholder. The second pass gave
 * it an uneven rimed outline, and the outline was the problem: a hard stroked
 * edge on the floor reads as a UI shape, not as ice. So the body is a soft
 * gradient inside an irregular silhouette with **no stroke at all**, and the
 * edge is told by particles drifting off the rim (`emitZoneEdge`) — a haze that
 * thins out instead of a line that stops.
 *
 * Everything is baked once against `baseRadius` and multiplied by the growth
 * ramp at draw time, so the whole pattern creeps outward together and nothing
 * is recomputed per frame (see the VFX rules in CLAUDE.md).
 */
export class FrostZone extends Zone {
    /** Share of its final size the field opens at */
    static readonly SEED = 0.265;
    private particleTimer: number = 0;
    private edgeTimer: number = 0;
    /** Uneven rim, as unit-length offsets from the centre */
    private rim: Vector2[] = [];
    /** Frost creeping out of the middle: [angle, length, branch offset] */
    private fingers: { angle: number; length: number; kink: number; branch: number }[] = [];
    /** Pixel chips frozen into the surface */
    private chips: { x: number; y: number; w: number; h: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, slowEffect: number = 0.5) {
        super(x, y, radius, duration, damage, interval, '', slowEffect);
        // Opens as a small patch under the impact and takes the whole field
        // duration to reach the size the weapon was configured for
        this.growOver(FrostZone.SEED, 1);
        this.bakeGeometry();
    }

    private bakeGeometry() {
        const r = this.baseRadius;

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
        if (this.particleTimer > 0.12) {
            this.particleTimer = 0;
            particles.emitColdMist(this.pos.x, this.pos.y, this.radius);
        }

        // The edge is told by particles, not by a line
        this.edgeTimer += dt;
        if (this.edgeTimer > 0.09) {
            this.edgeTimer = 0;
            particles.emitZoneEdge(this.pos.x, this.pos.y, this.radius,
                ['#cfeeff', '#8fd4ff', '#ffffff'], 2);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const g = this.growScale;
        // Fade out over the last half second instead of vanishing mid-frame
        const fade = Math.max(0, Math.min(1, this.duration / 0.5));

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(g, g);

        // Uneven silhouette, filled only — no stroke.
        ctx.beginPath();
        ctx.moveTo(this.rim[0].x, this.rim[0].y);
        for (let i = 1; i < this.rim.length; i++) ctx.lineTo(this.rim[i].x, this.rim[i].y);
        ctx.closePath();

        // The gradient reaches zero alpha before the silhouette ends, so the
        // rim is already transparent where the shape stops. That is the whole
        // trick: a hard stroked outline on the floor reads as a selection
        // marker, and this reads as frost.
        const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, this.baseRadius);
        floor.addColorStop(0, `rgba(150, 226, 255, ${0.46 * fade})`);
        floor.addColorStop(0.45, `rgba(70, 170, 244, ${0.34 * fade})`);
        floor.addColorStop(0.8, `rgba(34, 118, 206, ${0.15 * fade})`);
        floor.addColorStop(1, 'rgba(24, 96, 190, 0)');
        ctx.fillStyle = floor;
        ctx.fill();

        // Frost fingers crawling out of the centre. Their reach follows the
        // growth, so the ice visibly grows into the ground.
        ctx.strokeStyle = `rgba(224, 246, 255, ${0.5 * fade})`;
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

        // Chunky chips, aligned to the pixel grid rather than rotated. They sit
        // well inside the rim so nothing hard-edged touches the boundary.
        ctx.fillStyle = `rgba(240, 252, 255, ${0.7 * fade})`;
        for (const chip of this.chips) {
            ctx.fillRect(chip.x, chip.y, chip.w, chip.h);
        }
        ctx.fillStyle = `rgba(120, 190, 240, ${0.55 * fade})`;
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
    private edgeTimer: number = 0;
    private bubbles: { x: number; y: number; size: number; speed: number; offset: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        // Acid is poured, not stamped: the puddle keeps creeping outward the
        // whole time it is eating the floor
        this.growOver(0.4, 1);
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
            if (bubble.y < -this.baseRadius) {
                bubble.y = this.baseRadius * 0.8;
                bubble.x = (Math.random() - 0.5) * this.baseRadius * 1.6;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.15) {
            this.particleTimer = 0;
            particles.emitAcidBubble(this.pos.x, this.pos.y, this.radius);
        }

        // Acid mist creeping off the edge, in place of the outline this used
        // to stroke around itself
        this.edgeTimer += dt;
        if (this.edgeTimer > 0.1) {
            this.edgeTimer = 0;
            particles.emitZoneEdge(this.pos.x, this.pos.y, this.radius,
                ['#b4ff3c', '#5fe08a', '#d6ff8a'], 2);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(this.growScale, this.growScale);

        // Fades to nothing at the rim and is never stroked — the puddle has no
        // drawn boundary, only the mist coming off it
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.baseRadius);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.46)');
        gradient.addColorStop(0.5, 'rgba(50, 200, 0, 0.32)');
        gradient.addColorStop(0.85, 'rgba(90, 160, 0, 0.12)');
        gradient.addColorStop(1, 'rgba(100, 150, 0, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        for (const bubble of this.bubbles) {
            const dist = Math.hypot(bubble.x, bubble.y);
            if (dist < this.baseRadius) {
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
        // Fire spreads while it burns
        this.growOver(0.55, 1);

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
        ctx.scale(this.growScale, this.growScale);

        const fade = Math.max(0, Math.min(1, this.duration / (this.maxDuration * 0.5)));

        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.baseRadius);
        glow.addColorStop(0, `rgba(255, 150, 50, ${0.45 * fade})`);
        glow.addColorStop(0.5, `rgba(255, 80, 20, ${0.26 * fade})`);
        glow.addColorStop(1, 'rgba(200, 50, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.baseRadius, 0, Math.PI * 2);
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
 * across the ground, pixel mushrooms sprout out of them one at a time, and a
 * cloud of spores breathes above. Anything standing in it gets *infected* —
 * the damage keeps ticking after the enemy walks out (core/StatusEffects).
 *
 * The mushrooms went away for one iteration and came back: they are the thing
 * that makes the patch read as alive rather than as a stain, and sprouting them
 * on a stagger is the point — the mat *grows*, over its whole life, rather than
 * being stamped down at full size. What did not come back is the dashed
 * boundary ring, which was a UI element painted onto the arena.
 *
 * All geometry is baked against `baseRadius` and scaled at draw time.
 */
export class SporeZone extends Zone {
    /** Damage per second applied as an infection to anything inside */
    infectDps: number = 0;
    infectDuration: number = 3;
    contagious: boolean = false;

    protected puffs: { x: number; y: number; r: number; phase: number; drift: number }[] = [];
    /** Mycelium: short baked polylines crawling out of the centre */
    protected threads: Vector2[][] = [];
    /** Caps sprouting on a stagger; `grow` runs 0..1 */
    protected caps: { x: number; y: number; scale: number; variant: number; grow: number; at: number }[] = [];
    protected age: number = 0;
    private particleTimer: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        // Opens at the size the weapon configured and swells by half again as
        // the fungus takes hold — mould grows, it does not land
        this.growOver(1, 1.5);
        this.rebuildGeometry();
    }

    /** Baked once against the final size the mat will reach */
    protected rebuildGeometry() {
        const r = this.baseRadius;

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

        // Caps are spread across the FIRST HALF of the patch's life, so they
        // keep appearing while it spreads instead of all popping at once
        this.caps.length = 0;
        const capCount = Math.min(7, 3 + Math.round(r / 40));
        for (let i = 0; i < capCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = r * (0.12 + Math.random() * 0.72);
            this.caps.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist * 0.7,
                scale: 0.7 + Math.random() * 0.7,
                variant: Math.floor(Math.random() * 3),
                grow: 0,
                at: (i / capCount) * this.lifetime * 0.5,
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.age += dt;

        // One mushroom pushes up after another
        for (const cap of this.caps) {
            if (cap.grow < 1 && this.age >= cap.at) {
                cap.grow = Math.min(1, cap.grow + dt * 2.2);
            }
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
        ctx.scale(this.growScale, this.growScale);

        const fade = Math.min(1, this.duration / 0.6);
        const breathe = 1 + Math.sin(this.age * 1.6) * 0.05;
        const r = this.baseRadius;

        // Damp ground patch, fading out at the rim rather than ending on a line
        const soil = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        const soilColor = this.contagious ? '36, 61, 16' : '42, 44, 20';
        soil.addColorStop(0, `rgba(${soilColor}, ${0.36 * fade})`);
        soil.addColorStop(0.75, `rgba(${soilColor}, ${0.24 * fade})`);
        soil.addColorStop(1, `rgba(${soilColor}, 0)`);
        ctx.fillStyle = soil;
        ctx.beginPath();
        ctx.ellipse(0, 0, r, r * 0.78, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mycelium threads. Faint on purpose — they are texture under the
        // spores, not the drawing. Hard strokes are the thing this art style
        // keeps having to be talked out of.
        ctx.globalAlpha = 0.3 * fade;
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
        ctx.restore();

        // Mushrooms are drawn OUTSIDE the growth scale: a mushroom grows where
        // it sprouted, it does not slide outward as the patch spreads. Under
        // the scaled transform every cap crept away from its own spot, which
        // looked like the whole colony was being pushed off the ground.
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.globalAlpha = fade;
        for (const cap of this.caps) {
            if (cap.grow <= 0) continue;
            this.drawMushroom(ctx, cap.x, cap.y, cap.scale * cap.grow, cap.variant);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    /** Chunky pixel mushroom: stalk, cap, one spot */
    protected drawMushroom(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, variant: number) {
        const p = Math.max(2, Math.round(3 * scale));
        const capColor = this.contagious ? '#9ee83c' : ['#b4552e', '#8a6a2e', '#7a4a6a'][variant];
        const capShade = this.contagious ? '#5f9418' : ['#7a3218', '#5c451c', '#4e2d47'][variant];

        ctx.fillStyle = '#d8d2b8';
        ctx.fillRect(x - p / 2, y - p, p, p * 2);

        ctx.fillStyle = capColor;
        ctx.fillRect(x - p * 2, y - p * 2, p * 4, p);
        ctx.fillRect(x - p * 1.5, y - p * 3, p * 3, p);

        ctx.fillStyle = capShade;
        ctx.fillRect(x - p * 2, y - p, p * 4, Math.max(1, p * 0.5));
        ctx.fillRect(x - p * 0.5, y - p * 3, p, p);
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
            // Telegraph, not decoration: this ring exists to be read as an
            // instrument in the seconds BEFORE the shell lands.
            // ast-grep-ignore: no-ui-in-arena
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
            // The 'warning' stage IS the telegraph — it only draws before the
            // blast charges
            // ast-grep-ignore: no-ui-in-arena
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

        // Shockwave ring. Plasma burns violet and the evolved cluster burns
        // orange — it used to come out acid green, which belonged to a
        // different weapon entirely and clashed with the violet canister that
        // had just been thrown.
        if (this.shockwaveAlpha > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isEvolved
                ? `rgba(255, 150, 50, ${this.shockwaveAlpha})`
                : `rgba(214, 140, 255, ${this.shockwaveAlpha})`;
            ctx.lineWidth = this.isEvolved ? 8 : 5;
            ctx.shadowColor = this.isEvolved ? '#ff6600' : '#b06cff';
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
                gradient.addColorStop(0, `rgba(255, 246, 255, ${this.flashAlpha})`);
                gradient.addColorStop(0.3, `rgba(214, 140, 255, ${this.flashAlpha * 0.85})`);
                gradient.addColorStop(0.6, `rgba(150, 70, 230, ${this.flashAlpha * 0.5})`);
                gradient.addColorStop(1, `rgba(90, 30, 160, 0)`);
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

            // A hard white core at the heart of the blast. This used to be
            // `fillText('💣')` — the most expensive way to draw anything, and
            // against the no-emoji-in-the-arena rule in CLAUDE.md.
            if (this.flashAlpha > 0.7) {
                const core = this.radius * 0.18 * this.flashAlpha;
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-core, -core, core * 2, core * 2);
            }
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// Re-export distance for use in zones
export { distance };


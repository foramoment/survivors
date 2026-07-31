/**
 * BASE BEAM CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { Projectile } from './Projectile';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// BEAM - Simple visual beam (no collision)
// ============================================
export class Beam extends Projectile {
    start: Vector2;
    end: Vector2;
    color: string;
    width: number;

    constructor(start: Vector2, end: Vector2, duration: number, color: string, width: number) {
        super(start.x, start.y, { x: 0, y: 0 }, duration, 0, 0, '');
        this.canCollide = false;
        this.start = { ...start };
        this.end = { ...end };
        this.color = color;
        this.width = width;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * (this.duration * 5);
        ctx.lineCap = 'round';

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;

        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// VOID RAY BEAM - Charging beam weapon
// ============================================
export class VoidRayBeam extends Projectile {
    owner: any;
    target: any;
    stage: 'charge' | 'fire' | 'fade' = 'charge';
    timer: number = 0;
    chargeTime: number = 0.5;
    fireTime: number = 0.2;
    fadeTime: number = 0.3;
    width: number = 0;
    maxWidth: number = 20;
    color: string = '#bd00ff';
    isEvolved: boolean = false;
    damageDealt: boolean = false;
    targetLastPos: Vector2;

    // Callback for the evolved collapse at the impact point
    onVoidExplosion?: (x: number, y: number, damage: number) => void;

    /** Where the ray actually stops (it overshoots the target) */
    private beamEnd: Vector2 | null = null;
    /** Impact points from the last shot, drawn as sparks along the beam */
    private hitMarks: Vector2[] = [];

    constructor(owner: any, target: any, damage: number, isEvolved: boolean) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, 2, damage, 0, '');
        this.owner = owner;
        this.target = target;
        this.canCollide = false;
        this.isEvolved = isEvolved;
        this.targetLastPos = { x: target.pos.x, y: target.pos.y };
        if (isEvolved) {
            this.maxWidth = 50;
            this.color = '#ff00ff';
        }
    }

    update(dt: number) {
        this.timer += dt;

        if (this.target && !this.target.isDead) {
            this.targetLastPos = { x: this.target.pos.x, y: this.target.pos.y };
        }

        if (this.stage === 'charge') {
            if (this.timer >= this.chargeTime) {
                this.stage = 'fire';
                this.timer = 0;
                this.fire();
            }
        } else if (this.stage === 'fire') {
            if (this.timer >= this.fireTime) {
                this.stage = 'fade';
                this.timer = 0;
            }
        } else if (this.stage === 'fade') {
            if (this.timer >= this.fadeTime) {
                this.isDead = true;
            }
        }
    }

    /**
     * A ray should hit everything it passes through, not just whatever it was
     * aimed at — that is what makes it read as a beam instead of a bullet.
     * Enemies behind the target take reduced damage.
     */
    private fire() {
        const start = this.owner.pos;
        const end = this.targetLastPos;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy) || 1;
        const nx = dx / length;
        const ny = dy / length;
        const reach = length + (this.isEvolved ? 260 : 60);
        const halfWidth = this.maxWidth * 0.6;

        const mid = { x: start.x + nx * reach * 0.5, y: start.y + ny * reach * 0.5 };
        const candidates = levelSpatialHash.getNearby(mid, reach * 0.5 + halfWidth + 40);

        this.hitMarks.length = 0;
        for (const enemy of candidates) {
            if (enemy.isDead) continue;
            // Project onto the beam axis
            const t = (enemy.pos.x - start.x) * nx + (enemy.pos.y - start.y) * ny;
            if (t < 0 || t > reach) continue;
            const perp = Math.abs((enemy.pos.x - start.x) * -ny + (enemy.pos.y - start.y) * nx);
            if (perp > halfWidth + enemy.radius) continue;

            // Full damage up to the aimed target, then a falloff behind it
            const falloff = t <= length ? 1 : 0.6;
            damageSystem.dealDamage({
                baseDamage: this.damage * falloff,
                source: this.source ?? this,
                target: enemy,
                position: enemy.pos,
            });
            if (this.hitMarks.length < 8) this.hitMarks.push({ x: enemy.pos.x, y: enemy.pos.y });
        }

        if (this.hitMarks.length > 0) {
            particles.emitHit(this.hitMarks[0].x, this.hitMarks[0].y, this.color);
        }

        this.beamEnd = { x: start.x + nx * reach, y: start.y + ny * reach };

        if (this.isEvolved && this.onVoidExplosion) {
            this.onVoidExplosion(this.targetLastPos.x, this.targetLastPos.y, this.damage * 0.6);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const start = this.owner.pos;
        const end = this.beamEnd ?? this.targetLastPos;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        if (this.stage === 'charge') {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = `rgba(189, 0, 255, ${this.timer / this.chargeTime})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(start.x, start.y, 10 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.fill();

        } else if (this.stage === 'fire' || this.stage === 'fade') {
            let width = this.maxWidth;
            let alpha = 1;

            if (this.stage === 'fade') {
                alpha = 1 - (this.timer / this.fadeTime);
                width *= alpha;
            }

            ctx.globalAlpha = alpha;
            ctx.lineCap = 'butt';

            // Outer bloom — the one shadowBlur pass this effect gets
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = width;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 18;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Hard-edged core, then a white filament: reads as a solid lance
            ctx.strokeStyle = 'rgba(255, 220, 255, 0.85)';
            ctx.lineWidth = Math.max(2, width * 0.45);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, width * 0.15);
            ctx.stroke();

            // Muzzle flare
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(start.x, start.y, width * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Sparks where the beam bit into something
            ctx.fillStyle = this.color;
            for (const mark of this.hitMarks) {
                const flick = 3 + Math.random() * 4;
                ctx.fillRect(mark.x - flick / 2, mark.y - flick / 2, flick, flick);
            }
        }

        ctx.restore();
    }
}

// ============================================
// CHAIN LIGHTNING - Sequential arcing bolt
// ============================================

/** One arc of a chain: a pre-baked polyline that fades out */
export interface BoltSegment {
    points: Vector2[];
    /** Short-lived branch forks, baked with the segment */
    forks: Vector2[][];
    alpha: number;
    width: number;
}

/**
 * Chain lightning that walks from enemy to enemy **over time** — one hop every
 * `hopInterval` seconds — instead of resolving the whole chain in a single
 * frame.
 *
 * Two reasons this is better than the old version:
 *   1. Look: you can actually watch the bolt travel, and each arc is baked
 *      once (points are generated when the segment is created, not re-randomised
 *      every frame), so bolts read as solid lightning instead of static.
 *   2. Cost: damage, particles and damage numbers are spread across frames, so
 *      a long chain can't spike a single frame.
 *
 * The first arc falls from off-screen above the target — the strike comes from
 * the sky, not from the player, so there is no laser-pointer line any more.
 */
export class ChainLightning extends Projectile {
    /** Remaining hops */
    bounces: number;
    /** How far a single hop may reach */
    chainRange: number = 170;
    /** Seconds between hops */
    hopInterval: number = 0.05;
    /** Damage multiplier applied per hop */
    damageFalloff: number = 0.9;
    /** Height the opening bolt falls from */
    skyHeight: number = 460;
    /** Total distance the chain may cover before it gives up */
    maxChainLength: number;

    segments: BoltSegment[] = [];
    hitEnemies: Set<any> = new Set();
    currentPos: Vector2;
    totalChainLength: number = 0;
    initialDamage: number;
    /** Bolt palette (glow, body, core) */
    colors: [string, string, string] = ['rgba(80, 190, 255,', 'rgba(160, 230, 255,', 'rgba(255, 255, 255,'];

    onHit: (target: any, damage: number) => void = () => { };
    /** Fires at every impact point, including the first — used for AoE drops */
    onArc: (pos: Vector2, hop: number) => void = () => { };

    private hopTimer: number = 0;
    private started: boolean = false;
    private hopsDone: number = 0;

    constructor(x: number, y: number, damage: number, bounces: number, maxChainLength: number = 700) {
        super(x, y, { x: 0, y: 0 }, 10, damage, 0, '');
        this.canCollide = false;
        this.currentPos = { x, y };
        this.bounces = bounces;
        this.maxChainLength = maxChainLength;
        this.initialDamage = damage;
    }

    update(dt: number) {
        // Fade existing arcs
        for (let i = this.segments.length - 1; i >= 0; i--) {
            this.segments[i].alpha -= dt * 3.2;
            if (this.segments[i].alpha <= 0) this.segments.splice(i, 1);
        }

        if (!this.started) {
            this.started = true;
            // Opening strike out of the sky
            this.segments.push(this.buildSegment(
                { x: this.pos.x + (Math.random() - 0.5) * 60, y: this.pos.y - this.skyHeight },
                this.pos,
                34,
                5,
            ));
            this.onArc(this.pos, 0);
        }

        this.hopTimer += dt;
        while (this.bounces > 0 && this.hopTimer >= this.hopInterval) {
            this.hopTimer -= this.hopInterval;
            if (!this.hop()) {
                this.bounces = 0;
                break;
            }
        }

        if (this.bounces <= 0 && this.segments.length === 0) {
            this.isDead = true;
        }
    }

    /** Advance the chain by one enemy. Returns false when it can't continue. */
    private hop(): boolean {
        let target: any = null;
        let minDst = this.chainRange;

        const nearby = levelSpatialHash.getWithinRadius(this.currentPos, this.chainRange);
        for (const enemy of nearby) {
            if (this.hitEnemies.has(enemy)) continue;
            const d = distance(this.currentPos, enemy.pos);
            if (d < minDst) {
                minDst = d;
                target = enemy;
            }
        }
        if (!target) return false;

        const hopLength = distance(this.currentPos, target.pos);
        if (this.totalChainLength + hopLength > this.maxChainLength) return false;

        this.totalChainLength += hopLength;
        this.hitEnemies.add(target);
        this.hopsDone++;
        this.bounces--;

        this.onHit(target, this.initialDamage * Math.pow(this.damageFalloff, this.hopsDone));
        this.segments.push(this.buildSegment({ ...this.currentPos }, { ...target.pos }, 16, 4));
        this.onArc({ ...target.pos }, this.hopsDone);

        this.currentPos = { ...target.pos };
        return true;
    }

    /** Bake a jagged polyline (plus a few forks) once, so it doesn't crawl */
    private buildSegment(start: Vector2, end: Vector2, jitter: number, width: number): BoltSegment {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const steps = Math.min(14, Math.max(3, Math.round(dist / 26)));
        const perpX = -dy / dist;
        const perpY = dx / dist;

        const points: Vector2[] = [{ ...start }];
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            // Taper the jitter at both ends so the bolt visibly connects
            const taper = 1 - Math.abs(t - 0.5) * 1.6;
            const offset = (Math.random() - 0.5) * 2 * jitter * taper;
            points.push({
                x: start.x + dx * t + perpX * offset,
                y: start.y + dy * t + perpY * offset,
            });
        }
        points.push({ ...end });

        // A couple of dead-end forks sell the "electric" read
        const forks: Vector2[][] = [];
        const forkCount = dist > 70 ? 2 : 1;
        for (let f = 0; f < forkCount; f++) {
            const i = 1 + Math.floor(Math.random() * Math.max(1, points.length - 2));
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.8;
            const len = 12 + Math.random() * 22;
            forks.push([
                points[i],
                {
                    x: points[i].x + Math.cos(angle) * len * 0.5,
                    y: points[i].y + Math.sin(angle) * len * 0.5,
                },
                {
                    x: points[i].x + Math.cos(angle + 0.5) * len,
                    y: points[i].y + Math.sin(angle + 0.5) * len,
                },
            ]);
        }

        return { points, forks, alpha: 1, width };
    }

    /** Safety cap — arcs fade in ~0.3s so this is rarely reached */
    protected static readonly MAX_DRAWN_SEGMENTS = 10;

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.segments.length === 0) return;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const drawn = this.segments.length > ChainLightning.MAX_DRAWN_SEGMENTS
            ? this.segments.slice(-ChainLightning.MAX_DRAWN_SEGMENTS)
            : this.segments;

        // Flicker is a per-frame alpha wobble, never a geometry change
        const flicker = 0.85 + 0.15 * Math.sin(performance.now() / 22);
        const [glow, body, core] = this.colors;

        for (const seg of drawn) {
            const a = Math.max(0, Math.min(1, seg.alpha)) * flicker;

            this.tracePath(ctx, seg.points);
            ctx.strokeStyle = `${glow} ${(a * 0.4).toFixed(3)})`;
            ctx.lineWidth = seg.width * 3.5;
            ctx.stroke();

            this.tracePath(ctx, seg.points);
            ctx.strokeStyle = `${body} ${a.toFixed(3)})`;
            ctx.lineWidth = seg.width;
            ctx.stroke();

            this.tracePath(ctx, seg.points);
            ctx.strokeStyle = `${core} ${a.toFixed(3)})`;
            ctx.lineWidth = Math.max(1, seg.width * 0.4);
            ctx.stroke();

            if (a > 0.35) {
                ctx.strokeStyle = `${body} ${(a * 0.5).toFixed(3)})`;
                ctx.lineWidth = Math.max(1, seg.width * 0.35);
                for (const fork of seg.forks) {
                    this.tracePath(ctx, fork);
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }

    private tracePath(ctx: CanvasRenderingContext2D, points: Vector2[]) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    }
}

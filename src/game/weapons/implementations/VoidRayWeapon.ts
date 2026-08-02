/**
 * VOID RAY WEAPON
 *
 * A lance that is *dragged* across the field rather than pointed at one enemy.
 *
 * The old Void Ray charged for half a second and fired a straight line at
 * whatever was nearest. It hit everything along that line, which sounds fine
 * and played as the dullest weapon in the pool: there was no moment to watch,
 * no decision in it, and levelling it changed a damage number and nothing else.
 *
 * What it does now: it locks the beam onto a target, then **sweeps** — the
 * emitter swings and the burning end of the beam is pulled across to the next
 * enemy, cutting everything the line crosses on the way. The floor it swept
 * over is left on fire.
 *
 * Evolved — Void Cannon: three sweeps instead of one, and each one reaches for
 * something *further out* rather than the nearest body, so the beam zigzags
 * across the whole pack instead of wobbling between two enemies at your feet.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { Projectile, BurningTrailZone } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { particles } from '../../core/ParticleSystem';
import { juice } from '../../core/JuiceSystem';

/** Closest a sweep will reach for — anything nearer is not worth swinging to */
const SWEEP_MIN_REACH = 130;
/** Furthest a sweep will reach */
const SWEEP_MAX_REACH = 430;
/** Seconds one sweep takes, however long the path is */
const SWEEP_TIME = 0.3;
/** Distance between the fires dropped along the swept path */
const TRAIL_SPACING = 110;
/** Ceiling on trail fires per shot, so a long zigzag can't carpet the arena */
const MAX_TRAILS = 8;

// ============================================
// SWEEPING LANCE - the beam itself
// ============================================

export class SweepingLance extends Projectile {
    owner: any;
    /** Player, then every enemy position the beam is dragged through */
    private nodes: Vector2[];
    private halfWidth: number;
    private falloff: number;

    private stage: 'charge' | 'sweep' | 'fade' = 'charge';
    private timer: number = 0;
    private chargeTime: number = 0.32;
    private fadeTime: number = 0.22;

    /** How far along the whole path the burning end currently is */
    private travelled: number = 0;
    private pathLength: number = 0;
    private headSpeed: number = 0;
    /** Index of the last node the head has passed */
    private resolved: number = 0;
    private hit: Set<any> = new Set();

    private lastTrailAt: number = 0;
    private trailsDropped: number = 0;

    color: string;
    /** Fires dropped on the floor the beam swept over */
    onTrail?: (x: number, y: number) => void;

    constructor(owner: any, nodes: Vector2[], damage: number, width: number, isEvolved: boolean) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, 4, damage, 0, '');
        this.canCollide = false;
        this.owner = owner;
        this.nodes = nodes;
        this.halfWidth = width * 0.5;
        // A four-node zigzag that hits full damage at every stop would make the
        // evolution a straight multiplication of the base
        this.falloff = isEvolved ? 0.85 : 1;
        this.color = isEvolved ? '#ff6cf0' : '#bd6cff';

        for (let i = 1; i < nodes.length; i++) {
            this.pathLength += distance(nodes[i - 1], nodes[i]);
        }
        // One sweep per leg after the first, so a longer zigzag takes longer
        const sweeps = Math.max(1, nodes.length - 2);
        this.headSpeed = this.pathLength / (SWEEP_TIME * sweeps + SWEEP_TIME);
    }

    /** The beam always leaves the emitter, wherever the player has walked to */
    private get origin(): Vector2 {
        return this.owner.pos;
    }

    update(dt: number) {
        this.timer += dt;

        if (this.stage === 'charge') {
            if (this.timer >= this.chargeTime) {
                this.stage = 'sweep';
                this.timer = 0;
                juice.addTrauma(0.08);
                particles.emitBeamCharge(this.origin.x, this.origin.y);
            }
            return;
        }

        if (this.stage === 'sweep') {
            this.travelled = Math.min(this.pathLength, this.travelled + this.headSpeed * dt);
            this.resolveTo(this.travelled);
            this.dropTrail();
            if (this.travelled >= this.pathLength) {
                this.stage = 'fade';
                this.timer = 0;
            }
            return;
        }

        if (this.timer >= this.fadeTime) this.isDead = true;
    }

    /**
     * Cut everything between the last resolved point and where the head is now.
     *
     * Damage is applied per whole leg the instant the head clears it, not per
     * frame: a beam that re-checked its own line every frame would hit the same
     * enemy a dozen times and bury the screen in damage numbers.
     */
    private resolveTo(travelled: number) {
        let walked = 0;
        for (let i = 1; i < this.nodes.length; i++) {
            const legStart = i === 1 ? this.origin : this.nodes[i - 1];
            const leg = distance(legStart, this.nodes[i]);
            if (travelled < walked + leg) break;
            walked += leg;
            if (i <= this.resolved) continue;
            this.resolved = i;
            this.cutSegment(legStart, this.nodes[i], Math.pow(this.falloff, i - 1));
        }
    }

    private cutSegment(a: Vector2, b: Vector2, damageScale: number) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = dx / len;
        const ny = dy / len;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        let sparks = 0;
        for (const enemy of levelSpatialHash.getNearby(mid, len / 2 + this.halfWidth + 40)) {
            if (enemy.isDead || this.hit.has(enemy)) continue;
            const t = (enemy.pos.x - a.x) * nx + (enemy.pos.y - a.y) * ny;
            if (t < 0 || t > len) continue;
            const perp = Math.abs((enemy.pos.x - a.x) * -ny + (enemy.pos.y - a.y) * nx);
            if (perp > this.halfWidth + enemy.radius) continue;

            this.hit.add(enemy);
            damageSystem.dealDamage({
                baseDamage: this.damage * damageScale,
                source: this.source ?? this,
                target: enemy,
                position: enemy.pos,
            });
            // Particle budget: a sweep through forty bodies is one frame
            if (sparks < 4) {
                sparks++;
                particles.emitHit(enemy.pos.x, enemy.pos.y, this.color);
            }
        }
    }

    /** Lay fire along the path at a fixed spacing, not per frame */
    private dropTrail() {
        if (!this.onTrail || this.trailsDropped >= MAX_TRAILS) return;
        if (this.travelled - this.lastTrailAt < TRAIL_SPACING) return;
        this.lastTrailAt = this.travelled;
        this.trailsDropped++;
        const head = this.headPoint();
        this.onTrail(head.x, head.y);
    }

    /** Where the burning end of the beam is right now */
    private headPoint(): Vector2 {
        if (this.stage === 'charge') return this.nodes[1] ?? this.origin;

        let walked = 0;
        for (let i = 1; i < this.nodes.length; i++) {
            const legStart = i === 1 ? this.origin : this.nodes[i - 1];
            const leg = distance(legStart, this.nodes[i]);
            if (this.travelled <= walked + leg) {
                const t = leg > 0 ? (this.travelled - walked) / leg : 1;
                return {
                    x: legStart.x + (this.nodes[i].x - legStart.x) * t,
                    y: legStart.y + (this.nodes[i].y - legStart.y) * t,
                };
            }
            walked += leg;
        }
        return this.nodes[this.nodes.length - 1];
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const start = this.origin;
        const head = this.headPoint();

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        if (this.stage === 'charge') {
            // Aiming line: thin, dashed, growing brighter as the shot builds
            const t = this.timer / this.chargeTime;
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(head.x, head.y);
            ctx.strokeStyle = this.color;
            ctx.globalAlpha = t;
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(start.x, start.y, 6 + 8 * t, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
            return;
        }

        const alpha = this.stage === 'fade' ? Math.max(0, 1 - this.timer / this.fadeTime) : 1;
        const width = this.halfWidth * 2 * (0.6 + 0.4 * alpha);

        // The beam bends through every node it has already swept past, so you
        // can read the whole path the lance has carved
        ctx.globalAlpha = alpha;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        for (let i = 1; i <= this.resolved && i < this.nodes.length; i++) {
            ctx.lineTo(this.nodes[i].x, this.nodes[i].y);
        }
        ctx.lineTo(head.x, head.y);

        // One glow pass, then a hard core and a white filament
        ctx.strokeStyle = this.color;
        ctx.lineWidth = width;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = 'rgba(255, 225, 255, 0.85)';
        ctx.lineWidth = Math.max(2, width * 0.45);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, width * 0.16);
        ctx.stroke();

        // Emitter flare and the burning end being dragged along
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(start.x, start.y, width * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(head.x, head.y, width * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Locks on, then drags the beam through the crowd.";

    readonly stats = {
        damage: 40,
        cooldown: 2.0,
        area: 110,
        speed: 0,
        duration: 0.5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    /** Legs after the lock-on: one normally, three when evolved */
    private sweepCount(): number {
        return this.evolved ? 3 : 1;
    }

    /** Beam width, and the only thing a level changes besides damage */
    private beamWidth(): number {
        return (26 + this.level * 4) * this.owner.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        const first = this.findClosestEnemy(SWEEP_MAX_REACH);
        if (!first) return;

        const taken = new Set<any>([first]);
        const nodes: Vector2[] = [
            { ...this.owner.pos },
            { x: first.pos.x, y: first.pos.y },
        ];

        let from: Vector2 = nodes[1];
        for (let i = 0; i < this.sweepCount(); i++) {
            const next = this.pickSweepTarget(from, taken);
            if (!next) break;
            taken.add(next);
            from = { x: next.pos.x, y: next.pos.y };
            nodes.push(from);
        }

        // Nothing to sweep to: still fire the lock-on leg rather than eating
        // the cooldown for free
        const lance = new SweepingLance(this.owner, nodes, this.damage, this.beamWidth(), this.evolved);
        lance.source = this;
        lance.onTrail = (x, y) => this.layFire(x, y);
        this.onSpawn(lance);

        // Three legs of cutting and a trail of fire is worth a longer wait
        const cdMultiplier = this.evolved ? 1.35 : 1.0;
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
    }

    /**
     * The next enemy to drag the beam to — deliberately **not** the closest.
     *
     * Sweeping to whatever is nearest makes the beam twitch between two bodies
     * standing next to each other, which is both invisible and useless. Picking
     * at random from everything in an annulus around the current end gives a
     * long leg that crosses the enemies in between, which is where the damage
     * actually comes from.
     */
    private pickSweepTarget(from: Vector2, exclude: Set<any>): any | null {
        const candidates: any[] = [];
        let fallback: any = null;
        let fallbackDist = Infinity;

        for (const enemy of levelSpatialHash.getWithinRadius(from, SWEEP_MAX_REACH)) {
            if (enemy.isDead || exclude.has(enemy)) continue;
            const d = distance(from, enemy.pos);
            if (d > SWEEP_MAX_REACH) continue;
            if (d >= SWEEP_MIN_REACH) {
                candidates.push(enemy);
            } else if (d < fallbackDist) {
                fallbackDist = d;
                fallback = enemy;
            }
        }

        if (candidates.length === 0) return fallback;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    /** Burning floor left where the beam passed */
    private layFire(x: number, y: number) {
        const fire = new BurningTrailZone(
            x, y,
            this.area * 0.42 * this.owner.stats.area,
            1.4 * this.owner.stats.duration,
            this.damage * 0.1,
        );
        fire.burnDps = this.damage * 0.18;
        fire.source = this;
        this.onSpawn(fire);
    }
}

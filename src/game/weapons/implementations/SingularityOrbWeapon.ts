/**
 * SINGULARITY ORB WEAPON
 *
 * A slow orb that drags everything toward it as it drifts.
 *
 * Evolved — Black Hole. The old evolution collapsed into a fixed 100px zone
 * dealing 20% of the weapon's damage for three seconds: it neither scaled with
 * the weapon nor looked like the thing the name promises, and on a doubled
 * cooldown it was a downgrade you had to work for.
 *
 * The rework gives it the one idea a black hole actually has — an **event
 * horizon**. The outer field only pulls; anything dragged past the horizon is
 * being torn apart and takes heavy damage per second. That makes the weapon a
 * *trap* rather than another damage circle: it is strongest when it has had a
 * second to gather a crowd, and the pull tightens as the hole collapses, so the
 * crowd it gathered is exactly what the final implosion catches.
 */
import { ProjectileWeapon, SingularityProjectile, Zone } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../Entity';
import { distance, type Vector2 } from '../../core/Utils';
import { levelSpatialHash } from '../../core/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../core/ParticleSystem';
import { juice } from '../../core/JuiceSystem';

/** Fraction of the pull radius that counts as inside the horizon */
const HORIZON_RATIO = 0.42;
/** Seconds between dark-lightning discharges */
const ARC_INTERVAL = 0.3;

/** One baked lightning path, in world space */
interface DarkArc {
    points: Vector2[];
    alpha: number;
}

/**
 * Zig-zag between two points, computed once.
 *
 * Recomputing the jitter every frame is what made the old arcs "boil"; baking
 * the path at creation and only fading its alpha is both cheaper and reads as
 * a single discharge rather than static.
 */
function bakeArc(start: Vector2, end: Vector2): DarkArc {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    const segments = Math.max(3, Math.floor(dist / 26));
    const perpX = -dy / dist;
    const perpY = dx / dist;

    const points: Vector2[] = [{ ...start }];
    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const offset = (Math.random() - 0.5) * 22;
        points.push({
            x: start.x + dx * t + perpX * offset,
            y: start.y + dy * t + perpY * offset,
        });
    }
    points.push({ ...end });
    return { points, alpha: 1 };
}

function drawArcs(ctx: CanvasRenderingContext2D, camera: Vector2, arcs: DarkArc[]) {
    if (arcs.length === 0) return;

    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    ctx.lineCap = 'round';

    // One shadowBlur pass for every arc, not one per arc — see the VFX rules
    ctx.shadowColor = '#6a00cc';
    ctx.shadowBlur = 12;
    for (const arc of arcs) {
        ctx.globalAlpha = arc.alpha;
        ctx.strokeStyle = '#2b0050';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(arc.points[0].x, arc.points[0].y);
        for (let i = 1; i < arc.points.length; i++) ctx.lineTo(arc.points[i].x, arc.points[i].y);
        ctx.stroke();

        ctx.strokeStyle = '#c98cff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.restore();
}

// ============================================
// BLACK HOLE PROJECTILE - the orb on its way in
// ============================================

export class BlackHoleProjectile extends SingularityProjectile {
    private arcTimer: number = 0;
    private arcs: DarkArc[] = [];
    private spin: number = 0;
    onCollapse?: (x: number, y: number) => void;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce);
        this.radius = 32;
        this.pullStrength = 260;
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * 2.6;

        this.arcTimer += dt;
        if (this.arcTimer >= ARC_INTERVAL) {
            this.arcTimer = 0;
            this.discharge();
        }

        for (let i = this.arcs.length - 1; i >= 0; i--) {
            this.arcs[i].alpha -= dt * 3.2;
            if (this.arcs[i].alpha <= 0) this.arcs.splice(i, 1);
        }
    }

    /** Collapse fires from the projectile's own death hook, so it runs once */
    protected onDeath(): void {
        this.onCollapse?.(this.pos.x, this.pos.y);
    }

    private discharge() {
        const reach = 190;
        let struck = 0;
        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, reach)) {
            if (struck >= 2 || enemy.isDead) continue;
            if (distance(this.pos, enemy.pos) > reach) continue;
            struck++;
            this.arcs.push(bakeArc(this.pos, enemy.pos));
            damageSystem.dealDamage({
                baseDamage: this.damage * 0.3,
                source: this.source,
                target: enemy,
                position: enemy.pos,
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Lensing ring: light bent around the hole
        ctx.rotate(this.spin);
        ctx.strokeStyle = 'rgba(160, 90, 255, 0.45)';
        ctx.lineWidth = 3;
        ctx.setLineDash([14, 9]);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.rotate(-this.spin);

        // Accretion disc — an ellipse edge-on, so it reads as a disc not a ball
        ctx.rotate(this.spin * 0.6);
        ctx.strokeStyle = 'rgba(210, 130, 255, 0.75)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.35, this.radius * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.rotate(-this.spin * 0.6);

        // The hole itself: genuinely black in the middle
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        core.addColorStop(0, '#000000');
        core.addColorStop(0.62, '#000000');
        core.addColorStop(0.8, 'rgba(60, 0, 120, 0.85)');
        core.addColorStop(1, 'rgba(120, 40, 220, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = core;
        ctx.fill();

        ctx.restore();

        drawArcs(ctx, camera, this.arcs);
    }
}

// ============================================
// BLACK HOLE ZONE - the collapse
// ============================================

export class BlackHoleZone extends Zone {
    /** Pull at the start; it tightens as the hole collapses */
    pullStrength: number = 340;
    /** Damage per second to anything past the horizon */
    horizonDps: number = 0;
    /** Damage of the implosion when the hole finally closes */
    implosionDamage: number = 0;

    private readonly maxDuration: number;
    private spin: number = 0;
    private arcTimer: number = 0;
    private arcs: DarkArc[] = [];
    private imploded: boolean = false;
    /** Accretion spiral baked in unit space, scaled at draw time */
    private readonly spiral: Vector2[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.25, '', 0);
        this.maxDuration = duration;

        for (let a = 0; a <= Math.PI * 5; a += 0.2) {
            const r = 0.25 + 0.75 * (a / (Math.PI * 5));
            this.spiral.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
    }

    private get horizon(): number {
        return this.radius * HORIZON_RATIO;
    }

    /** 0 at birth → 1 as the hole closes; drives pull and visual tightening */
    private get collapse(): number {
        return 1 - Math.max(0, Math.min(1, this.duration / this.maxDuration));
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * (2 + 4 * this.collapse);

        const pullRadius = this.radius * 2;
        const pull = this.pullStrength * (1 + this.collapse * 1.4);

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, pullRadius)) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = distance(this.pos, enemy.pos);
            if (dist > pullRadius || dist < 1) continue;

            enemy.pos.x += (dx / dist) * (pull / dist) * dt;
            enemy.pos.y += (dy / dist) * (pull / dist) * dt;

            // Past the horizon it stops being a pull and starts being a grave.
            // Continuous, so a target held in the middle melts while one
            // skimming the edge only gets dragged.
            if (dist < this.horizon && this.horizonDps > 0) {
                damageSystem.dealDamage({
                    baseDamage: this.horizonDps * dt,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos,
                });
            }
        }

        this.arcTimer += dt;
        if (this.arcTimer >= ARC_INTERVAL) {
            this.arcTimer = 0;
            this.discharge(pullRadius);
        }
        for (let i = this.arcs.length - 1; i >= 0; i--) {
            this.arcs[i].alpha -= dt * 3;
            if (this.arcs[i].alpha <= 0) this.arcs.splice(i, 1);
        }

        if (this.duration <= 0 && !this.imploded) {
            this.imploded = true;
            this.implode();
        }
    }

    private discharge(reach: number) {
        let struck = 0;
        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, reach)) {
            if (struck >= 3 || enemy.isDead) continue;
            if (distance(this.pos, enemy.pos) > reach) continue;
            struck++;
            this.arcs.push(bakeArc(this.pos, enemy.pos));
        }
    }

    /** The hole closing is the payoff for everything it dragged in */
    private implode() {
        if (this.implosionDamage <= 0) return;

        particles.emitNuclear(this.pos.x, this.pos.y, this.radius);
        juice.addTrauma(0.45);
        juice.zoomPunch(-0.5);
        juice.shockwave(this.pos.x, this.pos.y, this.radius * 2.6, '#b26cff', 0.55, 8);

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.radius * 1.6)) {
            if (distance(this.pos, enemy.pos) > this.radius * 1.6) continue;
            damageSystem.dealDamage({
                baseDamage: this.implosionDamage,
                source: this.source,
                target: enemy,
                position: enemy.pos,
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const fade = Math.min(1, this.duration * 3);
        if (fade <= 0) return;

        const collapse = this.collapse;
        const scale = this.radius * (1 - collapse * 0.25);

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Pull field: a dashed boundary that spins faster as the hole tightens
        ctx.rotate(this.spin * 0.4);
        ctx.globalAlpha = fade * 0.35;
        ctx.strokeStyle = '#7a3cff';
        ctx.lineWidth = 2;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.rotate(-this.spin * 0.4);

        // Accretion spiral, baked once
        ctx.rotate(this.spin);
        ctx.globalAlpha = fade * 0.85;
        ctx.strokeStyle = '#d08cff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < this.spiral.length; i++) {
            const px = this.spiral[i].x * scale * 1.7;
            const py = this.spiral[i].y * scale * 1.7;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.rotate(-this.spin);

        // Event horizon: the line the player has to read, so it is the brightest
        // thing here and it pulses
        ctx.globalAlpha = fade;
        ctx.beginPath();
        ctx.arc(0, 0, this.horizon, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 210, 255, ${0.55 + 0.35 * Math.sin(this.spin * 3)})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore();

        drawArcs(ctx, camera, this.arcs);
    }
}

export class SingularityOrbWeapon extends ProjectileWeapon {
    name = "Singularity Orb";
    emoji = "⚫";
    description = "Slow moving orb of destruction.";
    projectileEmoji = "";
    pierce = 999;

    readonly stats = {
        damage: 50,
        cooldown: 4,
        area: 600,
        speed: 50,
        duration: 2.5,
        pierce: 999,
    };

    private activeBlackHole: Zone | null = null;
    private waitingForCollapse: boolean = false;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        // Search range = projectile flight distance
        this.area = this.stats.speed * this.stats.duration;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        const isEvolved = this.evolved;

        if (isEvolved && this.waitingForCollapse) {
            if (this.activeBlackHole && this.activeBlackHole.isDead) {
                this.waitingForCollapse = false;
                this.activeBlackHole = null;
            }
            return;
        }

        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

            if (target) {
                this.fire(target);
                // Evolved fires half as often but the hole is on the field for
                // most of that gap, so uptime is comparable
                const cdMultiplier = isEvolved ? 1.6 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: Entity) {
        const velocity = this.calculateVelocityToTarget(target);

        if (this.evolved) {
            const proj = new BlackHoleProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                this.damage,
                this.pierce
            );
            proj.source = this;
            proj.onCollapse = (x, y) => this.collapse(x, y);

            this.waitingForCollapse = true;
            this.onSpawn(proj);
        } else {
            const proj = new SingularityProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                this.damage,
                this.pierce
            );
            proj.pullStrength = 200;
            proj.source = this;
            this.onSpawn(proj);
        }
    }

    /** Everything about the hole scales with the weapon, unlike the old fixed 100px/3s */
    private collapse(x: number, y: number) {
        const radius = (110 + this.level * 12) * this.owner.stats.area;
        const duration = 3.2 * this.owner.stats.duration;

        const zone = new BlackHoleZone(x, y, radius, duration, this.damage * 0.18);
        zone.horizonDps = this.damage * 1.6;
        zone.implosionDamage = this.damage * 2.4;
        zone.source = this;

        particles.emitSingularityDistortion(x, y, radius);
        juice.shockwave(x, y, radius * 1.4, '#8a3cff', 0.4, 5);

        this.activeBlackHole = zone;
        this.onSpawn(zone);
    }
}

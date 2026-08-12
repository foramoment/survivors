/**
 * SINGULARITY ORB WEAPON
 *
 * An orb that gathers a crowd onto itself as it travels.
 *
 * Evolved — Black Hole. The old evolution collapsed into a fixed 100px zone
 * dealing 20% of the weapon's damage for three seconds: it neither scaled with
 * the weapon nor looked like the thing the name promises, and on a doubled
 * cooldown it was a downgrade you had to work for.
 *
 * The rework gave it the one idea a black hole actually has — an **event
 * horizon** — and this pass finally makes that horizon do both of its jobs.
 *
 * It was a wall from the outside only: the field's "pull" was a force divided
 * by distance, which came out at around one pixel per second against a crowd
 * walking at a hundred. So the hole never gathered anything; it damaged
 * whatever happened to walk over it, and the Warden's whole class fantasy —
 * *make* the crowd, then delete it — was a line of documentation. Capture is
 * now quoted in px/s and is one-way for the life of the field: brush the rim
 * and you are cargo.
 *
 * The other job is the point of the weapon. Nothing crosses the horizon in
 * *either* direction, so the crowd packs onto the shell and the middle is
 * empty — a pocket the player can stand in while the pile they gathered burns
 * down around them. That safety is geometry, not a rule: no immunity flag, no
 * argument with core/ContactDamage, and it costs the run's most dangerous
 * commitment — walking into the middle of your own crowd to get there.
 */
import { ProjectileWeapon, SingularityProjectile, Zone, holdOnShell } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../../engine/Entity';
import { distance, normalize, type Vector2 } from '../../../engine/Utils';
import { levelSpatialHash } from '../../../engine/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../../engine/ParticleSystem';
import { juice } from '../../../engine/JuiceSystem';

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
        this.captureSpeed = 260;
        // The evolved orb's payoff is the collapse it leaves behind, so its
        // travelling field only grinds lightly on the way in
        this.pullRadiusScale = 3.2;
        this.fieldDamageShare = 0.1;
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

    /**
     * A dashed lensing ring and a stroked accretion ellipse are gone.
     *
     * The plain orb reads better than this one did for exactly one reason: it
     * has no drawn boundary. All it is is a black centre inside a haze that
     * fades out, and the pull is told by the enemies actually moving. Hard
     * rings on top of that are clutter — and this weapon already fills the
     * screen with damage numbers, so it can afford clutter least of all.
     *
     * What is left is the part that works: real black in the middle, a wider
     * violet haze (inherited from SingularityProjectile), and a slow swirl of
     * infalling motes drawn as points rather than lines.
     */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        super.draw(ctx, camera);

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Matter caught in the disc: dots on a tilted orbit, not a stroked
        // ellipse. Same silhouette, no edge.
        ctx.rotate(this.spin * 0.6);
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + this.spin * 1.6;
            const px = Math.cos(a) * this.radius * 1.35;
            const py = Math.sin(a) * this.radius * 0.42;
            // Fade the ones on the far side, so the disc reads as tilted
            ctx.globalAlpha = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(a));
            ctx.fillStyle = '#d28aff';
            const s = 2.4;
            ctx.fillRect(px - s / 2, py - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
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
    /**
     * How much gravity bends a **boss's** speed inside the field, at its
     * centre. Falls off to nothing at the rim, and flips sign for one walking
     * away — so the worst case is a boss at 40% speed and the best is one
     * arriving 40% early.
     *
     * Everything else is captured outright and does not walk at all, so this is
     * now the boss's version of being caught: the hole leans on it instead of
     * parking it.
     */
    static readonly GRAVITY_ASSIST = 0.4;
    /** How fast the caught are reeled onto the horizon, px/s */
    captureSpeed: number = 300;
    /** Damage per second to anything held on the horizon */
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
    /**
     * Everything the field has touched since it opened. One-way for the life of
     * the hole: brushing the rim is enough, and nothing that has been caught
     * gets to walk back out. This is the difference between a weapon that
     * *clears* a spot and one that merely stands in it — see
     * `holdOnShell` for the other half, which is what makes the middle safe.
     */
    private readonly captured: Set<any> = new Set();

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

    /** The field also gathers loose crystals — see CrystalField */
    get crystalPull(): number {
        return this.radius * 2;
    }

    /** 0 at birth → 1 as the hole closes; drives pull and visual tightening */
    private get collapse(): number {
        return 1 - Math.max(0, Math.min(1, this.duration / this.maxDuration));
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * (2 + 4 * this.collapse);

        const pullRadius = this.radius * 2;
        const horizon = this.horizon;
        // The pull tightens as the hole closes, so the crowd it gathered is
        // packed onto the horizon by the time the implosion catches it
        const reelSpeed = this.captureSpeed * (1 + this.collapse * 0.6);

        const playerPos = (this.source as any)?.owner?.pos as Vector2 | undefined;

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, pullRadius)) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = distance(this.pos, enemy.pos);
            if (dist > pullRadius) continue;

            if (!enemy.isBoss) {
                // Touching the field at all is enough, once
                this.captured.add(enemy);
            } else if (playerPos && dist > 1) {
                // A boss is too big to park, so gravity bends how fast it
                // travels rather than where it is: one whose path toward the
                // player runs *with* the hole gets slingshotted along, one
                // climbing away from it drags. That is the trade for dropping
                // a hole between yourself and the thing chasing you.
                const heading = normalize({ x: playerPos.x - enemy.pos.x, y: playerPos.y - enemy.pos.y });
                const alignment = heading.x * (dx / dist) + heading.y * (dy / dist);
                const falloff = 1 - dist / pullRadius;
                enemy.speedMultiplier *= 1 + alignment * BlackHoleZone.GRAVITY_ASSIST * falloff;
            }

            // A grave, continuously, for whatever is packed onto the horizon —
            // a body skimming the rim only gets dragged, and pays the field's
            // ordinary tick for the trip
            if (this.horizonDps > 0 && dist <= horizon * 1.15) {
                damageSystem.dealDamage({
                    baseDamage: this.horizonDps * dt,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos,
                });
            }
        }

        // Reel the caught onto the horizon and hold them there, wherever they
        // have been pushed to since. Walked over the capture set rather than a
        // radius query so a body thrown out by a knockback is still cargo.
        for (const enemy of this.captured) {
            if (enemy.isDead) {
                this.captured.delete(enemy);
                continue;
            }
            // Not a stun — no recovery, no immunity, no diminishing returns
            // (see core/StatusEffects for why those exist). It is the hole
            // holding what fell in until it closes.
            enemy.speedMultiplier = 0;
            holdOnShell(enemy, this.pos, horizon, reelSpeed, dt);
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

    /**
     * Discharges thrown outward from the core in random directions.
     *
     * They used to be drawn from the hole to nearby enemies, which promised a
     * connection that does not exist — the zone's arcs deal no damage, the
     * horizon does. Lines reaching for specific bodies read as "this is hitting
     * that one", and it isn't. Radial crackle says "something violent is
     * happening in there", which is true.
     */
    private discharge(reach: number) {
        for (let i = 0; i < 3; i++) {
            const angle = Math.random() * Math.PI * 2;
            const len = this.horizon + Math.random() * (reach - this.horizon) * 0.7;
            this.arcs.push(bakeArc(this.pos, {
                x: this.pos.x + Math.cos(angle) * len,
                y: this.pos.y + Math.sin(angle) * len,
            }));
        }
    }

    /**
     * The hole closing is the payoff for everything it dragged in.
     *
     * Deliberately NOT an explosion. This used to call `emitNuclear` — ~390
     * particles thrown outward, borrowed from Orbital Strike — which is the
     * wrong gesture entirely: a black hole collapses *inward*, and a fireball
     * at the end of it read as a different weapon going off. Two rings snapping
     * shut say "it closed" for the price of two strokes.
     */
    private implode() {
        if (this.implosionDamage <= 0) return;

        juice.addTrauma(0.25);
        juice.zoomPunch(-0.35);
        // Collapsing rings: the outer one arrives late, so they read as
        // something falling in rather than blowing out
        juice.shockwave(this.pos.x, this.pos.y, this.horizon * 0.4, '#e0b3ff', 0.35, 5);
        juice.shockwave(this.pos.x, this.pos.y, this.horizon, '#7a3cff', 0.5, 3);
        particles.emitHit(this.pos.x, this.pos.y, '#c98cff');

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

        // Pull field: a haze reaching exactly as far as the gravity does. It
        // was a dashed spinning ring, which is the single most UI-looking
        // shape in the game, sitting on the weapon that already throws the
        // most damage numbers on screen.
        ctx.globalAlpha = fade;
        const halo = ctx.createRadialGradient(0, 0, this.horizon * 0.9, 0, 0, this.radius * 2);
        halo.addColorStop(0, 'rgba(122, 60, 255, 0.32)');
        halo.addColorStop(0.5, 'rgba(100, 40, 220, 0.16)');
        halo.addColorStop(1, 'rgba(80, 20, 180, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        // The accretion spiral, drawn as matter falling in rather than as a
        // stroked line. Same baked path, sampled into points.
        ctx.rotate(this.spin);
        ctx.fillStyle = '#d08cff';
        for (let i = 0; i < this.spiral.length; i += 2) {
            const px = this.spiral[i].x * scale * 1.7;
            const py = this.spiral[i].y * scale * 1.7;
            // Brighter and tighter the closer it is to falling in
            const t = i / this.spiral.length;
            ctx.globalAlpha = fade * (0.25 + 0.6 * (1 - t));
            const s = 1.6 + 2.2 * (1 - t);
            ctx.fillRect(px - s / 2, py - s / 2, s, s);
        }
        ctx.rotate(-this.spin);

        // Event horizon. Still the thing the player has to read, but the edge
        // is a hard falloff in the fill, not a stroked circle on top of it.
        ctx.globalAlpha = fade;
        const pulse = 0.55 + 0.35 * Math.sin(this.spin * 3);
        const eh = ctx.createRadialGradient(0, 0, 0, 0, 0, this.horizon * 1.25);
        eh.addColorStop(0, '#000000');
        eh.addColorStop(0.72, '#000000');
        eh.addColorStop(0.8, `rgba(255, 210, 255, ${pulse})`);
        eh.addColorStop(1, 'rgba(200, 140, 255, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.horizon * 1.25, 0, Math.PI * 2);
        ctx.fillStyle = eh;
        ctx.fill();

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

    /**
     * `speed` is doing two jobs, and at 50 it failed both.
     *
     * Flight distance is `speed * duration` (125px), and that same number is
     * the weapon's search range — so the orb refused to fire until something
     * was already within about one body-length of the player, then crawled out
     * at half the speed of the crowd it was supposed to be gathering. On the
     * class whose starting weapon this is, that reads as "the orb makes me
     * stand next to enemies", which is exactly the opposite of what it is for.
     * At 130 it outruns everything on the arena and opens the pile roughly
     * 325px out — far enough that the gather happens away from you, near
     * enough that you can choose to walk into it.
     */
    readonly stats = {
        damage: 50,
        cooldown: 4,
        area: 600,
        speed: 130,
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
            // Two regions, matching the two things it draws: a heavy core that
            // tears through whatever it passes over, and a wide field that
            // takes hold of the pack and reels it onto that core. The
            // unevolved orb is a plough — it drags what it caught away with it
            // — and the evolution is what turns the same idea into a place you
            // can stand.
            proj.radius = (16 + this.level * 2) * this.owner.stats.area;
            proj.captureSpeed = 220;
            proj.pullRadiusScale = 5;
            proj.fieldDamageShare = 0.18;
            proj.source = this;
            this.onSpawn(proj);
        }
    }

    /** Everything about the hole scales with the weapon, unlike the old fixed 100px/3s */
    private collapse(x: number, y: number) {
        const radius = (110 + this.level * 12) * this.owner.stats.area;
        const duration = 3.2 * this.owner.stats.duration;

        const zone = new BlackHoleZone(x, y, radius, duration, this.damage * 0.18);
        // Both trimmed now that the horizon actually HOLDS what it catches:
        // a body that crosses it takes every tick of the field's remaining
        // life, where before it was dragged through and wandered back out. The
        // implosion is the punctuation, not a second detonation on top.
        zone.horizonDps = this.damage * 1.1;
        zone.implosionDamage = this.damage * 1.4;
        zone.source = this;

        particles.emitSingularityDistortion(x, y, radius);
        juice.shockwave(x, y, radius * 1.4, '#8a3cff', 0.4, 5);

        this.activeBlackHole = zone;
        this.onSpawn(zone);
    }
}

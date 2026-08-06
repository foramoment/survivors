/**
 * ORBITAL STRIKE WEAPON
 *
 * A gun platform in orbit paints a target on the ground, then drops a kinetic
 * round on it. Three readable beats: paint → fall → impact.
 *
 * Evolved (Orbital Barrage): instead of one enormous nuke in a single spot,
 * the platform walks a salvo of shells across the field on a long cooldown —
 * more coverage, far less frame cost, and it can't delete a screen of enemies
 * with a single button-less press.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import type { Vector2 } from '../../../engine/Utils';
import { DelayedExplosionZone } from '../base';
import { particles } from '../../../engine/ParticleSystem';
import { juice } from '../../../engine/JuiceSystem';

// ============================================
// ORBITAL STRIKE ZONE - targeting + impact visuals
// ============================================

export class OrbitalStrikeZone extends DelayedExplosionZone {
    /** Heavier finishing shell of a barrage */
    heavy: boolean;
    private spin: number = 0;
    private postTimer: number = 0;
    /** Height the round falls from */
    private static readonly SKY = 900;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, heavy: boolean = false) {
        super(x, y, radius, delay, damage, '', false);
        this.heavy = heavy;
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt;
        if (this.exploded) this.postTimer += dt;
    }

    protected emitImpact() {
        particles.emitOrbitalImpact(this.pos.x, this.pos.y, this.radius);
        juice.addTrauma(this.heavy ? 0.34 : 0.18);
        juice.shockwave(this.pos.x, this.pos.y, this.radius * 1.9,
            this.heavy ? '#ffcc55' : '#ff9944', 0.35, this.heavy ? 7 : 4);
        if (this.heavy) juice.hitStop(0.04);
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        this.exploded ? this.drawImpact(ctx) : this.drawTargeting(ctx);
        ctx.restore();
    }

    /** Phase 1: the reticle closes in on the impact point */
    private drawTargeting(ctx: CanvasRenderingContext2D) {
        const progress = Math.max(0, Math.min(1, 1 - this.delay / this.initialDelay));
        const color = this.heavy ? '#ffcc55' : '#ff5a3c';

        // Incoming round: a thin streak that falls from the sky and lands
        // exactly when the reticle closes
        const fallEase = progress * progress;
        const headY = -OrbitalStrikeZone.SKY * (1 - fallEase);
        ctx.globalAlpha = 0.25 + 0.55 * progress;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, headY - 90 * (1 - fallEase) - 20);
        ctx.lineTo(0, headY);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(-2, headY - 3, 4, 6);

        // Closing ring
        const ringRadius = this.radius * (1.85 - 0.85 * progress);
        ctx.globalAlpha = 0.5 + 0.4 * progress;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -this.spin * 30;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pixel corner brackets converging on the point
        const bracket = this.radius * (1.5 - 0.5 * progress);
        const len = Math.max(6, this.radius * 0.3);
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < 4; i++) {
            const sx = i % 2 === 0 ? -1 : 1;
            const sy = i < 2 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(sx * bracket, sy * bracket - sy * len);
            ctx.lineTo(sx * bracket, sy * bracket);
            ctx.lineTo(sx * bracket - sx * len, sy * bracket);
            ctx.stroke();
        }

        // Blink faster the closer it gets
        const blink = Math.sin(progress * progress * 90) > 0;
        if (blink) {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = color;
            ctx.fillRect(-3, -3, 6, 6);
        }

        // Ground shadow of the incoming round
        ctx.globalAlpha = 0.18 + 0.2 * progress;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 0.35 * (0.4 + progress), this.radius * 0.18 * (0.4 + progress), 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /** Phase 2: column of light, flash and expanding rings */
    private drawImpact(ctx: CanvasRenderingContext2D) {
        const t = this.postTimer;
        const fade = Math.max(0, 1 - t / 0.5);
        if (fade <= 0) return;

        // Column of light punching down through the impact point. Three
        // nested widths fake a soft edge without a second gradient.
        const columnLife = Math.max(0, 1 - t / 0.2);
        if (columnLife > 0) {
            for (let i = 0; i < 3; i++) {
                const width = this.radius * (0.62 - i * 0.18) * columnLife;
                if (width <= 0) continue;
                const alpha = (0.16 + i * 0.16) * columnLife;
                const grad = ctx.createLinearGradient(0, -OrbitalStrikeZone.SKY, 0, 0);
                grad.addColorStop(0, 'rgba(255, 220, 150, 0)');
                grad.addColorStop(1, `rgba(255, 248, 214, ${alpha.toFixed(3)})`);
                ctx.fillStyle = grad;
                ctx.fillRect(-width / 2, -OrbitalStrikeZone.SKY, width, OrbitalStrikeZone.SKY);
            }
        }

        // Core flash
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * (1 + t * 1.5));
        core.addColorStop(0, `rgba(255, 255, 230, ${0.9 * fade})`);
        core.addColorStop(0.35, `rgba(255, 180, 60, ${0.6 * fade})`);
        core.addColorStop(1, 'rgba(255, 90, 20, 0)');
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * (1 + t * 1.5), 0, Math.PI * 2);
        ctx.fill();

        // Two expanding rings
        ctx.lineCap = 'butt';
        for (let i = 0; i < 2; i++) {
            const rt = t - i * 0.07;
            if (rt <= 0) continue;
            // Rings stay near the crater — a ring sprinting off-screen just
            // reads as a stray line
            const r = this.radius * (0.5 + rt * 2.4);
            ctx.globalAlpha = Math.max(0, fade * (1 - i * 0.35));
            ctx.strokeStyle = i === 0 ? '#fff2c0' : '#ff8a3c';
            ctx.lineWidth = Math.max(1, 7 * fade);
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Scorch mark left in the crater
        ctx.globalAlpha = 0.35 * fade;
        ctx.fillStyle = '#1a0d05';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
        ctx.fill();
    }
}

export class OrbitalStrikeWeapon extends Weapon {
    name = "Orbital Strike";
    emoji = "🛰️";
    description = "Marks a spot, then drops a kinetic round on it.";

    readonly stats = {
        // Fewer, heavier shells. At 2s this was a self-aiming area strike that
        // never had to be positioned; at 4s it was too slow to carry the Exo
        // Marine, whose signature weapon it is. Three seconds and a bigger
        // round keeps roughly the old damage per second while making each
        // strike an event you watch land.
        damage: 48,
        cooldown: 3.0,
        // 100 plus 10% a level plus area powerups put the crater at most of the
        // screen, which stops being a strike and starts being weather — you
        // could not see which enemies it was about to catch
        area: 74,
        speed: 0,
        duration: 1.0,
    };

    /** How far from the player a strike may be placed */
    private static readonly SPREAD = 420;
    /** How far apart shells in a salvo land. Tight enough to overlap. */
    private static readonly BARRAGE_SPACING = 1.3;

    /**
     * Seconds between shells being *launched*, and the fuse each one then burns.
     *
     * The salvo used to spawn every shell on the same frame with staggered
     * fuses, which meant every reticle in it was on the ground at once. Six
     * shells read as visual spam for exactly that reason — seven rings buried
     * the arena and the heavy finisher that is supposed to be the payoff got
     * lost among them — and the count was frozen at four to contain it.
     *
     * Launching them on a stagger fixes the cause instead of the symptom: with
     * a 0.8s fuse arriving every 0.22s there are only ever three or four rings
     * up, no matter how long the salvo is. That is what lets shell count grow
     * with level at all.
     */
    private static readonly SHELL_STAGGER = 0.22;
    private static readonly SHELL_FUSE = 0.8;

    /** Shells launched but not yet in the sky */
    private queue: { pos: Vector2, radius: number, damage: number, heavy: boolean, at: number }[] = [];

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            this.fireBarrage();
            this.cooldown = (this.evolved ? 8.0 : this.baseCooldown) * this.owner.stats.cooldown;
        }

        // Drained AFTER the salvo is queued, so the first shell of a fresh one
        // goes out on this frame rather than the next.
        for (let i = this.queue.length - 1; i >= 0; i--) {
            const shell = this.queue[i];
            shell.at -= dt;
            if (shell.at > 0) continue;
            this.queue.splice(i, 1);
            this.fireShell(shell.pos, shell.radius, shell.damage, OrbitalStrikeWeapon.SHELL_FUSE, shell.heavy);
        }
    }

    /**
     * Shells in a salvo: one more every second level, three more on evolving.
     * L1 1, L3 2, L5 3, L6 evolved 6.
     *
     * Levelling used to buy +7% blast radius, which is structural on paper and
     * invisible in play — you cannot see seven percent, and the weapon sat next
     * to a Chrono Disc handing out a whole extra disc per pick. Artillery has an
     * obvious axis and it was the one standing still.
     *
     * The evolved bonus is additive so the salvo keeps growing after evolving
     * rather than being replaced by a frozen four, which is the same trap that
     * had the evolved Plasma Cannon handing back fewer shards than level five.
     */
    private shellCount(): number {
        const base = 1 + Math.floor((this.level - 1) / 2);
        return this.evolved ? base + 3 : base;
    }

    private blastRadius(): number {
        return this.area * this.owner.stats.area;
    }

    /**
     * Prefer to land on an actual enemy — a strike that hits nothing looks
     * broken. Falls back to a random spot near the player when the field is
     * empty.
     */
    private pickTarget(): Vector2 {
        const candidates = this.findRandomEnemies(1, OrbitalStrikeWeapon.SPREAD);
        if (candidates.length > 0) {
            const target = candidates[0];
            // Lead the target slightly so it isn't a guaranteed hit
            return {
                x: target.pos.x + (Math.random() - 0.5) * 40,
                y: target.pos.y + (Math.random() - 0.5) * 40,
            };
        }
        const angle = Math.random() * Math.PI * 2;
        const dist = 120 + Math.random() * (OrbitalStrikeWeapon.SPREAD - 120);
        return {
            x: this.owner.pos.x + Math.cos(angle) * dist,
            y: this.owner.pos.y + Math.sin(angle) * dist,
        };
    }

    /**
     * Walk a salvo **across the crowd**, finishing with one heavy shell.
     *
     * The salvo used to be laid along a 420px line centred on the player, with
     * 90px of jitter on top — which meant the shells landed a screen apart, in
     * whatever direction the die rolled, mostly on empty floor. Four separate
     * craters in four unrelated places do not read as a barrage; they read as
     * the weapon firing once and something else going off in the distance.
     *
     * Now the line is centred on the thickest part of the crowd and its shells
     * are spaced by their own blast radius, so they overlap into one advancing
     * wall of fire that visibly crosses the pack.
     */
    private fireBarrage() {
        const shells = this.shellCount();
        const radius = this.blastRadius() * (shells > 1 ? 0.9 : 1);
        const stagger = OrbitalStrikeWeapon.SHELL_STAGGER;

        // A single shell has no line to walk, so it just goes where the target is
        if (shells === 1) {
            this.queue.push({ pos: this.pickTarget(), radius, damage: this.damage, heavy: false, at: 0 });
            return;
        }

        const centre = this.findDensestSpot(OrbitalStrikeWeapon.SPREAD, radius * 2) ?? this.pickTarget();
        const sweep = Math.random() * Math.PI * 2;
        const spacing = radius * OrbitalStrikeWeapon.BARRAGE_SPACING;

        for (let i = 0; i < shells; i++) {
            const offset = (i - (shells - 1) / 2) * spacing;
            const jitter = radius * 0.25;
            this.queue.push({
                pos: {
                    x: centre.x + Math.cos(sweep) * offset + (Math.random() - 0.5) * jitter,
                    y: centre.y + Math.sin(sweep) * offset + (Math.random() - 0.5) * jitter,
                },
                radius,
                damage: this.damage,
                heavy: false,
                at: i * stagger,
            });
        }

        // Finisher lands last and alone, on the middle of the run — with the
        // sky clear of the other reticles it is the shot you watch
        if (this.evolved) {
            this.queue.push({
                pos: centre,
                radius: radius * 2.1,
                damage: this.damage * 3.2,
                heavy: true,
                at: shells * stagger + 0.35,
            });
        }
    }

    private fireShell(pos: Vector2, radius: number, damage: number, delay: number, heavy: boolean) {
        const zone = new OrbitalStrikeZone(pos.x, pos.y, radius, delay, damage, heavy);
        zone.source = this;
        this.onSpawn(zone);
    }
}

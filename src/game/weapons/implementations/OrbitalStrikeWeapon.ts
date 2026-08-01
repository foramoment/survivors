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
import type { Vector2 } from '../../core/Utils';
import { DelayedExplosionZone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { juice } from '../../core/JuiceSystem';

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
        damage: 40,
        cooldown: 2.0,
        area: 100,
        speed: 0,
        duration: 1.0,
    };

    /** How far from the player a strike may be placed */
    private static readonly SPREAD = 420;
    /**
     * Shells per evolved salvo, before the finisher.
     *
     * Six read as visual spam — seven reticles on screen at once buried the
     * arena under targeting rings and damage numbers, and the heavy shell that
     * is supposed to be the payoff got lost among them. Three plus the finisher
     * is the same idea with room to see it happen, so the heavy shell lands
     * harder to keep the salvo's total worth the seven-second cooldown.
     */
    private static readonly BARRAGE_SHELLS = 3;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        if (this.evolved) {
            this.fireBarrage();
            this.cooldown = 7.0 * this.owner.stats.cooldown;
        } else {
            this.fireShell(this.pickTarget(), this.blastRadius(), this.damage, 0.9, false);
            this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
        }
    }

    private blastRadius(): number {
        return this.area * this.owner.stats.area * (1 + this.level * 0.1);
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

    /** Walk a salvo across the field, finishing with one heavy shell */
    private fireBarrage() {
        const shells = OrbitalStrikeWeapon.BARRAGE_SHELLS;
        const radius = this.blastRadius() * 0.9;
        // Shells sweep along a line through the player, so the salvo reads as
        // a strafing run rather than random scatter
        const sweep = Math.random() * Math.PI * 2;
        const spacing = OrbitalStrikeWeapon.SPREAD / (shells - 1);

        for (let i = 0; i < shells; i++) {
            const offset = (i - (shells - 1) / 2) * spacing;
            const jitterX = (Math.random() - 0.5) * 90;
            const jitterY = (Math.random() - 0.5) * 90;
            const pos = {
                x: this.owner.pos.x + Math.cos(sweep) * offset + jitterX,
                y: this.owner.pos.y + Math.sin(sweep) * offset + jitterY,
            };
            // Staggered fuses make the salvo land as a rolling barrage
            this.fireShell(pos, radius, this.damage, 0.75 + i * 0.22, false);
        }

        // Finisher lands last and alone, on the thickest part of the crowd —
        // with the sky clear of the other reticles it is the shot you watch
        const heavySpot = this.findDensestSpot(OrbitalStrikeWeapon.SPREAD, radius * 2) ?? this.pickTarget();
        this.fireShell(heavySpot, radius * 2.1, this.damage * 3.2, 0.75 + shells * 0.22 + 0.25, true);
    }

    private fireShell(pos: Vector2, radius: number, damage: number, delay: number, heavy: boolean) {
        const zone = new OrbitalStrikeZone(pos.x, pos.y, radius, delay, damage, heavy);
        zone.source = this;
        this.onSpawn(zone);
    }
}

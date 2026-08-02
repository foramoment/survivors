/**
 * LIGHTNING CHAIN WEAPON — "Storm Caller"
 *
 * A bolt falls out of the sky onto the nearest enemy and then walks from
 * target to target, one hop at a time (see ChainLightning). Short reach on
 * purpose: this is a crowd-clearing weapon for enemies that got close, not a
 * map-wide nuke.
 *
 * Evolved (Thunderstorm): the chain travels noticeably slower and every impact
 * point drops a static field — a small lingering AoE that keeps zapping. The
 * evolution is about *coverage over time*, not about hitting the whole screen
 * at once, which is what made the old version both ugly and a frame-rate
 * hazard.
 */
import { Weapon } from '../../Weapon';
import { ChainLightning, Zone } from '../base';
import type { Player } from '../../entities/Player';
import { type Vector2 } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { juice } from '../../core/JuiceSystem';

// ============================================
// STATIC FIELD - lingering AoE left by Thunderstorm
// ============================================

export class StaticFieldZone extends Zone {
    private arcs: Vector2[][] = [];
    private arcTimer: number = 0;
    private spin: number = Math.random() * Math.PI * 2;
    private maxDuration: number;

    constructor(x: number, y: number, radius: number, damage: number, duration: number = 1.6) {
        super(x, y, radius, duration, damage, 0.35, '');
        this.maxDuration = duration;
        this.growOver(0.5, 1);
        this.rebuildArcs();
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * 1.6;

        // Re-bake the crackle a few times a second instead of every frame
        this.arcTimer += dt;
        if (this.arcTimer > 0.07) {
            this.arcTimer = 0;
            this.rebuildArcs();
        }
    }

    private rebuildArcs() {
        this.arcs = [];
        for (let i = 0; i < 3; i++) {
            const a0 = Math.random() * Math.PI * 2;
            const a1 = a0 + (Math.random() - 0.5) * 2.4;
            const start = { x: Math.cos(a0) * this.radius * 0.85, y: Math.sin(a0) * this.radius * 0.85 };
            const end = { x: Math.cos(a1) * this.radius * 0.85, y: Math.sin(a1) * this.radius * 0.85 };
            const mid = {
                x: (start.x + end.x) / 2 + (Math.random() - 0.5) * this.radius * 0.7,
                y: (start.y + end.y) / 2 + (Math.random() - 0.5) * this.radius * 0.7,
            };
            this.arcs.push([start, mid, end]);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const fade = Math.max(0, Math.min(1, this.duration / this.maxDuration));
        if (fade <= 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Charged ground patch
        ctx.globalAlpha = 0.18 * fade;
        ctx.fillStyle = '#4488ff';
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Rotating containment ring
        ctx.globalAlpha = 0.75 * fade;
        ctx.strokeStyle = '#8fd8ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -this.spin * 18;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Crackling arcs inside the field
        ctx.globalAlpha = fade;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        for (const arc of this.arcs) {
            ctx.beginPath();
            ctx.moveTo(arc[0].x, arc[0].y);
            ctx.lineTo(arc[1].x, arc[1].y);
            ctx.lineTo(arc[2].x, arc[2].y);
            ctx.stroke();
        }

        ctx.restore();
    }
}

export class LightningChainWeapon extends Weapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Calls a bolt down that arcs between nearby enemies.";

    readonly stats = {
        damage: 25,
        cooldown: 1.6,
        // Strike range. Was 800 — the bolt used to reach clear across the
        // screen, which is where the "targeting laser" look came from.
        area: 260,
        speed: 0,
        duration: 0.3,
        pierce: 3,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        const target = this.findClosestEnemy();
        if (!target) return;

        this.fire(target);
        // Evolved strikes cover far more ground, so they come a little slower
        const cdMultiplier = this.evolved ? 1.2 : 1.0;
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
    }

    fire(target: any) {
        const isEvolved = this.evolved;
        const areaScale = this.owner.stats.area;

        // First target is hit by the sky bolt itself
        damageSystem.dealDamage({
            baseDamage: this.damage,
            source: this,
            target,
            position: target.pos,
        });
        particles.emitLightning(target.pos.x, target.pos.y);
        juice.shockwave(target.pos.x, target.pos.y, 46 * areaScale, '#bfe9ff', 0.25, 3);
        juice.addTrauma(isEvolved ? 0.14 : 0.07);

        const chain = new ChainLightning(
            target.pos.x,
            target.pos.y,
            this.damage,
            // Base chain grows with level; evolved covers a wide arc slowly
            isEvolved ? 12 : Math.min(10, 3 + this.level),
            isEvolved ? 1300 : 700,
        );
        chain.source = this;
        chain.hitEnemies.add(target);
        chain.chainRange = (isEvolved ? 200 : 150) * areaScale;
        // "Slower bounces" is the whole feel of the evolution
        chain.hopInterval = isEvolved ? 0.13 : 0.05;
        chain.damageFalloff = isEvolved ? 0.94 : 0.88;

        if (isEvolved) {
            chain.colors = ['rgba(170, 90, 255,', 'rgba(215, 165, 255,', 'rgba(255, 255, 255,'];
        }

        // Particles are budgeted; damage is not
        let particleBudget = 6;
        chain.onHit = (t: any, d: number) => {
            damageSystem.dealDamage({ baseDamage: d, source: this, target: t, position: t.pos });
            if (particleBudget > 0) {
                particleBudget--;
                particles.emitLightning(t.pos.x, t.pos.y);
            }
        };

        if (isEvolved) {
            // Every other impact leaves an electrified patch. Every hop was
            // too much: the fields overlapped into one blob and buried the
            // screen in damage numbers.
            chain.onArc = (pos: Vector2, hop: number) => {
                if (hop % 2 !== 0) return;
                const field = new StaticFieldZone(
                    pos.x,
                    pos.y,
                    44 * areaScale,
                    this.damage * 0.2,
                    1.6 * this.owner.stats.duration,
                );
                field.source = this;
                this.onSpawn(field);
            };
        }

        this.onSpawn(chain);
    }
}

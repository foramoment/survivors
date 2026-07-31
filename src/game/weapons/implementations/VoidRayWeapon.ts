/**
 * VOID RAY WEAPON
 *
 * A charged lance that damages *everything along its line*, not just the enemy
 * it locked onto (see VoidRayBeam.fire). That, plus a higher base damage, is
 * what makes it worth a weapon slot.
 *
 * Evolved — Void Cannon: the ray overshoots far past the target and the impact
 * point collapses: enemies are dragged into a singularity for a moment, then
 * it detonates. The old evolution was a static EMP ring that looked like a
 * screensaver and did nothing you could see.
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { VoidRayBeam } from '../base';
import { Zone } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { particles } from '../../core/ParticleSystem';
import { juice } from '../../core/JuiceSystem';

// ============================================
// VOID COLLAPSE - pulls everything in, then detonates
// ============================================
export class VoidCollapseZone extends Zone {
    /** Seconds of pull before the detonation */
    private static readonly PULL_TIME = 0.55;

    private age: number = 0;
    private detonated: boolean = false;
    private maxRadius: number;
    /** Baked spiral arms — recomputing these per frame made the effect boil */
    private arms: { angle: number; length: number }[] = [];

    constructor(x: number, y: number, radius: number, damage: number) {
        super(x, y, radius, VoidCollapseZone.PULL_TIME + 0.35, damage, Number.MAX_VALUE, '');
        this.maxRadius = radius;
        for (let i = 0; i < 5; i++) {
            this.arms.push({
                angle: (i / 5) * Math.PI * 2,
                length: 0.55 + Math.random() * 0.45,
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.age += dt;

        if (this.age < VoidCollapseZone.PULL_TIME) {
            // Drag everything in range toward the centre
            for (const enemy of levelSpatialHash.getNearby(this.pos, this.maxRadius)) {
                if (enemy.isDead || enemy.isBoss) continue;
                const dist = distance(this.pos, enemy.pos);
                if (dist > this.maxRadius || dist < 1) continue;
                const pull = (1 - dist / this.maxRadius) * 320 * dt;
                enemy.pos.x += ((this.pos.x - enemy.pos.x) / dist) * pull;
                enemy.pos.y += ((this.pos.y - enemy.pos.y) / dist) * pull;
            }
            return;
        }

        if (!this.detonated) {
            this.detonated = true;
            for (const enemy of levelSpatialHash.getNearby(this.pos, this.maxRadius)) {
                if (enemy.isDead) continue;
                if (distance(this.pos, enemy.pos) > this.maxRadius) continue;
                damageSystem.dealDamage({
                    baseDamage: this.damage,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos,
                });
            }
            particles.emitOrbitalImpact(this.pos.x, this.pos.y, this.maxRadius * 0.6);
            juice.shockwave(this.pos.x, this.pos.y, this.maxRadius * 1.8, '#d17bff', 0.35, 6);
            juice.addTrauma(0.2);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const pulling = this.age < VoidCollapseZone.PULL_TIME;

        if (pulling) {
            const t = this.age / VoidCollapseZone.PULL_TIME;
            const spin = this.age * 6;

            // Spiral arms winding into the core
            ctx.strokeStyle = `rgba(190, 110, 255, ${0.35 + 0.4 * t})`;
            ctx.lineWidth = 3;
            for (const arm of this.arms) {
                ctx.beginPath();
                for (let i = 0; i <= 12; i++) {
                    const p = i / 12;
                    const r = this.maxRadius * arm.length * (1 - p) * (1 - t * 0.5);
                    const a = arm.angle + spin + p * 2.4;
                    const x = Math.cos(a) * r;
                    const y = Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            // Event horizon
            const core = 6 + t * 14;
            ctx.fillStyle = '#0a0012';
            ctx.beginPath();
            ctx.arc(0, 0, core, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#e9b6ff';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            // Detonation: a hard white ring snapping outward
            const t = (this.age - VoidCollapseZone.PULL_TIME) / 0.35;
            const alpha = Math.max(0, 1 - t);
            ctx.strokeStyle = `rgba(255, 240, 255, ${alpha})`;
            ctx.lineWidth = 10 * alpha;
            ctx.beginPath();
            ctx.arc(0, 0, this.maxRadius * (0.4 + t * 0.9), 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `rgba(200, 120, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(0, 0, this.maxRadius * 0.5 * (1 - t), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Charged lance that burns through everything in its path.";

    readonly stats = {
        damage: 40,
        cooldown: 2.0,
        area: 110, // collapse radius when evolved
        speed: 0,
        duration: 0.5,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy(600);

            if (target) {
                const isEvolved = this.evolved;
                const beam = new VoidRayBeam(
                    this.owner,
                    target,
                    this.damage * (isEvolved ? 1.8 : 1),
                    isEvolved
                );
                beam.source = this;

                if (isEvolved) {
                    beam.onVoidExplosion = (x: number, y: number, collapseDamage: number) => {
                        const collapse = new VoidCollapseZone(
                            x, y,
                            this.area * this.owner.stats.area,
                            collapseDamage
                        );
                        collapse.source = this;
                        this.onSpawn(collapse);
                    };
                }

                this.onSpawn(beam);
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }
}

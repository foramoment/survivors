/**
 * VOID RAY WEAPON
 * Fires a powerful charging beam at enemies.
 * 
 * Evolved: Void Cannon - Double damage, wider beam + EMP explosion at target
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { VoidRayBeam } from '../base';
import { Zone } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';
import { particles } from '../../core/ParticleSystem';

// ============================================
// VOID EMP EXPLOSION - Expanding ring with electric effect
// ============================================
export class VoidEMPExplosion extends Zone {
    private ringRadius: number = 0;
    private ringAlpha: number = 1.0;
    private sparks: { x: number; y: number; angle: number; length: number }[] = [];
    private damageDealt: boolean = false;
    private maxRadius: number;

    constructor(x: number, y: number, radius: number, damage: number) {
        super(x, y, radius, 0.6, damage, Number.MAX_VALUE, '');
        this.maxRadius = radius;

        // Generate electric sparks
        for (let i = 0; i < 12; i++) {
            this.sparks.push({
                x: 0,
                y: 0,
                angle: (i / 12) * Math.PI * 2,
                length: 20 + Math.random() * 30
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        // Expand ring
        this.ringRadius += dt * this.maxRadius * 3;
        this.ringAlpha = Math.max(0, 1 - (this.ringRadius / this.maxRadius));

        // Deal damage once at start
        if (!this.damageDealt) {
            this.damageDealt = true;
            const enemiesInBlast = levelSpatialHash.getWithinRadius(this.pos, this.maxRadius);

            for (const enemy of enemiesInBlast) {
                if (distance(this.pos, enemy.pos) <= this.maxRadius) {
                    damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this.source,
                        target: enemy,
                        position: enemy.pos
                    });
                }
            }
        }

        // Update spark positions
        for (const spark of this.sparks) {
            spark.x = Math.cos(spark.angle) * this.ringRadius;
            spark.y = Math.sin(spark.angle) * this.ringRadius;
        }

        if (this.ringRadius >= this.maxRadius * 1.5) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // EMP ring
        if (this.ringAlpha > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, this.ringRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(200, 100, 255, ${this.ringAlpha})`;
            ctx.lineWidth = 8 * this.ringAlpha;
            ctx.shadowColor = '#cc66ff';
            ctx.shadowBlur = 25;
            ctx.stroke();

            // Inner ring
            ctx.beginPath();
            ctx.arc(0, 0, this.ringRadius * 0.9, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 200, 255, ${this.ringAlpha * 0.8})`;
            ctx.lineWidth = 3 * this.ringAlpha;
            ctx.stroke();
        }

        // Electric sparks on ring
        ctx.shadowBlur = 10;
        for (const spark of this.sparks) {
            if (this.ringAlpha < 0.3) continue;

            ctx.beginPath();
            ctx.moveTo(spark.x, spark.y);

            // Jagged electric line
            const segments = 3;
            let px = spark.x;
            let py = spark.y;
            for (let i = 0; i < segments; i++) {
                const t = (i + 1) / segments;
                const targetX = spark.x + Math.cos(spark.angle) * spark.length * t;
                const targetY = spark.y + Math.sin(spark.angle) * spark.length * t;
                const offsetAngle = spark.angle + Math.PI / 2;
                const offset = (Math.random() - 0.5) * 15;
                px = targetX + Math.cos(offsetAngle) * offset;
                py = targetY + Math.sin(offsetAngle) * offset;
                ctx.lineTo(px, py);
            }

            ctx.strokeStyle = `rgba(255, 255, 255, ${this.ringAlpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Center distortion effect
        if (this.ringAlpha > 0.5) {
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
            gradient.addColorStop(0, `rgba(255, 200, 255, ${this.ringAlpha * 0.6})`);
            gradient.addColorStop(0.5, `rgba(180, 100, 255, ${this.ringAlpha * 0.3})`);
            gradient.addColorStop(1, 'rgba(100, 50, 200, 0)');

            ctx.beginPath();
            ctx.arc(0, 0, 30, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        ctx.restore();
    }
}

export class VoidRayWeapon extends Weapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a powerful charging beam.";

    readonly stats = {
        damage: 25,
        cooldown: 2.0,
        area: 100, // Used for EMP explosion radius when evolved
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
                const damage = this.damage * (isEvolved ? 2 : 1);

                const beam = new VoidRayBeam(
                    this.owner,
                    target,
                    damage,
                    isEvolved
                );
                beam.source = this;

                // Evolved: add EMP explosion callback
                if (isEvolved) {
                    beam.onVoidExplosion = (x: number, y: number, explosionDamage: number) => {
                        const empRadius = this.area * this.owner.stats.area;
                        const emp = new VoidEMPExplosion(x, y, empRadius, explosionDamage);
                        emp.source = this;
                        this.onSpawn(emp);

                        // Emit particles
                        particles.emitHit(x, y, '#cc66ff');
                    };
                }

                this.onSpawn(beam);

                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }
}

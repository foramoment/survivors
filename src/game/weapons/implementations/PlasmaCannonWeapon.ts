/**
 * PLASMA CANNON WEAPON
 * Fires massive explosive plasma rounds.
 * 
 * Evolved: Fusion Core - Creates pull zone on explosion
 */
import { ProjectileWeapon, PlasmaProjectile, Zone, type ProjectileParams } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../Entity';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// EVOLVED PLASMA CANNON - FUSION CORE
// Creates singularity pull zone on explosion
// ============================================

export class FusionCoreSingularity extends Zone {
    private rotationAngle: number = 0;
    pullStrength: number = 180;

    constructor(x: number, y: number, damage: number) {
        super(x, y, 80, 2.0, damage, 0.2, ''); // 80 radius, 2s duration
    }

    update(dt: number) {
        super.update(dt);
        this.rotationAngle += dt * 4;

        // Pull enemies toward center
        const enemiesInSingularity = levelSpatialHash.getWithinRadius(this.pos, this.radius * 1.5);

        for (const enemy of enemiesInSingularity) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = distance(this.pos, enemy.pos);

            if (dist < this.radius * 1.5 && dist > 5) {
                const pullForce = this.pullStrength / dist;
                (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                (enemy as any).pos.y += (dy / dist) * pullForce * dt;
            }
        }

        // Emit particles
        if (Math.random() > 0.8) {
            particles.emitHit(this.pos.x, this.pos.y, '#00ff66');
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration);

        // Pull effect lines
        ctx.rotate(this.rotationAngle);
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);
            ctx.beginPath();
            ctx.moveTo(this.radius * 1.2, 0);
            ctx.lineTo(this.radius * 0.3, 0);
            ctx.strokeStyle = `rgba(0, 255, 100, ${0.4 * fade})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.rotate(-this.rotationAngle);

        // Core gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.5);
        gradient.addColorStop(0, `rgba(100, 255, 150, ${0.9 * fade})`);
        gradient.addColorStop(0.5, `rgba(0, 200, 100, ${0.6 * fade})`);
        gradient.addColorStop(1, `rgba(0, 100, 50, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#00ff66';
        ctx.shadowBlur = 20 * fade;
        ctx.fill();

        // Energy ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 100, ${0.5 * fade})`;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }
}

export class PlasmaCannonWeapon extends ProjectileWeapon {
    name = "Plasma Cannon";
    emoji = "🔋";
    description = "Fires massive explosive plasma rounds.";
    projectileEmoji = "🟢";
    pierce = 999;

    readonly stats = {
        damage: 40,
        cooldown: 2.5,
        area: 150,
        speed: 350,
        duration: 3,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
        this.duration = this.stats.duration;
    }

    update(dt: number) {
        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

            if (target) {
                this.fire(target);
                const cdMultiplier = this.evolved ? 1.4 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    protected createProjectile(params: ProjectileParams): Entity {
        return new PlasmaProjectile(
            params.x, params.y, params.velocity,
            params.duration, params.damage, params.pierce
        );
    }

    protected onProjectileCreated(proj: Entity): void {
        if (this.evolved) {
            const plasma = proj as PlasmaProjectile;
            const { damage } = this.owner.getDamage(this.damage);
            plasma.onExplosion = (x: number, y: number) => {
                const pullZone = new FusionCoreSingularity(x, y, damage * 0.15);
                this.onSpawn(pullZone);
            };
        }
    }
}

/**
 * PLASMA CANNON WEAPON
 * Fires massive explosive plasma rounds.
 * 
 * Evolved: Fusion Core - Creates pull zone on explosion
 */
import { ProjectileWeapon, PlasmaProjectile, Zone } from '../base';
import { Entity } from '../../Entity';
import { distance, type Vector2 } from '../../core/Utils';
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
            const dist = Math.sqrt(dx * dx + dy * dy);

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

    static readonly CONFIG = {
        damage: 40,
        cooldown: 2.5,
        area: 150,
        speed: 350,
        duration: 3,
        // Extras
    };

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = PlasmaCannonWeapon.CONFIG.cooldown;
        this.damage = PlasmaCannonWeapon.CONFIG.damage;
        this.speed = PlasmaCannonWeapon.CONFIG.speed;
        this.area = PlasmaCannonWeapon.CONFIG.area;
        this.duration = PlasmaCannonWeapon.CONFIG.duration;
    }

    update(dt: number) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = this.area * (this.owner as any).stats.area;

            const searchRadius = minDst;
            const potentialTargets = levelSpatialHash.getWithinRadius(this.owner.pos, searchRadius);

            for (const enemy of potentialTargets) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                this.fire(target);
                const cdMultiplier = this.evolved ? 1.4 : 1.0;
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);
        const isEvolved = this.evolved;

        const plasma = new PlasmaProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration,
            damage,
            1
        );

        if (isEvolved) {
            plasma.onExplosion = (x: number, y: number) => {
                const pullZone = new FusionCoreSingularity(x, y, damage * 0.15);
                this.onSpawn(pullZone);
            };
        }

        this.onSpawn(plasma);
    }

    // Uses base class upgrade()
}

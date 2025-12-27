/**
 * SINGULARITY ORB WEAPON
 * Slow moving orb that pulls enemies.
 * 
 * Evolved: Black Hole - Creates black hole zone on death
 */
import { ProjectileWeapon, SingularityProjectile, Zone } from '../base';
import type { Player } from '../../entities/Player';
import { Entity } from '../../Entity';
import { distance, type Vector2 } from '../../core/Utils';
import { levelSpatialHash } from '../../core/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { particles } from '../../core/ParticleSystem';

// ============================================
// EVOLVED SINGULARITY ORB - BLACK HOLE
// Dark lightning, stronger pull, collapses into zone
// ============================================

export class BlackHoleProjectile extends SingularityProjectile {
    private darkLightningTimer: number = 0;
    private darkLightningInterval: number = 0.5;
    private darkLightnings: { start: Vector2; end: Vector2; alpha: number }[] = [];
    onDeath?: (x: number, y: number) => void;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce);
        this.radius = 35; // Larger
        this.pullStrength = 200; // Stronger pull
    }

    update(dt: number) {
        super.update(dt);

        // Dark lightning timer
        this.darkLightningTimer += dt;
        if (this.darkLightningTimer >= this.darkLightningInterval) {
            this.darkLightningTimer = 0;
            this.fireDarkLightning();
        }

        // Update existing dark lightnings
        for (let i = this.darkLightnings.length - 1; i >= 0; i--) {
            this.darkLightnings[i].alpha -= dt * 4;
            if (this.darkLightnings[i].alpha <= 0) {
                this.darkLightnings.splice(i, 1);
            }
        }

        // On death, trigger black hole zone
        if (this.isDead && this.onDeath) {
            this.onDeath(this.pos.x, this.pos.y);
        }
    }

    private fireDarkLightning() {
        // Find closest enemy in range
        let closest: any = null;
        let minDist = 150;

        const potentialTargets = levelSpatialHash.getWithinRadius(this.pos, 150);

        for (const enemy of potentialTargets) {
            const d = distance(this.pos, enemy.pos);
            if (d < minDist) {
                minDist = d;
                closest = enemy;
            }
        }

        if (closest) {
            this.darkLightnings.push({
                start: { ...this.pos },
                end: { ...closest.pos },
                alpha: 1
            });
            // Deal damage via DamageSystem
            damageSystem.dealRawDamage(closest, this.damage * 0.3, closest.pos);
            particles.emitHit(closest.pos.x, closest.pos.y, '#8800ff');
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Distortion field - larger
        ctx.strokeStyle = 'rgba(80, 0, 160, 0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 3, 0, Math.PI * 2);
        ctx.stroke();

        // Swirling effect
        const time = Date.now() / 200;
        ctx.rotate(time);
        for (let i = 0; i < 6; i++) {
            ctx.rotate(Math.PI / 3);
            ctx.beginPath();
            ctx.arc(this.radius * 0.7, 0, 6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 50, 255, 0.7)`;
            ctx.fill();
        }
        ctx.rotate(-time);

        // Dark core - gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        gradient.addColorStop(0.4, 'rgba(40, 0, 80, 0.9)');
        gradient.addColorStop(1, 'rgba(80, 0, 160, 0.4)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#6600cc';
        ctx.shadowBlur = 30;
        ctx.fill();

        // Event horizon ring
        ctx.strokeStyle = 'rgba(200, 100, 255, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();

        // Draw dark lightnings
        ctx.save();
        ctx.translate(-camera.x, -camera.y);
        for (const lightning of this.darkLightnings) {
            this.drawDarkLightning(ctx, lightning.start, lightning.end, lightning.alpha);
        }
        ctx.restore();
    }

    private drawDarkLightning(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2, alpha: number) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) return;

        ctx.save();

        const segments = Math.max(3, Math.floor(dist / 30));
        const points: Vector2[] = [{ ...start }];
        const perpX = -dy / dist;
        const perpY = dx / dist;

        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const offset = (Math.random() - 0.5) * 20;
            points.push({
                x: start.x + dx * t + perpX * offset,
                y: start.y + dy * t + perpY * offset
            });
        }
        points.push({ ...end });

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(100, 0, 200, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#6600cc';
        ctx.shadowBlur = 10;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(200, 150, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();
    }
}

// Black hole zone that appears after projectile dies
export class BlackHoleZone extends Zone {
    private rotationAngle: number = 0;
    pullStrength: number = 300;

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.2, '', 0);
    }

    update(dt: number) {
        super.update(dt);
        this.rotationAngle += dt * 2;

        // Pull enemies
        const enemiesInPullRange = levelSpatialHash.getWithinRadius(this.pos, this.radius * 2);

        for (const enemy of enemiesInPullRange) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.radius * 2 && dist > 5) {
                const pullForce = this.pullStrength / dist;
                (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                (enemy as any).pos.y += (dy / dist) * pullForce * dt;
            }
        }

        // Emit particles
        if (Math.random() > 0.7) {
            particles.emitSingularityDistortion(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Fade based on remaining duration
        const fade = Math.min(1, this.duration);

        // Outer distortion
        ctx.strokeStyle = `rgba(80, 0, 160, ${0.3 * fade})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Spinning arms
        ctx.rotate(this.rotationAngle);
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(
                this.radius * 0.5, this.radius * 0.3,
                this.radius, 0
            );
            ctx.strokeStyle = `rgba(150, 50, 255, ${0.5 * fade})`;
            ctx.lineWidth = 4;
            ctx.stroke();
        }
        ctx.rotate(-this.rotationAngle);

        // Dark core
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.7);
        gradient.addColorStop(0, `rgba(0, 0, 0, ${0.9 * fade})`);
        gradient.addColorStop(0.5, `rgba(40, 0, 80, ${0.6 * fade})`);
        gradient.addColorStop(1, `rgba(80, 0, 160, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#6600cc';
        ctx.shadowBlur = 25 * fade;
        ctx.fill();

        ctx.restore();
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

    private activeBlackHole: any = null;
    private waitingForCollapse: boolean = false;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.speed = this.stats.speed;
        this.area = this.stats.area;
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

        const speedBoost = this.owner.weaponSpeedBoost || 1;
        this.cooldown -= dt * speedBoost;

        if (this.cooldown <= 0) {
            const target = this.findClosestEnemy();

            if (target) {
                this.fire(target);
                const cdMultiplier = isEvolved ? 2.0 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }

    fire(target: Entity) {
        const velocity = this.calculateVelocityToTarget(target);
        const { damage } = this.owner.getDamage(this.damage);
        const isEvolved = this.evolved;

        if (isEvolved) {
            const proj = new BlackHoleProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                damage,
                this.pierce
            );

            proj.onDeath = (x: number, y: number) => {
                const zone = new BlackHoleZone(x, y, 100, 3.0, damage * 0.2);
                this.activeBlackHole = zone;
                this.onSpawn(zone);
            };

            this.waitingForCollapse = true;
            this.onSpawn(proj);
        } else {
            const proj = new SingularityProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * this.owner.stats.duration,
                damage,
                this.pierce
            );
            proj.pullStrength = 80;
            this.onSpawn(proj);
        }
    }
}

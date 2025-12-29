/**
 * BASE PROJECTILE CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { Entity } from '../../Entity';
import { type Vector2, normalize, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// PROJECTILE - Base class for all flying entities
// ============================================

import { type HitResult } from '../../core/CollisionSystem';

export class Projectile extends Entity {
    velocity: Vector2;
    duration: number;
    damage: number;
    pierce: number;
    emoji: string;
    canCollide: boolean = true;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number, emoji: string) {
        super(x, y, 5);
        this.velocity = velocity;
        this.duration = duration;
        this.damage = damage;
        this.pierce = pierce;
        this.emoji = emoji;
    }

    update(dt: number) {
        this.pos.x += this.velocity.x * dt;
        this.pos.y += this.velocity.y * dt;
        this.duration -= dt;
        if (this.duration <= 0) {
            this.kill();
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);
        ctx.restore();
    }

    /**
     * Handle a collision with an enemy.
     * Override in subclasses for custom behavior (bouncing, piercing, etc.)
     * @returns HitResult with damage and whether to continue checking
     */
    handleHit(_enemy: Entity): HitResult {
        this.pierce--;
        if (this.pierce < 0) {
            this.kill();
        }
        return {
            damage: this.damage,
            continueChecking: !this.isDead
        };
    }

    /**
     * Kill the projectile, triggering onDeath hook.
     * Safe to call multiple times.
     */
    kill(): void {
        if (!this.isDead) {
            this.isDead = true;
            this.onDeath();
        }
    }

    /**
     * Hook called when projectile dies.
     * Override in subclasses for explosion effects, spawning zones, etc.
     */
    protected onDeath(): void {
        // Base implementation does nothing
    }
}

// ============================================
// BOUNCING PROJECTILE - For ricochet weapons
// ============================================
export class BouncingProjectile extends Projectile {
    bouncesLeft: number;
    maxBounceRange: number;
    hitEnemies: Set<any> = new Set();
    onBounce: (projectile: BouncingProjectile, enemies: any[]) => void = () => { };

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, bounces: number, emoji: string, bounceRange: number = 300) {
        super(x, y, velocity, duration, damage, 0, emoji);
        this.bouncesLeft = bounces;
        this.maxBounceRange = bounceRange;
    }

    canHit(enemy: any): boolean {
        return !this.hitEnemies.has(enemy);
    }

    markHit(enemy: any) {
        this.hitEnemies.add(enemy);
    }

    bounce(newTarget: Vector2) {
        const dir = normalize({
            x: newTarget.x - this.pos.x,
            y: newTarget.y - this.pos.y
        });
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        this.velocity = { x: dir.x * speed, y: dir.y * speed };
        this.bouncesLeft--;
    }

    /**
     * Override handleHit for bouncing behavior.
     * Returns 0 damage if enemy was already hit.
     */
    handleHit(enemy: Entity): HitResult {
        // Skip if already hit this enemy
        if (!this.canHit(enemy)) {
            return { damage: 0, continueChecking: true };
        }

        this.markHit(enemy);

        // Try to bounce to next target
        if (this.bouncesLeft > 0) {
            const nearbyEnemies = levelSpatialHash.getWithinRadius(this.pos, this.maxBounceRange);
            let nearestEnemy: Entity | null = null;
            let minDist = this.maxBounceRange;

            for (const target of nearbyEnemies) {
                if (this.canHit(target)) {
                    const d = distance(this.pos, target.pos);
                    if (d < minDist) {
                        minDist = d;
                        nearestEnemy = target;
                    }
                }
            }

            if (nearestEnemy) {
                this.bounce(nearestEnemy.pos);
            } else {
                this.kill(); // No more targets
            }
        } else {
            this.kill(); // No bounces left
        }

        return {
            damage: this.damage,
            continueChecking: false // Don't check more enemies this frame
        };
    }
}

// ============================================
// SINGULARITY PROJECTILE - Pulls enemies in
// ============================================
export class SingularityProjectile extends Projectile {
    private particleTimer: number = 0;
    private rotation: number = 0;
    pullStrength: number = 80;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 20;
    }

    update(dt: number) {
        super.update(dt);
        this.rotation += dt * 3;

        this.particleTimer += dt;
        if (this.particleTimer > 0.08) {
            this.particleTimer = 0;
            particles.emitSingularityDistortion(this.pos.x, this.pos.y, this.radius);
        }

        const enemiesInPullRange = levelSpatialHash.getWithinRadius(this.pos, 200);

        for (const enemy of enemiesInPullRange) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = distance(this.pos, enemy.pos);

            if (dist < 200 && dist > 5) {
                const pullForce = this.pullStrength / dist;
                (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                (enemy as any).pos.y += (dy / dist) * pullForce * dt;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.strokeStyle = 'rgba(100, 0, 200, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.rotate(this.rotation);
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.arc(this.radius * 0.5, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 50, 255, 0.6)`;
            ctx.fill();
        }
        ctx.rotate(-this.rotation);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(20, 0, 40, 1)');
        gradient.addColorStop(0.5, 'rgba(60, 0, 120, 0.8)');
        gradient.addColorStop(1, 'rgba(100, 50, 200, 0.3)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#8800ff';
        ctx.shadowBlur = 20;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 200, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// PLASMA PROJECTILE - Explodes on death
// ============================================
export class PlasmaProjectile extends Projectile {
    private particleTimer: number = 0;
    onExplosion?: (x: number, y: number) => void;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 15;
    }

    update(dt: number) {
        super.update(dt);

        this.particleTimer += dt;
        if (this.particleTimer > 0.05) {
            this.particleTimer = 0;
            particles.emitPlasmaEnergy(this.pos.x, this.pos.y);
        }
    }

    protected onDeath(): void {
        if (this.onExplosion) {
            this.onExplosion(this.pos.x, this.pos.y);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        ctx.fill();

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(200, 255, 200, 1)');
        gradient.addColorStop(0.4, 'rgba(100, 255, 100, 0.9)');
        gradient.addColorStop(1, 'rgba(0, 200, 50, 0.5)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        const time = Date.now() / 100;
        for (let i = 0; i < 4; i++) {
            const angle = time + i * Math.PI / 2;
            const sparkX = Math.cos(angle) * this.radius * 0.6;
            const sparkY = Math.sin(angle) * this.radius * 0.6;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// ORBITING PROJECTILE - Orbits around owner
// ============================================
export class OrbitingProjectile extends Projectile {
    angle: number = 0;
    distance: number;
    speed: number;
    owner: any;

    constructor(owner: any, distance: number, speed: number, duration: number, damage: number, emoji: string) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, duration, damage, 999, emoji);
        this.owner = owner;
        this.distance = distance;
        this.speed = speed;
        this.canCollide = true;
    }

    update(dt: number) {
        this.angle += this.speed * dt;
        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * this.distance;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * this.distance;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

// ============================================
// LOBBED PROJECTILE - For grenades/flasks
// ============================================
export class LobbedProjectile extends Projectile {
    targetPos: Vector2;
    startPos: Vector2;
    totalDuration: number;
    height: number = 50;
    onLand: (x: number, y: number) => void = () => { };

    constructor(x: number, y: number, target: Vector2, duration: number, emoji: string) {
        super(x, y, { x: 0, y: 0 }, duration, 0, 0, emoji);
        this.startPos = { x, y };
        this.targetPos = { ...target };
        this.totalDuration = duration;
        this.canCollide = false;
    }

    update(dt: number) {
        this.duration -= dt;
        const t = 1 - (this.duration / this.totalDuration);

        if (t >= 1) {
            this.isDead = true;
            this.onLand(this.targetPos.x, this.targetPos.y);
            return;
        }

        this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * t;
        this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * t;

        const yOffset = 4 * this.height * t * (1 - t);
        this.pos.y -= yOffset;
    }
}

// ============================================
// NANOBOT - Swirling orbit projectile
// ============================================
export class Nanobot extends Projectile {
    owner: any;
    angle: number;
    distance: number;
    rotationSpeed: number;

    constructor(owner: any, distance: number, angle: number, duration: number, damage: number) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, duration, damage, 999, '🦠');
        this.owner = owner;
        this.distance = distance;
        this.angle = angle;
        this.rotationSpeed = 2;
        this.canCollide = true;
    }

    update(dt: number) {
        this.angle += this.rotationSpeed * dt;
        const currentDist = this.distance + Math.sin(Date.now() / 200) * 20;

        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * currentDist;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * currentDist;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

// Re-export utilities used by projectiles
export { normalize, distance };

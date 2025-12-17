/**
 * Evolution Types - Separate classes for each evolved weapon
 * 
 * EVOLVE weapons are unlocked at level 6 and feature:
 * - Unique mechanics (not just stat boosts)
 * - Custom animations and visual effects
 * - Balanced with increased cooldowns
 */

import { Entity } from '../Entity';
import { distance, type Vector2 } from '../core/Utils';
import { particles } from '../core/ParticleSystem';
import {
    ChainLightning,
    SingularityProjectile,
    DelayedExplosionZone,
    Zone
} from './WeaponTypes';

// ============================================
// EVOLVED LIGHTNING CHAIN - THUNDERSTORM
// 10% chance per bounce to split into 2 branches
// ============================================

export class ThunderstormLightning extends ChainLightning {
    splitChance: number = 0.1;
    private pendingSplits: { pos: Vector2; damage: number; bounces: number; hitEnemies: Set<any> }[] = [];
    private allChainsComplete: boolean = false;
    onAllChainsComplete?: () => void;

    update(dt: number, enemies?: Entity[]) {
        // Process pending splits
        if (this.pendingSplits.length > 0 && enemies) {
            const split = this.pendingSplits.shift()!;
            this.createSplitChain(split, enemies);
        }

        super.update(dt, enemies);

        // Check if all chains complete
        if (this.hasChained && this.segments.length === 0 && this.pendingSplits.length === 0) {
            if (!this.allChainsComplete) {
                this.allChainsComplete = true;
                if (this.onAllChainsComplete) this.onAllChainsComplete();
            }
        }
    }

    private createSplitChain(split: { pos: Vector2; damage: number; bounces: number; hitEnemies: Set<any> }, enemies: Entity[]) {
        // Find a new target not in hitEnemies
        let target: any = null;
        let minDst = this.range;

        for (const enemy of enemies) {
            if (split.hitEnemies.has(enemy)) continue;
            const d = distance(split.pos, enemy.pos);
            if (d < minDst) {
                minDst = d;
                target = enemy;
            }
        }

        if (target && split.bounces > 0) {
            // Add segment
            this.segments.push({
                start: { ...split.pos },
                end: { ...target.pos },
                alpha: 1
            });

            // Deal damage
            target.takeDamage(split.damage);
            this.onHit(target, split.damage);
            split.hitEnemies.add(target);

            // Emit particles
            particles.emitLightning(target.pos.x, target.pos.y);

            // Check for another split
            if (Math.random() < this.splitChance) {
                this.pendingSplits.push({
                    pos: { ...target.pos },
                    damage: split.damage * 0.9,
                    bounces: split.bounces - 1,
                    hitEnemies: new Set(split.hitEnemies)
                });
            }

            // Continue chain
            if (split.bounces > 1) {
                this.pendingSplits.push({
                    pos: { ...target.pos },
                    damage: split.damage * 0.95,
                    bounces: split.bounces - 1,
                    hitEnemies: split.hitEnemies
                });
            }
        }
    }

    // Override to add split logic
    chainToEnemy(enemy: any, currentBounces: number) {
        // Check for split
        if (Math.random() < this.splitChance && currentBounces > 1) {
            this.pendingSplits.push({
                pos: { ...enemy.pos },
                damage: this.damage * 0.9,
                bounces: Math.floor(currentBounces / 2),
                hitEnemies: new Set(this.hitEnemies)
            });
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const seg of this.segments) {
            this.drawThunderstormBolt(ctx, seg.start, seg.end, seg.alpha);
        }

        ctx.restore();
    }

    private drawThunderstormBolt(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2, alpha: number) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5 || !isFinite(dist) || alpha <= 0) return;

        ctx.save();

        // Generate zigzag points
        const numSegments = Math.min(18, Math.max(5, Math.floor(dist / 25)));
        const points: Vector2[] = [{ x: start.x, y: start.y }];

        const perpX = -dy / dist;
        const perpY = dx / dist;

        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const baseX = start.x + dx * t;
            const baseY = start.y + dy * t;
            const offset = (Math.random() - 0.5) * 35 * (1 - Math.abs(t - 0.5) * 1.5);
            points.push({
                x: baseX + perpX * offset,
                y: baseY + perpY * offset
            });
        }
        points.push({ x: end.x, y: end.y });

        // Outer glow - purple tint for evolved
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(180, 100, 255, ${alpha * 0.4})`;
        ctx.lineWidth = 14;
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur = 30;
        ctx.stroke();

        // Main bolt - brighter
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(200, 150, 255, ${alpha * 0.9})`;
        ctx.lineWidth = 5;
        ctx.shadowColor = '#cc88ff';
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Bright core - white/purple
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.stroke();

        // More branches for evolved
        if (alpha > 0.3 && dist > 30) {
            for (let i = 1; i < points.length - 1; i++) {
                if (Math.random() > 0.4) {
                    const branchAngle = (Math.random() - 0.5) * Math.PI * 0.7;
                    const branchLen = 15 + Math.random() * 30;
                    const angle = Math.atan2(dy, dx) + branchAngle;

                    ctx.beginPath();
                    ctx.moveTo(points[i].x, points[i].y);
                    ctx.lineTo(
                        points[i].x + Math.cos(angle) * branchLen,
                        points[i].y + Math.sin(angle) * branchLen
                    );
                    ctx.strokeStyle = `rgba(200, 150, 255, ${alpha * 0.5})`;
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 5;
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }
}

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

    update(dt: number, enemies?: Entity[]) {
        super.update(dt, enemies);

        // Dark lightning timer
        this.darkLightningTimer += dt;
        if (this.darkLightningTimer >= this.darkLightningInterval && enemies) {
            this.darkLightningTimer = 0;
            this.fireDarkLightning(enemies);
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

    private fireDarkLightning(enemies: Entity[]) {
        // Find closest enemy in range
        let closest: any = null;
        let minDist = 150;

        for (const enemy of enemies) {
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
            closest.takeDamage(this.damage * 0.3);
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

    update(dt: number, enemies?: Entity[]) {
        super.update(dt);
        this.rotationAngle += dt * 2;

        // Pull enemies
        if (enemies) {
            for (const enemy of enemies) {
                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.radius * 2 && dist > 5) {
                    const pullForce = this.pullStrength / dist;
                    (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                    (enemy as any).pos.y += (dy / dist) * pullForce * dt;
                }
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

// ============================================
// EVOLVED ORBITAL STRIKE - ATOMIC BOMB
// Single massive explosion with mushroom cloud
// ============================================

export class AtomicBombZone extends DelayedExplosionZone {
    private atomicShockwaveRadius: number = 0;
    private atomicMushroomHeight: number = 0;
    private atomicExploded: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, onDamage?: (pos: Vector2, amount: number) => void) {
        super(x, y, radius, 1.2, damage, '☢️', onDamage, true);
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt, enemies);

        // After explosion, expand shockwave
        if (this.exploded && !this.atomicExploded) {
            this.atomicExploded = true;
            // Emit tons of particles
            for (let i = 0; i < 20; i++) {
                particles.emitExplosion(
                    this.pos.x + (Math.random() - 0.5) * this.radius,
                    this.pos.y + (Math.random() - 0.5) * this.radius
                );
            }
        }

        if (this.atomicExploded) {
            this.atomicShockwaveRadius += dt * 500;
            this.atomicMushroomHeight = Math.min(this.radius * 2, this.atomicMushroomHeight + dt * 200);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        // Use base class draw for targeting phase
        if (!this.exploded) {
            super.draw(ctx, camera);
            return;
        }

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.max(0, this.duration / 0.8);

        // Shockwave rings
        for (let i = 0; i < 3; i++) {
            const ringRadius = this.atomicShockwaveRadius - i * 30;
            if (ringRadius > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 150, 0, ${(0.5 - i * 0.15) * fade})`;
                ctx.lineWidth = 8 - i * 2;
                ctx.stroke();
            }
        }

        // Core explosion
        const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        coreGradient.addColorStop(0, `rgba(255, 255, 200, ${0.9 * fade})`);
        coreGradient.addColorStop(0.3, `rgba(255, 200, 50, ${0.7 * fade})`);
        coreGradient.addColorStop(0.6, `rgba(255, 100, 0, ${0.5 * fade})`);
        coreGradient.addColorStop(1, `rgba(200, 50, 0, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = coreGradient;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 50 * fade;
        ctx.fill();

        // Mushroom cloud stem
        if (this.atomicMushroomHeight > 0) {
            const stemGradient = ctx.createLinearGradient(0, 0, 0, -this.atomicMushroomHeight);
            stemGradient.addColorStop(0, `rgba(200, 100, 50, ${0.6 * fade})`);
            stemGradient.addColorStop(1, `rgba(150, 80, 40, ${0.3 * fade})`);

            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.3, 0);
            ctx.lineTo(-this.radius * 0.2, -this.atomicMushroomHeight * 0.7);
            ctx.lineTo(this.radius * 0.2, -this.atomicMushroomHeight * 0.7);
            ctx.lineTo(this.radius * 0.3, 0);
            ctx.fillStyle = stemGradient;
            ctx.fill();

            // Mushroom cap
            ctx.beginPath();
            ctx.ellipse(0, -this.atomicMushroomHeight * 0.8, this.radius * 0.8, this.radius * 0.4, 0, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 80, 40, ${0.5 * fade})`;
            ctx.fill();
        }

        ctx.restore();
    }
}

// ============================================
// EVOLVED PHANTOM SLASH - DIMENSIONAL BLADE
// Slashes create dimensional rift zones
// ============================================

export class DimensionalRiftZone extends Zone {
    private rotationAngle: number = 0;
    private pulsePhase: number = 0;

    constructor(x: number, y: number, damage: number) {
        super(x, y, 60, 1.5, damage, 0.3, ''); // 60 radius, 1.5s duration
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt);
        this.rotationAngle += dt * 3;
        this.pulsePhase += dt * 5;

        // Slow enemies in rift (50% slow)
        if (enemies) {
            for (const enemy of enemies) {
                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < this.radius) {
                    (enemy as any).slowMultiplier = Math.min((enemy as any).slowMultiplier || 1, 0.5);
                    (enemy as any).slowDuration = 0.5;
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration);
        const pulse = 1 + Math.sin(this.pulsePhase) * 0.1;

        // Swirling rift effect
        ctx.rotate(this.rotationAngle);

        // Outer distortion rings
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * pulse * (0.6 + i * 0.2), 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(150, 50, 255, ${(0.4 - i * 0.1) * fade})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Central spiral
        ctx.beginPath();
        for (let angle = 0; angle < Math.PI * 4; angle += 0.1) {
            const r = (angle / (Math.PI * 4)) * this.radius * 0.8 * pulse;
            const x = Math.cos(angle) * r;
            const y = Math.sin(angle) * r;
            if (angle === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(200, 100, 255, ${0.6 * fade})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#aa00ff';
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Center portal
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.3);
        gradient.addColorStop(0, `rgba(100, 0, 200, ${0.8 * fade})`);
        gradient.addColorStop(1, `rgba(150, 50, 255, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Rift symbol
        ctx.font = `${24 * fade}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌀', 0, 0);

        ctx.restore();
    }
}

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

    update(dt: number, enemies?: Entity[]) {
        super.update(dt);
        this.rotationAngle += dt * 4;

        // Pull enemies toward center
        if (enemies) {
            for (const enemy of enemies) {
                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.radius * 1.5 && dist > 5) {
                    const pullForce = this.pullStrength / dist;
                    (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                    (enemy as any).pos.y += (dy / dist) * pullForce * dt;
                }
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

// ============================================
// EVOLVED MIND BLAST - PSYCHIC STORM
// Cascading explosions with strong stun
// ============================================

export class PsychicStormZone extends Zone {
    private wavePhase: number = 0;
    stunDuration: number;
    private hasStunned: Set<any> = new Set();

    constructor(x: number, y: number, radius: number, damage: number, stunDuration: number = 2.0, _onDamage?: (pos: Vector2, amount: number) => void) {
        super(x, y, radius, 0.8, damage, 0.1, '', 0);
        this.stunDuration = stunDuration;
        // Note: onDamage callback preserved for API compatibility but handled by Zone base class
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt);
        this.wavePhase += dt * 8;

        // Stun enemies in range (only once per enemy)
        if (enemies) {
            for (const enemy of enemies) {
                if (this.hasStunned.has(enemy)) continue;

                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.radius) {
                    (enemy as any).stunDuration = Math.max((enemy as any).stunDuration || 0, this.stunDuration);
                    this.hasStunned.add(enemy);
                    particles.emitHit(enemy.pos.x, enemy.pos.y, '#ff00ff');
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration / 0.4);

        // Expanding brain waves
        for (let i = 0; i < 4; i++) {
            const waveRadius = this.radius * (0.3 + i * 0.25) * (1 + Math.sin(this.wavePhase + i) * 0.1);
            ctx.beginPath();
            ctx.arc(0, 0, waveRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 100, 200, ${(0.6 - i * 0.12) * fade})`;
            ctx.lineWidth = 4 - i;
            ctx.stroke();
        }

        // Core psionic energy
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.4);
        gradient.addColorStop(0, `rgba(255, 150, 255, ${0.9 * fade})`);
        gradient.addColorStop(0.5, `rgba(200, 50, 200, ${0.6 * fade})`);
        gradient.addColorStop(1, `rgba(150, 0, 150, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#ff00ff';
        ctx.shadowBlur = 25 * fade;
        ctx.fill();

        // Brain emoji
        ctx.font = `${32 * fade}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🧠', 0, 0);

        ctx.restore();
    }
}

// ============================================
// EVOLVED FROST NOVA - ABSOLUTE ZERO
// Complete freeze (100% slow) with ice shards
// ============================================

export class AbsoluteZeroZone extends Zone {
    private crystalAngle: number = 0;
    private frozenEnemies: Set<any> = new Set();
    freezeDuration: number = 2.0;

    constructor(x: number, y: number, radius: number, damage: number, duration: number) {
        super(x, y, radius, duration, damage, 0.5, '');
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt);
        this.crystalAngle += dt;

        // Freeze enemies (100% slow)
        if (enemies) {
            for (const enemy of enemies) {
                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < this.radius) {
                    (enemy as any).slowMultiplier = 0; // Complete freeze
                    (enemy as any).slowDuration = 0.5;

                    if (!this.frozenEnemies.has(enemy)) {
                        this.frozenEnemies.add(enemy);
                        particles.emitFrost(enemy.pos.x, enemy.pos.y);
                    }
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration);

        // Ice floor
        const floorGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        floorGradient.addColorStop(0, `rgba(200, 240, 255, ${0.5 * fade})`);
        floorGradient.addColorStop(0.5, `rgba(100, 200, 255, ${0.3 * fade})`);
        floorGradient.addColorStop(1, `rgba(50, 150, 255, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = floorGradient;
        ctx.fill();

        // Ice crystals around edge
        ctx.rotate(this.crystalAngle);
        for (let i = 0; i < 8; i++) {
            ctx.rotate(Math.PI / 4);

            // Draw ice shard
            ctx.beginPath();
            ctx.moveTo(this.radius * 0.7, 0);
            ctx.lineTo(this.radius * 0.85, -8);
            ctx.lineTo(this.radius * 1.1, 0);
            ctx.lineTo(this.radius * 0.85, 8);
            ctx.closePath();
            ctx.fillStyle = `rgba(180, 230, 255, ${0.8 * fade})`;
            ctx.shadowColor = '#88ddff';
            ctx.shadowBlur = 10;
            ctx.fill();
        }
        ctx.rotate(-this.crystalAngle);

        // Center frost burst
        ctx.font = `${28 * fade}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('❄️', 0, 0);

        // Frost ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 220, 255, ${0.6 * fade})`;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#aaddff';
        ctx.shadowBlur = 15;
        ctx.stroke();

        ctx.restore();
    }
}


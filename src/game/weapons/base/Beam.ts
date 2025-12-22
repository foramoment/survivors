/**
 * BASE BEAM CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { Projectile } from './Projectile';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// BEAM - Simple visual beam (no collision)
// ============================================
export class Beam extends Projectile {
    start: Vector2;
    end: Vector2;
    color: string;
    width: number;

    constructor(start: Vector2, end: Vector2, duration: number, color: string, width: number) {
        super(start.x, start.y, { x: 0, y: 0 }, duration, 0, 0, '');
        this.canCollide = false;
        this.start = { ...start };
        this.end = { ...end };
        this.color = color;
        this.width = width;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);

        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.width * (this.duration * 5);
        ctx.lineCap = 'round';

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;

        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// VOID RAY BEAM - Charging beam weapon
// ============================================
export class VoidRayBeam extends Projectile {
    owner: any;
    target: any;
    stage: 'charge' | 'fire' | 'fade' = 'charge';
    timer: number = 0;
    chargeTime: number = 0.5;
    fireTime: number = 0.2;
    fadeTime: number = 0.3;
    width: number = 0;
    maxWidth: number = 20;
    color: string = '#bd00ff';
    isEvolved: boolean = false;
    damageDealt: boolean = false;
    onDamageCallback: (pos: Vector2, amount: number) => void;
    targetLastPos: Vector2;

    constructor(owner: any, target: any, damage: number, isEvolved: boolean, onDamage: (pos: Vector2, amount: number) => void) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, 2, damage, 0, '');
        this.owner = owner;
        this.target = target;
        this.onDamageCallback = onDamage;
        this.canCollide = false;
        this.isEvolved = isEvolved;
        this.targetLastPos = { x: target.pos.x, y: target.pos.y };
        if (isEvolved) {
            this.maxWidth = 50;
            this.color = '#ff00ff';
        }
    }

    update(dt: number) {
        this.timer += dt;

        if (this.target && !this.target.isDead) {
            this.targetLastPos = { x: this.target.pos.x, y: this.target.pos.y };
        }

        if (this.stage === 'charge') {
            if (this.timer >= this.chargeTime) {
                this.stage = 'fire';
                this.timer = 0;
                if (this.target && !this.target.isDead) {
                    // Use DamageSystem for consistent damage handling
                    damageSystem.dealRawDamage(this.target, this.damage, this.target.pos);
                    //particles.emitHit(this.target.pos.x, this.target.pos.y, this.color);
                }
            }
        } else if (this.stage === 'fire') {
            if (this.timer >= this.fireTime) {
                this.stage = 'fade';
                this.timer = 0;
            }
        } else if (this.stage === 'fade') {
            if (this.timer >= this.fadeTime) {
                this.isDead = true;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const start = this.owner.pos;
        const end = this.targetLastPos;

        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        if (this.stage === 'charge') {
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = `rgba(189, 0, 255, ${this.timer / this.chargeTime})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(start.x, start.y, 10 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 15;
            ctx.fill();

        } else if (this.stage === 'fire' || this.stage === 'fade') {
            let width = this.maxWidth;
            let alpha = 1;

            if (this.stage === 'fade') {
                alpha = 1 - (this.timer / this.fadeTime);
                width *= alpha;
            }

            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.shadowColor = this.color;
            ctx.shadowBlur = 20;
            ctx.globalAlpha = alpha;
            ctx.stroke();

            ctx.strokeStyle = 'white';
            ctx.lineWidth = width * 0.3;
            ctx.stroke();
        }

        ctx.restore();
    }
}

// ============================================
// CHAIN LIGHTNING - Bouncing beam
// ============================================
export class ChainLightning extends Projectile {
    bounces: number;
    timer: number = 0;
    interval: number = 0.1;
    currentPos: Vector2;
    segments: { start: Vector2, end: Vector2, alpha: number }[] = [];
    hitEnemies: Set<any> = new Set();
    range: number = 400;
    maxChainLength: number;
    totalChainLength: number = 0;
    initialDamage: number;

    onHit: (target: any, damage: number) => void = () => { };

    constructor(x: number, y: number, damage: number, bounces: number, maxChainLength: number = 800) {
        super(x, y, { x: 0, y: 0 }, 10, damage, 0, '');
        this.canCollide = false;
        this.currentPos = { x, y };
        this.bounces = bounces;
        this.maxChainLength = maxChainLength;
        this.initialDamage = damage;
    }

    hasChained: boolean = false;

    // Override to chain to enemy (can be extended in evolved versions)
    chainToEnemy(_enemy: any, _currentBounces: number) {
        // Base implementation does nothing - evolved versions can override
    }

    update(dt: number) {
        this.segments.forEach(s => s.alpha -= dt * 5);
        this.segments = this.segments.filter(s => s.alpha > 0);

        if (!this.hasChained) {
            this.hasChained = true;

            let currentBounces = this.bounces;

            while (currentBounces > 0) {
                let target: any = null;
                let minDst = this.range;

                // Use spatial hash for O(1) lookup
                const nearby = levelSpatialHash.getWithinRadius(this.currentPos, this.range);

                for (const enemy of nearby) {
                    if (this.hitEnemies.has(enemy)) continue;

                    const d = distance(this.currentPos, enemy.pos);
                    if (d < minDst) {
                        minDst = d;
                        target = enemy;
                    }
                }

                if (target) {
                    const chainSegmentLength = distance(this.currentPos, target.pos);
                    if (this.totalChainLength + chainSegmentLength > this.maxChainLength) break;

                    this.totalChainLength += chainSegmentLength;
                    this.hitEnemies.add(target);

                    const totalBounces = this.segments.length;
                    const damageMultiplier = Math.pow(0.85, totalBounces);
                    const currentDamage = this.initialDamage * damageMultiplier;

                    this.onHit(target, currentDamage);

                    this.segments.push({
                        start: { ...this.currentPos },
                        end: { ...target.pos },
                        alpha: 1.0
                    });

                    this.currentPos = { ...target.pos };
                    currentBounces--;
                } else {
                    break;
                }
            }
        }

        if (this.hasChained && this.segments.length === 0) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const seg of this.segments) {
            this.drawLightningBolt(ctx, seg.start, seg.end, seg.alpha);
        }

        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    protected drawLightningBolt(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2, alpha: number) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5 || !isFinite(dist) || !isFinite(alpha) || alpha <= 0) return;

        ctx.save();

        const numSegments = Math.min(15, Math.max(4, Math.floor(dist / 30)));
        const points: Vector2[] = [{ x: start.x, y: start.y }];

        const perpX = -dy / dist;
        const perpY = dx / dist;

        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const baseX = start.x + dx * t;
            const baseY = start.y + dy * t;

            const offset = (Math.random() - 0.5) * 25 * (1 - Math.abs(t - 0.5) * 1.5);
            points.push({
                x: baseX + perpX * offset,
                y: baseY + perpY * offset
            });
        }
        points.push({ x: end.x, y: end.y });

        // Glow layer
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(100, 200, 255, ${alpha * 0.3})`;
        ctx.lineWidth = 10;
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.stroke();

        // Main bolt
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(150, 230, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.stroke();

        // Bright core
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 5;
        ctx.stroke();

        // Small branches
        if (alpha > 0.4 && dist > 40) {
            for (let i = 2; i < points.length - 1; i += 2) {
                if (Math.random() > 0.6) {
                    const branchAngle = (Math.random() - 0.5) * Math.PI * 0.5;
                    const branchLen = 10 + Math.random() * 20;
                    const angle = Math.atan2(dy, dx) + branchAngle;

                    ctx.beginPath();
                    ctx.moveTo(points[i].x, points[i].y);
                    ctx.lineTo(
                        points[i].x + Math.cos(angle) * branchLen,
                        points[i].y + Math.sin(angle) * branchLen
                    );
                    ctx.strokeStyle = `rgba(150, 230, 255, ${alpha * 0.4})`;
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 3;
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }
}

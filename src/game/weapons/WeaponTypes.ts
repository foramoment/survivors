import { Weapon } from '../Weapon';
import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import { particles } from '../core/ParticleSystem';

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

    update(dt: number, _enemies?: Entity[]) {
        this.pos.x += this.velocity.x * dt;
        this.pos.y += this.velocity.y * dt;
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
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
}


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
        const speed = Math.sqrt(this.velocity.x ** 2 + this.velocity.y ** 2);
        this.velocity = { x: dir.x * speed, y: dir.y * speed };
        this.bouncesLeft--;
    }
}

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
        ctx.lineWidth = this.width * (this.duration * 5); // Fade out width
        ctx.lineCap = 'round';

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;

        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// === SPECIALIZED PROJECTILES ===

export class SingularityProjectile extends Projectile {
    private particleTimer: number = 0;
    private rotation: number = 0;
    pullStrength: number = 80;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 20;
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt, enemies);
        this.rotation += dt * 3;

        // Emit particles
        this.particleTimer += dt;
        if (this.particleTimer > 0.08) {
            this.particleTimer = 0;
            particles.emitSingularityDistortion(this.pos.x, this.pos.y, this.radius);
        }

        // Pull enemies toward singularity
        if (enemies) {
            for (const enemy of enemies) {
                const dx = this.pos.x - enemy.pos.x;
                const dy = this.pos.y - enemy.pos.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 200 && dist > 5) {
                    const pullForce = this.pullStrength / dist;
                    (enemy as any).pos.x += (dx / dist) * pullForce * dt;
                    (enemy as any).pos.y += (dy / dist) * pullForce * dt;
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Outer distortion ring
        ctx.strokeStyle = 'rgba(100, 0, 200, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2, 0, Math.PI * 2);
        ctx.stroke();

        // Swirling effect
        ctx.rotate(this.rotation);
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.arc(this.radius * 0.5, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 50, 255, 0.6)`;
            ctx.fill();
        }
        ctx.rotate(-this.rotation);

        // Inner dark core
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

        // Event horizon ring
        ctx.strokeStyle = 'rgba(255, 200, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

export class PlasmaProjectile extends Projectile {
    private particleTimer: number = 0;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 15;
    }

    update(dt: number, enemies?: Entity[]) {
        super.update(dt, enemies);

        // Emit plasma trail
        this.particleTimer += dt;
        if (this.particleTimer > 0.05) {
            this.particleTimer = 0;
            particles.emitPlasmaEnergy(this.pos.x, this.pos.y);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Outer glow
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        ctx.fill();

        // Plasma core
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(200, 255, 200, 1)');
        gradient.addColorStop(0.4, 'rgba(100, 255, 100, 0.9)');
        gradient.addColorStop(1, 'rgba(0, 200, 50, 0.5)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Energy sparks
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

    update(dt: number, _enemies?: any[]) {
        this.timer += dt;

        // Update target last known position
        if (this.target && !this.target.isDead) {
            this.targetLastPos = { x: this.target.pos.x, y: this.target.pos.y };
        }

        if (this.stage === 'charge') {
            if (this.timer >= this.chargeTime) {
                this.stage = 'fire';
                this.timer = 0;
                // Deal damage at start of fire
                if (this.target && !this.target.isDead) {
                    this.target.takeDamage(this.damage);
                    this.onDamageCallback(this.target.pos, this.damage);
                    particles.emitHit(this.target.pos.x, this.target.pos.y, this.color);
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
            // Charging line
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(end.x, end.y);
            ctx.strokeStyle = `rgba(189, 0, 255, ${this.timer / this.chargeTime})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]); // Reset dash

            // Charge gathering at player
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

            // Core
            ctx.strokeStyle = 'white';
            ctx.lineWidth = width * 0.3;
            ctx.stroke();
        }

        ctx.restore();
    }
}

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

    update(dt: number, enemies?: Entity[]) {
        this.segments.forEach(s => s.alpha -= dt * 5);
        this.segments = this.segments.filter(s => s.alpha > 0);

        if (!this.hasChained && enemies) {
            this.hasChained = true;

            // Instant chain logic
            let currentBounces = this.bounces;

            while (currentBounces > 0) {
                let target: any = null;
                let minDst = this.range;

                for (const enemy of enemies) {
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
                    const damageMultiplier = Math.pow(0.85, totalBounces); // Less reduction (was 0.7)
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

        // Reset all styles
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    private drawLightningBolt(ctx: CanvasRenderingContext2D, start: Vector2, end: Vector2, alpha: number) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Safety checks
        if (dist < 5 || !isFinite(dist) || !isFinite(alpha) || alpha <= 0) return;

        ctx.save();

        // Generate zigzag points
        const numSegments = Math.min(15, Math.max(4, Math.floor(dist / 30)));
        const points: Vector2[] = [{ x: start.x, y: start.y }];

        const perpX = -dy / dist;
        const perpY = dx / dist;

        for (let i = 1; i < numSegments; i++) {
            const t = i / numSegments;
            const baseX = start.x + dx * t;
            const baseY = start.y + dy * t;

            // Random offset perpendicular to line
            const offset = (Math.random() - 0.5) * 25 * (1 - Math.abs(t - 0.5) * 1.5);
            points.push({
                x: baseX + perpX * offset,
                y: baseY + perpY * offset
            });
        }
        points.push({ x: end.x, y: end.y });

        // Draw glow layer
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

        // Draw main bolt
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(150, 230, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 10;
        ctx.stroke();

        // Draw bright core
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 5;
        ctx.stroke();

        // Draw small branches
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

export abstract class ProjectileWeapon extends Weapon {
    abstract projectileEmoji: string;
    abstract pierce: number;

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            let target: Entity | null = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < this.area * (this.owner as any).stats.area && dst < minDst) {
                    minDst = dst;
                    target = enemy;

                }
            }

            if (target) {
                this.fire(target);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    fire(target: Entity) {
        const dir = normalize({
            x: target.pos.x - this.owner.pos.x,
            y: target.pos.y - this.owner.pos.y
        });

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        const { damage } = (this.owner as any).getDamage(this.damage);

        const proj = new Projectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            damage,
            this.pierce,
            this.projectileEmoji
        );

        this.onSpawn(proj);
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

export class Zone extends Entity {
    duration: number;
    damage: number;
    interval: number;
    timer: number = 0;
    emoji: string;
    slowEffect: number = 0;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, emoji: string, slowEffect: number = 0) {
        super(x, y, radius);
        this.duration = duration;
        this.damage = damage;
        this.interval = interval;
        this.emoji = emoji;
        this.slowEffect = slowEffect;
    }

    update(dt: number) {
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;

        this.timer += dt;
    }

    onOverlap(enemy: any) {
        if (this.slowEffect > 0) {
            enemy.speedMultiplier = Math.max(0.1, 1 - this.slowEffect);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        if (this.slowEffect > 0) {
            ctx.fillStyle = '#0088ff'; // Blue for slow
        } else {
            ctx.fillStyle = '#00ffff';
        }
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }
}

// === SPECIALIZED ZONES WITH PARTICLE EFFECTS ===

export class FrostZone extends Zone {
    private particleTimer: number = 0;
    private iceShards: { x: number; y: number; angle: number; size: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, slowEffect: number = 0.5) {
        super(x, y, radius, duration, damage, interval, '', slowEffect);
        // Generate ice shards
        for (let i = 0; i < 8; i++) {
            this.iceShards.push({
                x: (Math.random() - 0.5) * radius * 1.5,
                y: (Math.random() - 0.5) * radius * 1.5,
                angle: Math.random() * Math.PI * 2,
                size: 5 + Math.random() * 10
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.particleTimer += dt;
        if (this.particleTimer > 0.1) {
            this.particleTimer = 0;
            particles.emitColdMist(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Icy gradient background
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.4)');
        gradient.addColorStop(0.7, 'rgba(150, 220, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(200, 240, 255, 0.05)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Frost edge
        ctx.strokeStyle = 'rgba(200, 240, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Ice shards
        ctx.fillStyle = 'rgba(200, 240, 255, 0.7)';
        for (const shard of this.iceShards) {
            ctx.save();
            ctx.translate(shard.x, shard.y);
            ctx.rotate(shard.angle);
            ctx.beginPath();
            ctx.moveTo(0, -shard.size);
            ctx.lineTo(shard.size * 0.3, shard.size * 0.5);
            ctx.lineTo(-shard.size * 0.3, shard.size * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }
}

export class AcidZone extends Zone {
    private particleTimer: number = 0;
    private bubbles: { x: number; y: number; size: number; speed: number; offset: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        // Generate initial bubbles
        for (let i = 0; i < 12; i++) {
            this.bubbles.push({
                x: (Math.random() - 0.5) * radius * 1.6,
                y: (Math.random() - 0.5) * radius * 1.6,
                size: 3 + Math.random() * 6,
                speed: 20 + Math.random() * 30,
                offset: Math.random() * Math.PI * 2
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        // Animate bubbles
        for (const bubble of this.bubbles) {
            bubble.y -= bubble.speed * dt;
            if (bubble.y < -this.radius) {
                bubble.y = this.radius * 0.8;
                bubble.x = (Math.random() - 0.5) * this.radius * 1.6;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.15) {
            this.particleTimer = 0;
            particles.emitAcidBubble(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Toxic gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(0, 255, 0, 0.5)');
        gradient.addColorStop(0.5, 'rgba(50, 200, 0, 0.35)');
        gradient.addColorStop(1, 'rgba(100, 150, 0, 0.1)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Bubbling edge
        ctx.strokeStyle = 'rgba(100, 255, 50, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw bubbles
        for (const bubble of this.bubbles) {
            const dist = Math.sqrt(bubble.x * bubble.x + bubble.y * bubble.y);
            if (dist < this.radius) {
                ctx.beginPath();
                ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(150, 255, 100, ${0.3 + Math.sin(Date.now() / 200 + bubble.offset) * 0.2})`;
                ctx.fill();
                ctx.strokeStyle = 'rgba(100, 255, 50, 0.5)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

export class SporeZone extends Zone {
    private particleTimer: number = 0;
    private spores: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval, '', 0);
        // Generate floating spores
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.9;
            this.spores.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20 - 10,
                size: 2 + Math.random() * 4,
                alpha: 0.3 + Math.random() * 0.5
            });
        }
    }

    update(dt: number) {
        super.update(dt);

        // Animate spores
        for (const spore of this.spores) {
            spore.x += spore.vx * dt;
            spore.y += spore.vy * dt;

            // Wrap around
            const dist = Math.sqrt(spore.x * spore.x + spore.y * spore.y);
            if (dist > this.radius) {
                const angle = Math.random() * Math.PI * 2;
                spore.x = Math.cos(angle) * this.radius * 0.5;
                spore.y = Math.sin(angle) * this.radius * 0.5;
            }
        }

        this.particleTimer += dt;
        if (this.particleTimer > 0.2) {
            this.particleTimer = 0;
            particles.emitSporeCloud(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Murky cloud gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(100, 80, 40, 0.4)');
        gradient.addColorStop(0.6, 'rgba(80, 60, 30, 0.25)');
        gradient.addColorStop(1, 'rgba(60, 40, 20, 0.05)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw floating spores
        for (const spore of this.spores) {
            ctx.beginPath();
            ctx.arc(spore.x, spore.y, spore.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 120, 60, ${spore.alpha})`;
            ctx.fill();
        }

        ctx.restore();
    }
}

export class NanobotCloud extends Zone {
    private particleTimer: number = 0;
    owner: any;

    constructor(owner: any, radius: number, duration: number, damage: number, interval: number) {
        super(owner.pos.x, owner.pos.y, radius, duration, damage, interval, '', 0);
        this.owner = owner;
    }

    update(dt: number) {
        // Follow owner
        this.pos.x = this.owner.pos.x;
        this.pos.y = this.owner.pos.y;

        super.update(dt);

        // Emit nanobot particles
        this.particleTimer += dt;
        if (this.particleTimer > 0.05) {
            this.particleTimer = 0;
            particles.emitNanoSwarm(this.pos.x, this.pos.y, this.radius);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Outer shimmer ring
        const time = Date.now() / 500;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + Math.sin(time) * 0.1})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Inner field
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(0, 200, 200, 0.15)');
        gradient.addColorStop(0.7, 'rgba(0, 150, 150, 0.08)');
        gradient.addColorStop(1, 'rgba(0, 100, 100, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Tiny nanobot dots (static visual)
        ctx.fillStyle = 'rgba(0, 255, 200, 0.6)';
        for (let i = 0; i < 12; i++) {
            const angle = time * 0.5 + i * Math.PI / 6;
            const dist = this.radius * 0.3 + Math.sin(time * 2 + i) * 10;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
}

export abstract class ZoneWeapon extends Weapon {
    abstract zoneEmoji: string;
    abstract interval: number;

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            this.spawnZone();
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    spawnZone() {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const baseInterval = Math.max(0.1, this.interval - (this.owner as any).stats.tick);
        const boostedInterval = baseInterval / speedBoost;

        const { damage } = (this.owner as any).getDamage(this.damage);

        const zone = new Zone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * (this.owner as any).stats.area,
            this.duration * (this.owner as any).stats.duration,
            damage,
            Math.max(0.01, boostedInterval), // Minimum 0.01s interval
            this.zoneEmoji
        );
        this.onSpawn(zone);
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
        this.area *= 1.1;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

export class OrbitingProjectile extends Projectile {
    angle: number = 0;
    distance: number;
    speed: number;
    owner: any;

    constructor(owner: any, distance: number, speed: number, duration: number, damage: number, emoji: string) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, duration, damage, 999, emoji); // High pierce
        this.owner = owner;
        this.distance = distance;
        this.speed = speed;
        this.canCollide = true;
    }

    update(dt: number, _enemies?: Entity[]) {
        this.angle += this.speed * dt;
        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * this.distance;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * this.distance;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

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
        this.canCollide = false; // Don't hit things while flying
    }

    update(dt: number, _enemies?: Entity[]) {
        this.duration -= dt;
        const t = 1 - (this.duration / this.totalDuration);

        if (t >= 1) {
            this.isDead = true;
            this.onLand(this.targetPos.x, this.targetPos.y);
            return;
        }

        // Linear interpolation for position
        this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * t;
        this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * t;

        // Parabolic arc for visual height (y-offset)
        // 4 * h * t * (1-t) gives a parabola starting at 0, peaking at h at t=0.5, and ending at 0 at t=1
        const yOffset = 4 * this.height * t * (1 - t);
        this.pos.y -= yOffset;
    }
}

export class DelayedExplosionZone extends Zone {
    delay: number;
    initialDelay: number;
    exploded: boolean = false;
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    isAtomic: boolean = false;

    // Animation state
    private beamWidth: number = 0;
    private flashAlpha: number = 0;
    private shockwaveRadius: number = 0;
    private shockwaveAlpha: number = 0;
    private particlesEmitted: boolean = false;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, emoji: string, onDamage?: (pos: Vector2, amount: number) => void, isAtomic: boolean = false) {
        // extend Zone: duration, damage, interval, emoji
        // Set interval to Infinity so GameManager doesn't apply tick damage
        super(x, y, radius, delay + 0.8, damage, Number.MAX_VALUE, emoji);
        this.delay = delay;
        this.initialDelay = delay;
        this.onDamageCallback = onDamage;
        this.isAtomic = isAtomic;
    }

    update(dt: number, enemies?: Entity[]) {
        if (this.exploded) {
            // Post-explosion animation
            this.shockwaveRadius += dt * this.radius * 4;
            this.shockwaveAlpha -= dt * 2;
            this.flashAlpha -= dt * 4;

            if (this.shockwaveAlpha <= 0 && this.flashAlpha <= 0) {
                this.isDead = true;
            }
            return;
        }

        this.delay -= dt;

        // Beam animation during charge-up
        const progress = 1 - (this.delay / this.initialDelay);
        this.beamWidth = progress * (this.isAtomic ? 40 : 15);

        if (this.delay <= 0) {
            this.explode(enemies);
            this.exploded = true;
            this.flashAlpha = 1;
            this.shockwaveAlpha = 1;
            this.shockwaveRadius = 0;
        }
    }

    explode(enemies?: Entity[]) {
        if (!enemies) return;

        // Emit particles
        if (!this.particlesEmitted) {
            this.particlesEmitted = true;
            if (this.isAtomic) {
                particles.emitNuclear(this.pos.x, this.pos.y, this.radius);
            } else {
                particles.emitOrbitalStrike(this.pos.x, this.pos.y, this.radius);
            }
        }

        // Deal damage to all enemies in range
        for (const enemy of enemies) {
            if (distance(this.pos, enemy.pos) <= this.radius) {
                (enemy as any).takeDamage(this.damage);
                if (this.onDamageCallback) {
                    this.onDamageCallback(enemy.pos, this.damage);
                }
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (!this.exploded) {
            const progress = 1 - (this.delay / this.initialDelay);

            // === TARGETING PHASE ===

            // Outer target ring (rotating dashed)
            ctx.save();
            ctx.rotate(Date.now() / 500);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = this.isAtomic ? `rgba(255, 200, 0, ${0.5 + Math.sin(Date.now() / 100) * 0.2})` : `rgba(255, 100, 0, ${0.4 + progress * 0.4})`;
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.stroke();
            ctx.restore();

            // Inner targeting circle (filling up)
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            const fillGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            if (this.isAtomic) {
                fillGradient.addColorStop(0, `rgba(255, 255, 100, ${0.4 * progress})`);
                fillGradient.addColorStop(0.5, `rgba(255, 150, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            } else {
                fillGradient.addColorStop(0, `rgba(255, 100, 0, ${0.3 * progress})`);
                fillGradient.addColorStop(1, `rgba(255, 50, 0, ${0.1 * progress})`);
            }
            ctx.fillStyle = fillGradient;
            ctx.fill();

            // Crosshair lines
            const crosshairLength = this.radius * 0.3;
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + progress * 0.4})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            // Four crosshair segments
            ctx.moveTo(-crosshairLength, 0); ctx.lineTo(-crosshairLength * 0.3, 0);
            ctx.moveTo(crosshairLength * 0.3, 0); ctx.lineTo(crosshairLength, 0);
            ctx.moveTo(0, -crosshairLength); ctx.lineTo(0, -crosshairLength * 0.3);
            ctx.moveTo(0, crosshairLength * 0.3); ctx.lineTo(0, crosshairLength);
            ctx.stroke();

            // Center dot
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + Math.sin(Date.now() / 50) * 0.2})`;
            ctx.fill();

            // === BEAM FROM SPACE ===
            const beamHeight = 800;
            const beamStartY = -beamHeight;

            // Beam glow (outer)
            const beamGlowWidth = this.beamWidth * 3;
            if (beamGlowWidth > 0) {
                const glowGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    glowGradient.addColorStop(0, `rgba(255, 255, 100, 0)`);
                    glowGradient.addColorStop(0.3, `rgba(255, 200, 0, ${0.2 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 150, 0, ${0.5 * progress})`);
                } else {
                    glowGradient.addColorStop(0, `rgba(255, 150, 50, 0)`);
                    glowGradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.15 * progress})`);
                    glowGradient.addColorStop(1, `rgba(255, 80, 0, ${0.4 * progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth / 2, beamStartY);
                ctx.lineTo(beamGlowWidth * 1.5, 0);
                ctx.lineTo(-beamGlowWidth * 1.5, 0);
                ctx.closePath();
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }

            // Main beam (core)
            if (this.beamWidth > 0) {
                const coreGradient = ctx.createLinearGradient(0, beamStartY, 0, 0);
                if (this.isAtomic) {
                    coreGradient.addColorStop(0, `rgba(255, 255, 255, 0.1)`);
                    coreGradient.addColorStop(0.5, `rgba(255, 255, 200, ${progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 255, 150, ${progress})`);
                } else {
                    coreGradient.addColorStop(0, `rgba(255, 200, 100, 0.1)`);
                    coreGradient.addColorStop(0.7, `rgba(255, 150, 50, ${0.8 * progress})`);
                    coreGradient.addColorStop(1, `rgba(255, 200, 100, ${progress})`);
                }

                ctx.beginPath();
                ctx.moveTo(-this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth / 4, beamStartY);
                ctx.lineTo(this.beamWidth, 0);
                ctx.lineTo(-this.beamWidth, 0);
                ctx.closePath();
                ctx.fillStyle = coreGradient;
                ctx.fill();

                // Sparkle effect at impact point
                if (progress > 0.5) {
                    const sparkleAlpha = (progress - 0.5) * 2;
                    ctx.shadowColor = this.isAtomic ? '#ffff00' : '#ff6600';
                    ctx.shadowBlur = 30 * sparkleAlpha;
                    ctx.beginPath();
                    ctx.arc(0, 0, 10 + Math.random() * 5, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${sparkleAlpha})`;
                    ctx.fill();
                    ctx.shadowBlur = 0;
                }
            }

            // Warning text for atomic
            if (this.isAtomic && progress > 0.3) {
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                ctx.fillStyle = `rgba(255, 200, 0, ${Math.sin(Date.now() / 100) * 0.5 + 0.5})`;
                ctx.fillText('☢️ NUCLEAR STRIKE INCOMING ☢️', 0, -this.radius - 30);
            }

        } else {
            // === EXPLOSION PHASE ===

            // White flash
            if (this.flashAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`;
                ctx.fill();
            }

            // Shockwave ring
            if (this.shockwaveAlpha > 0) {
                ctx.beginPath();
                ctx.arc(0, 0, this.shockwaveRadius, 0, Math.PI * 2);

                if (this.isAtomic) {
                    ctx.strokeStyle = `rgba(255, 200, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 20;
                } else {
                    ctx.strokeStyle = `rgba(255, 100, 0, ${this.shockwaveAlpha})`;
                    ctx.lineWidth = 10;
                }

                ctx.shadowColor = this.isAtomic ? '#ffcc00' : '#ff6600';
                ctx.shadowBlur = 20;
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Inner explosion glow
            if (this.flashAlpha > 0.3) {
                ctx.beginPath();
                ctx.arc(0, 0, this.radius * (1 - this.flashAlpha * 0.3), 0, Math.PI * 2);
                const explosionGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
                if (this.isAtomic) {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.3, `rgba(255, 200, 0, ${this.flashAlpha * 0.8})`);
                    explosionGradient.addColorStop(0.6, `rgba(255, 100, 0, ${this.flashAlpha * 0.5})`);
                    explosionGradient.addColorStop(1, `rgba(200, 50, 0, 0)`);
                } else {
                    explosionGradient.addColorStop(0, `rgba(255, 255, 200, ${this.flashAlpha})`);
                    explosionGradient.addColorStop(0.5, `rgba(255, 150, 50, ${this.flashAlpha * 0.6})`);
                    explosionGradient.addColorStop(1, `rgba(255, 80, 0, 0)`);
                }
                ctx.fillStyle = explosionGradient;
                ctx.fill();
            }

            // Emoji overlay
            if (this.flashAlpha > 0.5) {
                ctx.font = `${this.radius * 1.5}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.globalAlpha = this.flashAlpha;
                ctx.fillText(this.emoji, 0, 0);
            }

            // Atomic mushroom cloud effect
            if (this.isAtomic && this.flashAlpha > 0.1) {
                const cloudProgress = 1 - this.flashAlpha;
                const stemHeight = this.radius * 0.8 * cloudProgress;
                const capRadius = this.radius * 0.6 * cloudProgress;

                // Stem
                ctx.fillStyle = `rgba(200, 100, 0, ${this.flashAlpha * 0.7})`;
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                ctx.lineTo(20, 0);
                ctx.lineTo(30, -stemHeight);
                ctx.lineTo(-30, -stemHeight);
                ctx.closePath();
                ctx.fill();

                // Cap
                ctx.beginPath();
                ctx.arc(0, -stemHeight - capRadius * 0.3, capRadius, 0, Math.PI * 2);
                const capGradient = ctx.createRadialGradient(0, -stemHeight - capRadius * 0.3, 0, 0, -stemHeight - capRadius * 0.3, capRadius);
                capGradient.addColorStop(0, `rgba(255, 200, 100, ${this.flashAlpha * 0.8})`);
                capGradient.addColorStop(0.5, `rgba(255, 100, 0, ${this.flashAlpha * 0.6})`);
                capGradient.addColorStop(1, `rgba(100, 50, 0, ${this.flashAlpha * 0.3})`);
                ctx.fillStyle = capGradient;
                ctx.fill();
            }
        }

        ctx.restore();
    }
}

export class DroneEntity extends Entity {
    owner: any;
    offset: Vector2 = { x: 50, y: -50 };
    canCollide: boolean = false;

    constructor(owner: any) {
        super(owner.pos.x, owner.pos.y, 10);
        this.owner = owner;
        this.canCollide = false;
    }

    update(dt: number, _enemies?: Entity[]) {
        // Follow owner with smooth lerp
        const targetX = this.owner.pos.x + this.offset.x;
        const targetY = this.owner.pos.y + this.offset.y;

        this.pos.x += (targetX - this.pos.x) * 5 * dt;
        this.pos.y += (targetY - this.pos.y) * 5 * dt;

        // Bobbing motion
        this.offset.y = -50 + Math.sin(Date.now() / 500) * 10;
        this.offset.x = 50 + Math.cos(Date.now() / 700) * 10;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛸', 0, 0);
        ctx.restore();
    }
}

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
        this.rotationSpeed = 2; // radians per second
        this.canCollide = true;
    }

    update(dt: number, _enemies?: Entity[]) {
        this.angle += this.rotationSpeed * dt;

        // Swirling motion: radius expands and contracts slightly
        const currentDist = this.distance + Math.sin(Date.now() / 200) * 20;

        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * currentDist;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * currentDist;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

export class MindBlastZone extends Zone {
    stage: 'warning' | 'charge' | 'blast' | 'fade' = 'warning';
    stageTimer: number = 0;
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    stunDuration: number = 0;
    private rings: { radius: number; alpha: number }[] = [];
    private chargeParticleTimer: number = 0;
    private blastTriggered: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number, onDamage?: (pos: Vector2, amount: number) => void, stunDuration: number = 0) {
        super(x, y, radius, 2.5, damage, 999, ''); // No emoji
        this.interval = 999;
        this.onDamageCallback = onDamage;
        this.stunDuration = stunDuration;
    }

    update(dt: number, enemies?: Entity[]) {
        this.stageTimer += dt;

        // Update rings
        for (let i = this.rings.length - 1; i >= 0; i--) {
            this.rings[i].radius += 200 * dt;
            this.rings[i].alpha -= dt * 2;
            if (this.rings[i].alpha <= 0) this.rings.splice(i, 1);
        }

        if (this.stage === 'warning' && this.stageTimer > 0.5) {
            this.stage = 'charge';
        } else if (this.stage === 'charge') {
            // Emit charging particles
            this.chargeParticleTimer += dt;
            if (this.chargeParticleTimer > 0.05) {
                this.chargeParticleTimer = 0;
                particles.emitPsionicCharge(this.pos.x, this.pos.y);
            }

            if (this.stageTimer > 1.0) {
                this.stage = 'blast';
                // Emit psionic wave
                particles.emitPsionicWave(this.pos.x, this.pos.y, this.radius);
                // Create expanding rings
                for (let i = 0; i < 3; i++) {
                    this.rings.push({ radius: 10 + i * 20, alpha: 1.0 });
                }
            }
        } else if (this.stage === 'blast') {
            if (!this.blastTriggered) {
                this.blastTriggered = true;
                // Deal damage once at blast start
                if (enemies) {
                    enemies.forEach(e => {
                        if (distance(this.pos, e.pos) <= this.radius) {
                            (e as any).takeDamage(this.damage);
                            if (this.onDamageCallback) this.onDamageCallback(e.pos, this.damage);
                            particles.emitHit(e.pos.x, e.pos.y, '#ff00ff');

                            if (this.stunDuration > 0) {
                                (e as any).stunTimer = this.stunDuration;
                            }
                        }
                    });
                }
            }

            if (this.stageTimer > 1.8) {
                this.stage = 'fade';
            }
        } else if (this.stage === 'fade' && this.stageTimer > 2.3) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (this.stage === 'warning') {
            // Pulsing warning circle
            const pulse = Math.sin(this.stageTimer * 10) * 0.2 + 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 255, ${pulse})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Center point
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 100, 255, 0.8)';
            ctx.fill();

        } else if (this.stage === 'charge') {
            // Charging effect - gathering energy
            const progress = (this.stageTimer - 0.5) / 0.5;

            // Inner glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * progress);
            gradient.addColorStop(0, 'rgba(255, 100, 255, 0.6)');
            gradient.addColorStop(0.5, 'rgba(200, 0, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(150, 0, 200, 0.1)');

            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Spinning energy lines
            ctx.strokeStyle = 'rgba(255, 150, 255, 0.6)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) {
                const angle = (this.stageTimer * 3 + i * Math.PI / 3);
                const len = this.radius * progress * 0.8;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
                ctx.stroke();
            }

        } else if (this.stage === 'blast' || this.stage === 'fade') {
            const fadeAlpha = this.stage === 'fade' ? Math.max(0, 1 - (this.stageTimer - 1.8) / 0.5) : 1;

            // Expanding rings
            for (const ring of this.rings) {
                ctx.beginPath();
                ctx.arc(0, 0, ring.radius, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 100, 255, ${ring.alpha * fadeAlpha})`;
                ctx.lineWidth = 4;
                ctx.shadowColor = '#ff00ff';
                ctx.shadowBlur = 15;
                ctx.stroke();
            }

            // Core explosion
            const coreSize = this.radius * 0.6 * fadeAlpha;
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
            gradient.addColorStop(0, `rgba(255, 255, 255, ${0.8 * fadeAlpha})`);
            gradient.addColorStop(0.3, `rgba(255, 100, 255, ${0.6 * fadeAlpha})`);
            gradient.addColorStop(1, `rgba(150, 0, 200, 0)`);

            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}


import { Weapon } from '../Weapon';
import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';

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

export class ExplodingProjectile extends Projectile {
    explosionRadius: number;
    explosionDamage: number;
    onExplode: (x: number, y: number, radius: number, damage: number) => void = () => { };

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number, emoji: string, explosionRadius: number, explosionDamage: number) {
        super(x, y, velocity, duration, damage, pierce, emoji);
        this.explosionRadius = explosionRadius;
        this.explosionDamage = explosionDamage;
    }

    onHit() {
        this.onExplode(this.pos.x, this.pos.y, this.explosionRadius, this.explosionDamage);
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
        ctx.lineWidth = this.width * (this.duration * 5);
        ctx.lineCap = 'round';

        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;

        ctx.stroke();
        ctx.shadowBlur = 0;
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

    update(dt: number, enemies?: Entity[]) {
        this.segments.forEach(s => s.alpha -= dt * 5);
        this.segments = this.segments.filter(s => s.alpha > 0);

        this.timer -= dt;

        if (this.timer <= 0 && this.bounces > 0 && enemies) {
            let target: any = null;
            let minDst = this.range;

            for (const enemy of enemies) {
                if (this.hitEnemies.has(enemy)) continue; // Each enemy can only be hit once

                const d = distance(this.currentPos, enemy.pos);
                if (d < minDst) {
                    minDst = d;
                    target = enemy;
                }
            }

            if (target) {
                // Check if adding this chain would exceed max length
                const chainSegmentLength = distance(this.currentPos, target.pos);
                if (this.totalChainLength + chainSegmentLength > this.maxChainLength) {
                    // Stop chaining - exceeded max length
                    if (this.segments.length === 0) this.isDead = true;
                    return;
                }

                this.totalChainLength += chainSegmentLength;
                this.hitEnemies.add(target);

                // Reduce damage by 30% per bounce
                // bounceNumber represents how many bounces have already occurred (0 for first bounce, 1 for second, etc.)
                const totalBounces = this.segments.length; // Number of bounces that have already happened
                const damageMultiplier = Math.pow(0.7, totalBounces);
                const currentDamage = this.initialDamage * damageMultiplier;

                this.onHit(target, currentDamage);

                this.segments.push({
                    start: { ...this.currentPos },
                    end: { ...target.pos },
                    alpha: 1.0
                });

                this.currentPos = { ...target.pos };
                this.bounces--;
                this.timer = this.interval;
            } else {
                if (this.segments.length === 0) this.isDead = true;
            }
        }

        if (this.bounces <= 0 && this.segments.length === 0) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(-camera.x, -camera.y);

        for (const seg of this.segments) {
            ctx.beginPath();
            ctx.moveTo(seg.start.x, seg.start.y);
            ctx.lineTo(seg.end.x, seg.end.y);

            ctx.strokeStyle = `rgba(100, 200, 255, ${seg.alpha})`;
            ctx.lineWidth = 2;
            ctx.shadowColor = '#00ffff';
            ctx.shadowBlur = 5;
            ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

export abstract class ProjectileWeapon extends Weapon {
    abstract projectileEmoji: string;
    abstract pierce: number;

    update(dt: number, enemies: Entity[]) {
        this.cooldown -= dt;
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

        const proj = new Projectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            this.damage * (this.owner as any).stats.might,
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

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number, emoji: string) {
        super(x, y, radius);
        this.duration = duration;
        this.damage = damage;
        this.interval = interval;
        this.emoji = emoji;
    }

    update(dt: number) {
        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;

        this.timer += dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#00ffff';
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }
}

export abstract class ZoneWeapon extends Weapon {
    abstract zoneEmoji: string;
    abstract interval: number;

    update(dt: number, _enemies: Entity[]) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            this.spawnZone();
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    spawnZone() {
        const zone = new Zone(
            this.owner.pos.x,
            this.owner.pos.y,
            this.area * (this.owner as any).stats.area,
            this.duration * (this.owner as any).stats.duration,
            this.damage * (this.owner as any).stats.might,
            Math.max(0.1, this.interval - (this.owner as any).stats.tick),
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

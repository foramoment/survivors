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

export class VoidRayBeam extends Entity {
    owner: any;
    target: any;
    canCollide: boolean = false;
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
    damage: number;
    onDamage: (pos: Vector2, amount: number) => void;

    constructor(owner: any, target: any, damage: number, isEvolved: boolean, onDamage: (pos: Vector2, amount: number) => void) {
        super(owner.pos.x, owner.pos.y, 0);
        this.owner = owner;
        this.target = target;
        this.damage = damage;
        this.isEvolved = isEvolved;
        this.onDamage = onDamage;
        this.canCollide = false;
        if (isEvolved) {
            this.maxWidth = 50;
            this.color = '#ff00ff';
        }
    }

    update(dt: number) {
        this.timer += dt;

        if (this.stage === 'charge') {
            if (this.timer >= this.chargeTime) {
                this.stage = 'fire';
                this.timer = 0;
                // Deal damage at start of fire
                if (this.target && !this.target.isDead) {
                    this.target.takeDamage(this.damage);
                    this.onDamage(this.target.pos, this.damage);

                    if (this.isEvolved) {
                        // Explosion at target
                        // We can spawn a zone or just visual here, but let's keep it simple
                    }
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
        if (!this.target || (this.target.isDead && this.stage === 'charge')) {
            // If target dies during charge, maybe just fade out or stay at last pos?
            // For simplicity, keep drawing to last known pos
        }

        const start = this.owner.pos;
        const end = this.target ? this.target.pos : { x: start.x + 100, y: start.y }; // Fallback

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

            // Charge gathering at player
            ctx.beginPath();
            ctx.arc(start.x, start.y, 10 + Math.random() * 5, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
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

        const { damage, isCrit } = (this.owner as any).getDamage(this.damage);

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

        const { damage, isCrit } = (this.owner as any).getDamage(this.damage);

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
    exploded: boolean = false;
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    isAtomic: boolean = false;

    constructor(x: number, y: number, radius: number, delay: number, damage: number, emoji: string, onDamage?: (pos: Vector2, amount: number) => void, isAtomic: boolean = false) {
        // extend Zone: duration, damage, interval, emoji
        // Set interval to Infinity so GameManager doesn't apply tick damage
        super(x, y, radius, delay + 1, damage, Number.MAX_VALUE, emoji);
        this.delay = delay;
        this.onDamageCallback = onDamage;
        this.isAtomic = isAtomic;
    }

    update(dt: number, enemies?: Entity[]) {
        if (this.exploded) {
            this.isDead = true;
            return;
        }

        this.delay -= dt;
        if (this.delay <= 0) {
            this.explode(enemies);
            this.exploded = true;
        }
    }

    explode(enemies?: Entity[]) {
        if (!enemies) return;

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

        // Draw warning indicator
        if (this.delay > 0) {
            // Incoming strike animation
            const progress = 1 - this.delay; // 0 to 1 (assuming delay starts at 1)

            // Target reticle
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 0, 0.5)`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);

            // Filling circle
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 50, 0, 0.3)`;
            ctx.fill();

            // Incoming missile line
            const height = 500 * (1 - progress);
            ctx.beginPath();
            ctx.moveTo(0, -height - 50);
            ctx.lineTo(0, 0);
            ctx.strokeStyle = 'orange';
            ctx.lineWidth = 4;
            ctx.stroke();

        } else {
            // Explosion visual
            ctx.font = `${this.radius * 1.5}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.emoji, 0, 0);

            // Shockwave
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 200, 50, 0.8)';
            ctx.lineWidth = 10;
            ctx.stroke();

            // Inner flash
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
            ctx.fill();

            if (this.isAtomic) {
                // Mushroom cloud effect (simplified)
                ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
                ctx.beginPath();
                ctx.arc(0, -this.radius * 0.5, this.radius * 0.6, 0, Math.PI * 2);
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
    stage: 'warning' | 'charge' | 'blast' = 'warning';
    stageTimer: number = 0;
    onDamageCallback?: (pos: Vector2, amount: number) => void;
    stunDuration: number = 0;

    constructor(x: number, y: number, radius: number, damage: number, onDamage?: (pos: Vector2, amount: number) => void, stunDuration: number = 0) {
        super(x, y, radius, 2.0, damage, 999, '🧠'); // 2s total duration
        this.interval = 999; // Manual damage handling
        this.onDamageCallback = onDamage;
        this.stunDuration = stunDuration;
    }

    update(dt: number, enemies?: Entity[]) {
        this.stageTimer += dt;

        if (this.stage === 'warning' && this.stageTimer > 0.5) {
            this.stage = 'charge';
        } else if (this.stage === 'charge' && this.stageTimer > 1.0) {
            this.stage = 'blast';
            // Deal damage once at blast start
            if (enemies) {
                enemies.forEach(e => {
                    if (distance(this.pos, e.pos) <= this.radius) {
                        (e as any).takeDamage(this.damage);
                        if (this.onDamageCallback) this.onDamageCallback(e.pos, this.damage);

                        if (this.stunDuration > 0) {
                            // Apply stun (freeze movement)
                            // We set a stun timer on the enemy (assuming we add it to Enemy class or just hack it)
                            (e as any).stunTimer = this.stunDuration;
                        }
                    }
                });
            }
        } else if (this.stage === 'blast' && this.stageTimer > 1.5) {
            this.isDead = true;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (this.stage === 'warning') {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 255, 0.5)`;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
        } else if (this.stage === 'charge') {
            // Charging effect - gathering energy
            const progress = (this.stageTimer - 0.5) / 0.5;
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * progress, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 0, 255, 0.3)`;
            ctx.fill();

            // Random lightning sparks inside
            for (let i = 0; i < 3; i++) {
                const ang = Math.random() * Math.PI * 2;
                const r = Math.random() * this.radius;
                ctx.fillStyle = '#fff';
                ctx.fillRect(Math.cos(ang) * r, Math.sin(ang) * r, 2, 2);
            }
        } else if (this.stage === 'blast') {
            // Blast visual
            ctx.beginPath();
            ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 0, 255, 0.6)`;
            ctx.fill();

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.font = `${this.radius}px Arial`;
            ctx.fillText('💥', 0, 0);
        }

        ctx.restore();
    }
}


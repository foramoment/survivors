import { Weapon } from '../Weapon';
import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';

export class Projectile extends Entity {
    velocity: Vector2;
    duration: number;
    damage: number;
    pierce: number;
    emoji: string;

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

export abstract class ProjectileWeapon extends Weapon {
    abstract projectileEmoji: string;
    abstract pierce: number;

    update(dt: number, enemies: Entity[]) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            // Find target
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
            this.interval,
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

import { Entity } from '../Entity';
import { type Vector2, distance, normalize } from '../core/Utils';
import { Projectile } from '../weapons/WeaponTypes';

export class Drone extends Entity {
    owner: Entity;
    offset: Vector2 = { x: 50, y: -50 };
    angle: number = 0;
    orbitSpeed: number = 2;

    // Shooting stats
    cooldown: number = 0;
    baseCooldown: number = 0.5;
    damage: number = 10;
    range: number = 400;
    projectileSpeed: number = 600;

    isEvolved: boolean = false;
    droneIndex: number = 0;
    totalDrones: number = 1;

    constructor(owner: Entity, isEvolved: boolean = false, index: number = 0, total: number = 1) {
        super(owner.pos.x, owner.pos.y, 15);
        this.owner = owner;
        this.isEvolved = isEvolved;
        this.droneIndex = index;
        this.totalDrones = total;

        if (isEvolved) {
            this.baseCooldown = 0.3;
            this.damage = 15;
        }
    }

    update(dt: number, enemies: Entity[]) {
        // Orbit logic
        this.angle += this.orbitSpeed * dt;
        const orbitOffset = (Math.PI * 2 / this.totalDrones) * this.droneIndex;
        const currentAngle = this.angle + orbitOffset;

        const orbitDist = 60;
        const targetX = this.owner.pos.x + Math.cos(currentAngle) * orbitDist;
        const targetY = this.owner.pos.y + Math.sin(currentAngle) * orbitDist;

        // Smooth follow
        this.pos.x += (targetX - this.pos.x) * 10 * dt;
        this.pos.y += (targetY - this.pos.y) * 10 * dt;

        // Shooting logic
        const ownerStats = (this.owner as any).stats;
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = ownerStats.timeSpeed || 1;

        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            this.shoot(enemies);
            this.cooldown = this.baseCooldown * ownerStats.cooldown;
        }
    }

    shoot(enemies: Entity[]) {
        // Find nearest enemy
        let target: Entity | null = null;
        let minDst = this.range * (this.owner as any).stats.area;

        for (const enemy of enemies) {
            const d = distance(this.pos, enemy.pos);
            if (d < minDst) {
                minDst = d;
                target = enemy;
            }
        }

        if (target) {
            const dir = normalize({
                x: target.pos.x - this.pos.x,
                y: target.pos.y - this.pos.y
            });

            const ownerStats = (this.owner as any).stats;
            const { damage } = (this.owner as any).getDamage(this.damage);

            const velocity = {
                x: dir.x * this.projectileSpeed * ownerStats.speed,
                y: dir.y * this.projectileSpeed * ownerStats.speed
            };

            const proj = new Projectile(
                this.pos.x,
                this.pos.y,
                velocity,
                2 * ownerStats.duration, // 2s duration
                damage,
                1, // pierce
                this.isEvolved ? '🔴' : '🔹'
            );

            // Add projectile to game manager via callback or event?
            // The Weapon class has onSpawn. But Drone is an Entity.
            // We need a way to spawn projectiles.
            // We can attach a callback to the Drone.
            this.onSpawnProjectile(proj);
        }
    }

    onSpawnProjectile: (p: Projectile) => void = () => { };

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.font = '25px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.isEvolved ? '🛸' : '🚁', 0, 0);

        ctx.restore();
    }
}

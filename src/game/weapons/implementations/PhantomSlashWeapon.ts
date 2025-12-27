/**
 * PHANTOM SLASH WEAPON
 * Instantly cuts random enemies in range.
 * 
 * Evolved: Dimensional Blade - Creates rift zones that slow enemies
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import type { Vector2 } from '../../core/Utils';
import { Zone } from '../base';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

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

    update(dt: number) {
        super.update(dt);
        this.rotationAngle += dt * 3;
        this.pulsePhase += dt * 5;

        // Slow enemies in rift (50% slow)
        const enemiesInRift = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInRift) {
            const dx = this.pos.x - enemy.pos.x;
            const dy = this.pos.y - enemy.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < this.radius) {
                (enemy as any).slowMultiplier = Math.min((enemy as any).slowMultiplier || 1, 0.5);
                (enemy as any).slowDuration = 0.5;
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

export class PhantomSlashWeapon extends Weapon {
    name = "Phantom Slash";
    emoji = "⚔️";
    description = "Instantly cuts random enemies.";

    readonly stats = {
        damage: 15,
        cooldown: 1.5,
        area: 250,
        speed: 0,
        duration: 0.2,
        count: 3,
        countScaling: 1,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const speedBoost = this.owner.weaponSpeedBoost || 1;
        this.cooldown -= dt * speedBoost;
        if (this.cooldown <= 0) {
            const targets = [...this.findAllEnemies()];

            if (targets.length > 0) {
                const isEvolved = this.evolved;
                const baseCount = (this.stats.count || 3) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
                const count = isEvolved ? baseCount * 2 : baseCount;

                for (let i = 0; i < count; i++) {
                    if (targets.length === 0) break;
                    const idx = Math.floor(Math.random() * targets.length);
                    const target = targets[idx];

                    if (!isEvolved) {
                        targets.splice(idx, 1);
                    }

                    // Use DamageSystem - handles crit, damage, and damage numbers automatically
                    const result = damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this,
                        target: target,
                        position: target.pos
                    });

                    if (isEvolved) {
                        const rift = new DimensionalRiftZone(target.pos.x, target.pos.y, result.finalDamage * 0.2);
                        this.onSpawn(rift);
                    } else {
                        const slash = new Zone(target.pos.x, target.pos.y, 40, 0.2, 0, 1, '⚔️');
                        this.onSpawn(slash);
                    }
                }
                const cdMultiplier = isEvolved ? 1.3 : 1.0;
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown * cdMultiplier;
            }
        }
    }
}

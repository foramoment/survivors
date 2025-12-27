/**
 * FROST NOVA WEAPON
 * Throws freezing grenades that create slowing zones.
 * 
 * Evolved: Absolute Zero - Complete freeze effect
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import type { Vector2 } from '../../core/Utils';
import { LobbedProjectile, FrostZone, Zone } from '../base';
import { particles } from '../../core/ParticleSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

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

    update(dt: number) {
        super.update(dt);
        this.crystalAngle += dt;

        // Freeze enemies (100% slow)
        const enemiesInFreezeZone = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInFreezeZone) {
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

export class FrostNovaWeapon extends Weapon {
    name = "Frost Nova";
    emoji = "❄️";
    description = "Throws freezing grenades.";

    readonly stats = {
        damage: 8,
        cooldown: 2.5,
        area: 120,
        speed: 0,
        duration: 3.0,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            const range = 400;
            const offsetX = (Math.random() - 0.5) * 2 * range;
            const offsetY = (Math.random() - 0.5) * 2 * range;
            const target = { x: this.owner.pos.x + offsetX, y: this.owner.pos.y + offsetY };

            const lob = new LobbedProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                target,
                0.6,
                '❄️'
            );

            lob.onLand = (x, y) => {
                const isEvolved = this.evolved;
                particles.emitFrost(x, y);

                if (isEvolved) {
                    const zone = new AbsoluteZeroZone(
                        x, y,
                        this.area * this.owner.stats.area,
                        this.owner.getDamage(this.damage).damage,
                        this.stats.duration * this.owner.stats.duration
                    );
                    this.onSpawn(zone);
                } else {
                    const zone = new FrostZone(
                        x, y,
                        this.area * this.owner.stats.area,
                        this.stats.duration * this.owner.stats.duration,
                        this.owner.getDamage(this.damage).damage,
                        0.5,
                        0.5
                    );
                    this.onSpawn(zone);
                }
            };

            this.onSpawn(lob);
            this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
        }
    }
}

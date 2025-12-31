/**
 * ORBITAL STRIKE WEAPON
 * Calls down random explosions.
 * 
 * Evolved: Atomic Bomb - Massive nuclear explosion
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import type { Vector2 } from '../../core/Utils';
import { DelayedExplosionZone } from '../base';
import { particles } from '../../core/ParticleSystem';

// ============================================
// EVOLVED ORBITAL STRIKE - ATOMIC BOMB
// Single massive explosion with mushroom cloud
// ============================================

export class AtomicBombZone extends DelayedExplosionZone {
    private atomicShockwaveRadius: number = 0;
    private atomicMushroomHeight: number = 0;
    private atomicExploded: boolean = false;

    constructor(x: number, y: number, radius: number, damage: number) {
        super(x, y, radius, 1.2, damage, '☢️', true);
    }

    update(dt: number) {
        super.update(dt);

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

export class OrbitalStrikeWeapon extends Weapon {
    name = "Orbital Strike";
    emoji = "🛰️";
    description = "Calls down random explosions.";

    readonly stats = {
        damage: 40,
        cooldown: 2.0,
        area: 100,
        speed: 0,
        duration: 1.0,
    };

    private activeAtomicBomb: any = null;
    private waitingForExplosion: boolean = false;

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    update(dt: number) {
        const isEvolved = this.evolved;

        if (isEvolved && this.waitingForExplosion) {
            if (this.activeAtomicBomb && this.activeAtomicBomb.isDead) {
                this.waitingForExplosion = false;
                this.activeAtomicBomb = null;
            }
            return;
        }

        this.cooldown -= dt;

        if (this.cooldown <= 0) {
            if (isEvolved) {
                const atomicBomb = new AtomicBombZone(
                    this.owner.pos.x + (Math.random() - 0.5) * 300,
                    this.owner.pos.y + (Math.random() - 0.5) * 200,
                    300,
                    this.damage * 8
                );
                atomicBomb.source = this;
                this.activeAtomicBomb = atomicBomb;
                this.waitingForExplosion = true;
                this.onSpawn(atomicBomb);

                this.cooldown = 8.0 * this.owner.stats.cooldown;
            } else {
                const offsetX = (Math.random() - 0.5) * 1000;
                const offsetY = (Math.random() - 0.5) * 800;

                const zone = new DelayedExplosionZone(
                    this.owner.pos.x + offsetX,
                    this.owner.pos.y + offsetY,
                    this.area * this.owner.stats.area * (1 + this.level * 0.1),
                    1.0,
                    this.damage,
                    '💥'
                );
                zone.source = this;
                this.onSpawn(zone);
                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }
}

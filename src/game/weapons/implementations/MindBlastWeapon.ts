/**
 * MIND BLAST WEAPON
 * Psionic storm at enemy location.
 * 
 * Evolved: Psychic Storm - Cascading stun zone
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { type Vector2, distance } from '../../core/Utils';
import { MindBlastZone, Zone } from '../base';
import { levelSpatialHash } from '../../core/SpatialHash';
import { particles } from '../../core/ParticleSystem';

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

    update(dt: number) {
        super.update(dt);
        this.wavePhase += dt * 8;

        // Stun enemies in range (only once per enemy)
        const enemiesInPsiStorm = levelSpatialHash.getWithinRadius(this.pos, this.radius);

        for (const enemy of enemiesInPsiStorm) {
            if (this.hasStunned.has(enemy)) continue;

            const dist = distance(this.pos, enemy.pos);

            if (dist < this.radius) {
                (enemy as any).stunDuration = Math.max((enemy as any).stunDuration || 0, this.stunDuration);
                this.hasStunned.add(enemy);
                particles.emitHit(enemy.pos.x, enemy.pos.y, '#ff00ff');
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

export class MindBlastWeapon extends Weapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic storm at enemy location.";

    readonly stats = {
        damage: 20,
        cooldown: 3,
        area: 120,
        speed: 0,
        duration: 0.5,
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
            const targets = this.findRandomEnemies(1, 600);

            if (targets.length > 0) {
                const target = targets[0];
                const isEvolved = this.evolved;
                const result = this.owner.getDamage(this.damage);

                if (isEvolved) {
                    const zone = new PsychicStormZone(
                        target.pos.x,
                        target.pos.y,
                        this.area * this.owner.stats.area,
                        result.damage,
                        2.0,
                        (pos, amount) => this.onDamage(pos, amount, result.isCrit)
                    );
                    this.onSpawn(zone);
                } else {
                    const zone = new MindBlastZone(
                        target.pos.x,
                        target.pos.y,
                        this.area * this.owner.stats.area,
                        result.damage,
                        (pos, amount) => this.onDamage(pos, amount, result.isCrit),
                        0
                    );
                    this.onSpawn(zone);
                }

                this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
            }
        }
    }
}

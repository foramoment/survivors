/**
 * SPORE CLOUD WEAPON
 * Leaves damaging zone at player position.
 * 
 * Evolved: Fungal Apocalypse - Longer lasting zones that grow over time
 */
import { ZoneWeapon, SporeZone } from '../base';
import type { Player } from '../../entities/Player';
import { type Vector2 } from '../../core/Utils';

// ============================================
// FUNGAL APOCALYPSE ZONE - Growing, long-lasting toxic zone
// ============================================
export class FungalApocalypseZone extends SporeZone {
    private baseRadius: number;
    private growthRate: number = 0.15; // 15% per second
    private pulseTimer: number = 0;
    private initialDuration: number;

    constructor(x: number, y: number, radius: number, duration: number, damage: number, interval: number) {
        super(x, y, radius, duration, damage, interval);
        this.baseRadius = radius;
        this.initialDuration = duration;
    }

    update(dt: number) {
        super.update(dt);

        // Grow radius over time (no cap - grows while duration allows)
        const elapsedTime = this.initialDuration - this.duration;
        this.radius = this.baseRadius * (1 + this.growthRate * elapsedTime);

        // Pulse effect timer
        this.pulseTimer += dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const pulse = 0.8 + Math.sin(this.pulseTimer * 3) * 0.2;
        const growthRatio = this.radius / this.baseRadius;

        // Dark ominous gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, `rgba(60, 30, 10, ${0.6 * pulse})`);
        gradient.addColorStop(0.4, `rgba(80, 50, 20, ${0.4 * pulse})`);
        gradient.addColorStop(0.7, `rgba(50, 35, 15, ${0.25 * pulse})`);
        gradient.addColorStop(1, 'rgba(30, 20, 5, 0.05)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Pulsing glow ring
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.95, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(150, 100, 50, ${0.4 * pulse})`;
        ctx.lineWidth = 3 + growthRatio;
        ctx.shadowColor = '#996633';
        ctx.shadowBlur = 15;
        ctx.stroke();

        // Inner toxic glow
        const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.4);
        innerGlow.addColorStop(0, `rgba(180, 120, 40, ${0.5 * pulse})`);
        innerGlow.addColorStop(1, 'rgba(100, 60, 20, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = innerGlow;
        ctx.fill();

        ctx.restore();
    }
}

export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "";
    interval = 1;

    readonly stats = {
        damage: 10,
        cooldown: 4,
        area: 50,
        speed: 0,
        duration: 2,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.duration = this.stats.duration;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
    }

    spawnZone() {
        const baseInterval = Math.max(0.1, this.interval - this.owner.stats.tick);
        const isEvolved = this.evolved;

        if (isEvolved) {
            // Fungal Apocalypse: 2.5x longer duration, growing radius
            const zone = new FungalApocalypseZone(
                this.owner.pos.x,
                this.owner.pos.y,
                this.area * this.owner.stats.area,
                this.stats.duration * this.owner.stats.duration * 2.5, // 2.5x duration
                this.damage,
                baseInterval * 0.5
            );
            zone.source = this;
            this.onSpawn(zone);
        } else {
            const zone = new SporeZone(
                this.owner.pos.x,
                this.owner.pos.y,
                this.area * this.owner.stats.area,
                this.duration * this.owner.stats.duration,
                this.damage,
                baseInterval
            );
            zone.source = this;
            this.onSpawn(zone);
        }
    }
}

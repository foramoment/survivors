import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';

export type CrystalType = 'blue' | 'green' | 'red' | 'purple' | 'power';

export interface CrystalTypeData {
    emoji: string;
    value: number;
    color: string;
}

export const CRYSTAL_TYPES: Record<CrystalType, CrystalTypeData> = {
    blue: { emoji: '💎', value: 1, color: 'rgba(100, 200, 255, 0.6)' },
    green: { emoji: '💠', value: 5, color: 'rgba(100, 255, 100, 0.6)' },
    red: { emoji: '🔷', value: 20, color: 'rgba(255, 100, 100, 0.6)' },
    purple: { emoji: '🔷', value: 100, color: 'rgba(200, 100, 255, 0.6)' },
    power: { emoji: '⭐', value: 0, color: 'rgba(255, 215, 0, 0.8)' } // Special power crystal
};

export class XPCrystal extends Entity {
    value: number;
    lifetime: number = 30; // Despawn after 30 seconds
    pulseTimer: number = 0;
    type: CrystalType;
    isPowerCrystal: boolean = false;

    constructor(x: number, y: number, type: CrystalType = 'blue') {
        super(x, y, 8);
        this.type = type;
        this.value = CRYSTAL_TYPES[type].value;
        this.isPowerCrystal = type === 'power';
    }

    update(dt: number, playerPos?: Vector2, magnetRange?: number) {
        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.isDead = true;
        }

        this.pulseTimer += dt;

        // Magnet effect
        if (playerPos && magnetRange) {
            const dist = distance(this.pos, playerPos);
            if (dist < magnetRange) {
                const dir = normalize({
                    x: playerPos.x - this.pos.x,
                    y: playerPos.y - this.pos.y
                });

                // Speed increases as it gets closer
                const pullSpeed = 300 * (1 - dist / magnetRange);
                this.pos.x += dir.x * pullSpeed * dt;
                this.pos.y += dir.y * pullSpeed * dt;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const crystalData = CRYSTAL_TYPES[this.type];

        // Pulsing glow effect
        const pulse = 0.8 + 0.2 * Math.sin(this.pulseTimer * 6);
        const glowSize = this.radius * pulse * (this.isPowerCrystal ? 3 : 2);

        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, crystalData.color);
        gradient.addColorStop(1, crystalData.color.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Power crystal rotation
        if (this.isPowerCrystal) {
            ctx.rotate(this.pulseTimer * 2);
        }

        // Crystal emoji
        const fontSize = this.isPowerCrystal ? 24 : 16;
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(crystalData.emoji, 0, 0);

        ctx.restore();
    }
}

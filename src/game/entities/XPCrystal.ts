import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';

export class XPCrystal extends Entity {
    value: number;
    lifetime: number = 30; // Despawn after 30 seconds
    pulseTimer: number = 0;

    constructor(x: number, y: number, value: number = 1) {
        super(x, y, 8);
        this.value = value;
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

        // Pulsing glow effect
        const pulse = 0.8 + 0.2 * Math.sin(this.pulseTimer * 6);
        const glowSize = this.radius * pulse * 2;

        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, 'rgba(100, 200, 255, 0.6)');
        gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Crystal emoji
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💎', 0, 0);

        ctx.restore();
    }
}

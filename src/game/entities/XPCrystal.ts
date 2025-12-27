import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';

export class XPCrystal extends Entity {
    value: number;
    lifetime: number = 30;
    pulseTimer: number = 0;
    private fontSize: number;

    constructor(x: number, y: number, value: number) {
        // Dynamic radius based on value (6-12px)
        const baseRadius = 6 + Math.min(value / 10, 6);
        super(x, y, baseRadius);
        this.value = value;
        // Dynamic font size (12-22px)
        this.fontSize = 12 + Math.min(value / 6, 10);
    }

    private getGlowColor(): string {
        // HSL gradient: cyan (200) → red (0) based on value
        const t = Math.min(this.value / 60, 1);
        const hue = 200 - t * 200;
        return `hsla(${hue}, 100%, 60%, 0.7)`;
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

        const glowColor = this.getGlowColor();

        // Pulsing glow effect
        const pulse = 0.8 + 0.2 * Math.sin(this.pulseTimer * 6);
        const glowSize = this.radius * pulse * 2;

        // Outer glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, glowColor);
        gradient.addColorStop(1, glowColor.replace(/[\d.]+\)$/, '0)'));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();

        // Crystal emoji
        ctx.font = `${this.fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💎', 0, 0);

        ctx.restore();
    }
}

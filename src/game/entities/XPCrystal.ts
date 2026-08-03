import { Entity } from '../../engine/Entity';
import { type Vector2, normalize, distance } from '../../engine/Utils';
import { sprites } from '../core/SpriteFactory';

/**
 * A dropped XP shard.
 *
 * Crystals used to expire after 30 seconds, which punished exactly the play the
 * game asks for: clear a pack, kite out of the next wave, come back — and the
 * XP you earned was gone. They are permanent now. GameManager keeps the cost
 * bounded instead, by only updating and drawing the ones on screen and merging
 * distant ones when the field gets crowded (see `consolidateCrystals`).
 */
export class XPCrystal extends Entity {
    value: number;
    pulseTimer: number = 0;
    private fontSize: number;

    constructor(x: number, y: number, value: number) {
        super(x, y, 0);
        this.value = value;
        this.fontSize = 0;
        this.setValue(value);
    }

    /** Radius and glyph size follow the value, so a merged crystal reads bigger */
    setValue(value: number) {
        this.value = value;
        this.radius = 6 + Math.min(value / 10, 6);
        this.fontSize = 12 + Math.min(value / 6, 10);
    }

    private getGlowColor(): string {
        // HSL gradient: cyan (200) → red (0) based on value
        const t = Math.min(this.value / 60, 1);
        const hue = 200 - t * 200;
        return `hsla(${hue}, 100%, 60%, 0.7)`;
    }

    update(dt: number, playerPos?: Vector2, magnetRange?: number) {
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

        // Procedural pixel diamond, gentle bobbing
        const sprite = sprites.getCrystalSprite(this.value);
        const size = this.fontSize * 1.4;
        const bobY = Math.sin(this.pulseTimer * 4) * 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, -size / 2, -size / 2 + bobY, size, size);

        ctx.restore();
    }
}

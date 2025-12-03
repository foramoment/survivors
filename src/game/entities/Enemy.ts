import { Entity } from '../Entity';
import { type Vector2, normalize } from '../core/Utils';

export class Enemy extends Entity {
    hp: number;
    maxHp: number;
    baseHp: number; // Store base HP for reference
    speed: number;
    damage: number;
    xpValue: number;
    emoji: string;
    isElite: boolean = false;
    eliteSizeMultiplier: number = 1;
    eliteOutlineColor: string = '';

    constructor(x: number, y: number, type: EnemyType, isElite: boolean = false) {
        super(x, y, 12);
        this.baseHp = type.hp;
        this.hp = type.hp;
        this.maxHp = type.hp;
        this.speed = type.speed;
        this.damage = type.damage;
        this.xpValue = type.xpValue;
        this.emoji = type.emoji;

        // Elite enemy modifications
        if (isElite) {
            this.isElite = true;
            this.hp *= 5;
            this.maxHp *= 5;
            this.eliteSizeMultiplier = 1.5;
            this.radius *= this.eliteSizeMultiplier;
            // Random elite outline color
            const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00'];
            this.eliteOutlineColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    speedMultiplier: number = 1;

    update(dt: number, playerPos?: Vector2) {
        // Reset modifiers - Handled in GameManager
        // this.speedMultiplier = 1;

        if (!playerPos) return;

        const dir = normalize({
            x: playerPos.x - this.pos.x,
            y: playerPos.y - this.pos.y
        });

        const currentSpeed = this.speed * this.speedMultiplier;
        this.pos.x += dir.x * currentSpeed * dt;
        this.pos.y += dir.y * currentSpeed * dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Draw elite glow (similar to XP crystals)
        if (this.isElite) {
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 200);
            const glowSize = this.radius * pulse * 2;

            // Outer glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
            gradient.addColorStop(0, this.eliteOutlineColor + '99'); // 60% opacity
            gradient.addColorStop(1, this.eliteOutlineColor + '00'); // transparent
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
            ctx.fill();
        }

        // Add white shadow/outline to all enemies for visibility
        const fontSize = this.isElite ? 36 : 24;
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Draw white outline
        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillText(this.emoji, 0, 0);

        // Reset shadow and draw emoji again for crisp appearance
        ctx.shadowBlur = 0;
        ctx.fillText(this.emoji, 0, 0);

        ctx.restore();
    }

    takeDamage(amount: number) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.isDead = true;
        }
    }
}

export interface EnemyType {
    name: string;
    hp: number;
    speed: number;
    damage: number;
    xpValue: number;
    emoji: string;
}

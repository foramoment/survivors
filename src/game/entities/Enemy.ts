import { Entity } from '../Entity';
import { type Vector2, normalize } from '../core/Utils';

export class Enemy extends Entity {
    hp: number;
    speed: number;
    damage: number;
    xpValue: number;
    emoji: string;

    constructor(x: number, y: number, type: EnemyType) {
        super(x, y, 12);
        this.hp = type.hp;
        this.speed = type.speed;
        this.damage = type.damage;
        this.xpValue = type.xpValue;
        this.emoji = type.emoji;
    }

    update(dt: number, playerPos?: Vector2) {
        if (!playerPos) return;

        const dir = normalize({
            x: playerPos.x - this.pos.x,
            y: playerPos.y - this.pos.y
        });

        this.pos.x += dir.x * this.speed * dt;
        this.pos.y += dir.y * this.speed * dt;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Flip if moving left
        // We don't track velocity vector here but we can infer from player pos
        // For now simple draw

        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
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

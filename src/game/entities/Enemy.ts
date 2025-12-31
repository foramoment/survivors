import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import type { StatusEffect } from '../status/StatusEffect';

export class Enemy extends Entity {
    hp: number;
    maxHp: number;
    baseHp: number;
    speed: number;
    damage: number;
    xpValue: number;
    emoji: string;
    isElite: boolean = false;
    eliteSizeMultiplier: number = 1;
    eliteOutlineColor: string = '';

    // Physics properties for separation and knockback
    velocity: Vector2 = { x: 0, y: 0 };
    knockback: Vector2 = { x: 0, y: 0 };

    // Separation force accumulator (reset each frame)
    separationForce: Vector2 = { x: 0, y: 0 };

    // Status effects
    effects: StatusEffect[] = [];

    constructor(x: number, y: number, type: EnemyType, isElite: boolean = false) {
        super(x, y, 12);
        this.baseHp = type.hp;
        this.hp = type.hp;
        this.maxHp = type.hp;
        this.speed = type.speed;
        this.damage = type.damage;
        this.xpValue = type.xpValue;
        this.emoji = type.emoji;

        if (isElite) {
            this.isElite = true;
            this.hp *= 5;
            this.maxHp *= 5;
            this.eliteSizeMultiplier = 1.5;
            this.radius *= this.eliteSizeMultiplier;
            const colors = ['#ff00ff', '#00ffff', '#ffff00', '#ff0000', '#00ff00'];
            this.eliteOutlineColor = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    speedMultiplier: number = 1;

    /**
     * Reset forces at start of frame
     */
    resetForces() {
        this.separationForce = { x: 0, y: 0 };
    }

    /**
     * Apply a status effect to this enemy
     */
    applyEffect(effect: StatusEffect) {
        this.effects.push(effect);
        effect.onApply?.(this);
    }

    /**
     * Update all active status effects
     */
    updateEffects(dt: number) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.update(dt, this);

            if (effect.duration <= 0) {
                effect.onRemove?.(this);
                this.effects.splice(i, 1);
            }
        }
    }

    /**
     * Add separation force from another enemy
     */
    addSeparationFrom(other: Enemy, separationStrength: number = 150) {
        const dx = this.pos.x - other.pos.x;
        const dy = this.pos.y - other.pos.y;
        const dist = distance(this.pos, other.pos);
        const minDist = this.radius + other.radius;

        if (dist < minDist && dist > 0.001) {
            // Overlap amount (0 to 1, where 1 is full overlap)
            const overlap = 1 - (dist / minDist);

            // Direction away from other enemy
            const nx = dx / dist;
            const ny = dy / dist;

            // Force proportional to overlap
            const force = overlap * separationStrength;
            this.separationForce.x += nx * force;
            this.separationForce.y += ny * force;
        }
    }

    /**
     * Apply knockback force (from player collision)
     */
    applyKnockback(dirX: number, dirY: number, force: number) {
        this.knockback.x += dirX * force;
        this.knockback.y += dirY * force;
    }

    update(dt: number, playerPos?: Vector2) {
        if (!playerPos) return;

        // 1. Calculate movement towards player
        const toPlayer = normalize({
            x: playerPos.x - this.pos.x,
            y: playerPos.y - this.pos.y
        });

        const currentSpeed = this.speed * this.speedMultiplier;

        // 2. Combine all forces
        // Movement toward player
        let moveX = toPlayer.x * currentSpeed;
        let moveY = toPlayer.y * currentSpeed;

        // Add separation force (already accumulated)
        moveX += this.separationForce.x;
        moveY += this.separationForce.y;

        // Add knockback (decays over time)
        moveX += this.knockback.x;
        moveY += this.knockback.y;

        // 3. Apply movement
        this.pos.x += moveX * dt;
        this.pos.y += moveY * dt;

        // 4. Decay knockback (friction)
        const knockbackDecay = 0.9; // 10% decay per frame at 60fps
        this.knockback.x *= knockbackDecay;
        this.knockback.y *= knockbackDecay;

        // Zero out very small knockback
        if (Math.abs(this.knockback.x) < 1) this.knockback.x = 0;
        if (Math.abs(this.knockback.y) < 1) this.knockback.y = 0;
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        if (this.isElite) {
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 200);
            const glowSize = this.radius * pulse * 2;

            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
            gradient.addColorStop(0, this.eliteOutlineColor + '99');
            gradient.addColorStop(1, this.eliteOutlineColor + '00');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
            ctx.fill();
        }

        const fontSize = this.isElite ? 36 : 24;
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
        ctx.shadowBlur = 8;
        ctx.fillText(this.emoji, 0, 0);

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

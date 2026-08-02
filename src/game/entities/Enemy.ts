import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import { sprites, type EnemyTint } from '../core/SpriteFactory';
import type { Infection, Corrosion, InfectionKind } from '../core/StatusEffects';

/** Mote colour per DoT flavour: [plain, contagious] */
const INFECTION_COLORS: Record<InfectionKind, [string, string]> = {
    spore: ['#8fd642', '#b6ff4d'],
    acid: ['#5fe08a', '#8dffb0'],
    burn: ['#ff9a3c', '#ffd35c'],
};

export class Enemy extends Entity {
    hp: number;
    maxHp: number;
    baseHp: number;
    speed: number;
    damage: number;
    xpValue: number;
    emoji: string;
    name: string = '';
    animTimer: number = Math.random() * 10;
    hitFlash: number = 0;
    facingLeft: boolean = false;
    isElite: boolean = false;
    isBoss: boolean = false;
    eliteSizeMultiplier: number = 1;
    eliteOutlineColor: string = '';

    // Physics properties for separation and knockback
    velocity: Vector2 = { x: 0, y: 0 };
    knockback: Vector2 = { x: 0, y: 0 };

    // Separation force accumulator (reset each frame)
    separationForce: Vector2 = { x: 0, y: 0 };

    // Status effects — owned by core/StatusEffects, stored here so lookups are free
    infection: Infection | null = null;
    corrosion: Corrosion | null = null;
    /** Seconds of stun left; while > 0 the enemy cannot move */
    stunTimer: number = 0;
    /** Seconds before this enemy can be stunned again (see StatusEffects.stun) */
    stunImmunity: number = 0;
    /**
     * Killed by a Kill Echo blast, so it may not detonate one of its own.
     * Without this, one echo on a dense pack cascades until the screen is
     * empty — see core/Tactics.
     */
    echoed: boolean = false;

    constructor(x: number, y: number, type: EnemyType, isElite: boolean = false) {
        super(x, y, 12);
        this.baseHp = type.hp;
        this.hp = type.hp;
        this.maxHp = type.hp;
        this.speed = type.speed;
        this.damage = type.damage;
        this.xpValue = type.xpValue;
        this.emoji = type.emoji;
        this.name = type.name;

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
     * Promote this enemy to a wave miniboss. Call after time scaling so the
     * multipliers stack on the already-scaled stats.
     */
    makeBoss() {
        this.isBoss = true;
        this.hp *= 12;
        this.maxHp *= 12;
        this.baseHp *= 12;
        this.damage *= 1.5;
        this.xpValue *= 10;
        this.radius *= 2;
        this.speed *= 0.8;
        if (!this.eliteOutlineColor) this.eliteOutlineColor = '#ff3355';
    }

    /**
     * Reset forces at start of frame
     */
    resetForces() {
        this.separationForce = { x: 0, y: 0 };
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
        this.animTimer += dt;
        if (this.hitFlash > 0) this.hitFlash -= dt;

        // Stunned: still animates and takes damage, but goes nowhere. Knockback
        // already in flight is allowed to finish playing out.
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.pos.x += this.knockback.x * dt;
            this.pos.y += this.knockback.y * dt;
            this.knockback.x *= 0.9;
            this.knockback.y *= 0.9;
            return;
        }

        if (!playerPos) return;
        this.facingLeft = playerPos.x < this.pos.x;

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

        if (this.isElite || this.isBoss) {
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

        // Procedural pixel sprite with walk animation and hit flash
        const frame = Math.floor(this.animTimer * 6) % 2;
        // A hit reads as a white flash; corrosion as a slow acid-green pulse of
        // the same silhouette. Both are baked sprite variants, so this costs a
        // drawImage no matter how many enemies are affected — the ring this
        // replaced was a stroked path per body, per frame.
        const tint: EnemyTint = this.hitFlash > 0
            ? 'hit'
            : (this.corrosion && Math.sin(this.animTimer * 7) > 0.25 ? 'corroded' : 'none');
        const sprite = sprites.getEnemySprite(this.name, frame, tint);
        const size = this.radius * 2.4;
        const bob = Math.sin(this.animTimer * 8) * this.radius * 0.08;

        ctx.imageSmoothingEnabled = false;
        if (this.facingLeft) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -size / 2, -size / 2 + bob, size, size);
        if (this.facingLeft) ctx.scale(-1, 1);

        // Status markers: spores orbiting an infected host, psi ring on a stun.
        // Both are a handful of rects — cheap enough for a screen full of enemies.
        if (this.infection) {
            ctx.fillStyle = INFECTION_COLORS[this.infection.kind][this.infection.contagious ? 1 : 0];
            for (let i = 0; i < 3; i++) {
                const a = this.animTimer * 2.4 + (i / 3) * Math.PI * 2;
                const r = this.radius * 0.9;
                ctx.fillRect(
                    Math.round(Math.cos(a) * r) - 1,
                    Math.round(Math.sin(a) * r * 0.7) - 1,
                    3, 3
                );
            }
        }

        if (this.stunTimer > 0) {
            ctx.strokeStyle = '#ff8cf0';
            ctx.lineWidth = 2;
            const wobble = Math.sin(this.animTimer * 14) * 2;
            ctx.beginPath();
            ctx.ellipse(0, -this.radius - 6, this.radius * 0.7 + wobble, 4, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Boss HP bar above the sprite
        if (this.isBoss) {
            const barWidth = this.radius * 2.5;
            const barHeight = 5;
            const y = -this.radius - 14;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(-barWidth / 2, y, barWidth, barHeight);
            ctx.fillStyle = '#ff3355';
            ctx.fillRect(-barWidth / 2, y, barWidth * Math.max(0, this.hp / this.maxHp), barHeight);
        }

        ctx.restore();
    }

    takeDamage(amount: number) {
        this.hp -= amount;
        this.hitFlash = 0.08;
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

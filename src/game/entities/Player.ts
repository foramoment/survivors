import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import { input } from '../core/Input';
import { Weapon } from '../Weapon';
import { sprites } from '../core/SpriteFactory';

export class Player extends Entity {
    speed: number = 200;
    hp: number = 100;
    maxHp: number = 100;
    xp: number = 0;
    level: number = 1;
    nextLevelXp: number = 4;

    weapons: Weapon[] = [];

    // Invulnerability system — discrete hits only (see takeDamage)
    invulnerabilityTimer: number = 0;
    invulnerabilityDuration: number = 0.5;

    /** Seconds left of the "enemies are on me" tint; refreshed while in contact */
    contactTimer: number = 0;

    // Knockback system
    knockback: Vector2 = { x: 0, y: 0 };

    // Stats modifiers
    stats = {
        might: 1,
        area: 1,
        cooldown: 1,
        speed: 1,
        duration: 1,
        moveSpeed: 1,
        magnet: 100,
        growth: 1,
        armor: 0,
        regen: 0,
        critChance: 0,
        critDamage: 2,
        tick: 0
    };

    className: string = "Survivor";
    classEmoji: string = "🧑‍🚀";

    animTimer: number = 0;
    /** Always-advancing clock for effects that must animate while standing still */
    pulseClock: number = 0;
    isMoving: boolean = false;
    facingLeft: boolean = false;

    onLevelUp: () => void = () => { };

    constructor(x: number, y: number) {
        super(x, y, 15);
    }

    /**
     * Apply knockback force to player
     */
    applyKnockback(dirX: number, dirY: number, force: number) {
        this.knockback.x += dirX * force;
        this.knockback.y += dirY * force;
    }

    update(dt: number) {
        let moveDir: Vector2 = { x: 0, y: 0 };

        // WASD Input
        const axis = input.getAxis();
        if (axis.x !== 0 || axis.y !== 0) {
            moveDir = normalize(axis);
        }
        // Mouse Movement (if holding click)
        else if (input.isMouseDown) {
            const centerScreen = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const dirToMouse = {
                x: input.mousePos.x - centerScreen.x,
                y: input.mousePos.y - centerScreen.y
            };

            if (distance({ x: 0, y: 0 }, dirToMouse) > 10) {
                moveDir = normalize(dirToMouse);
            }
        }

        this.pulseClock += dt;
        this.isMoving = moveDir.x !== 0 || moveDir.y !== 0;
        if (this.isMoving) this.animTimer += dt;
        if (moveDir.x !== 0) this.facingLeft = moveDir.x < 0;

        // Apply movement
        let moveX = moveDir.x * this.speed * this.stats.moveSpeed;
        let moveY = moveDir.y * this.speed * this.stats.moveSpeed;

        // Add knockback
        moveX += this.knockback.x;
        moveY += this.knockback.y;

        this.pos.x += moveX * dt;
        this.pos.y += moveY * dt;

        // Decay knockback (friction)
        const knockbackDecay = 0.85;
        this.knockback.x *= knockbackDecay;
        this.knockback.y *= knockbackDecay;

        if (Math.abs(this.knockback.x) < 1) this.knockback.x = 0;
        if (Math.abs(this.knockback.y) < 1) this.knockback.y = 0;

        // Regen
        if (this.stats.regen > 0 && this.hp < this.maxHp) {
            this.hp += this.stats.regen * dt;
            if (this.hp > this.maxHp) this.hp = this.maxHp;
        }

        // Update invulnerability timer
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer -= dt;
        }
        if (this.contactTimer > 0) {
            this.contactTimer -= dt;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Shadow
        ctx.beginPath();
        ctx.ellipse(0, 10, 10, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Apply flashing effect if invulnerable
        if (this.invulnerabilityTimer > 0) {
            // Oscillate alpha between 0.3 and 1.0 using sine wave
            const flashSpeed = 15; // How fast the flashing occurs
            const alpha = 0.65 + 0.35 * Math.sin(this.invulnerabilityTimer * flashSpeed);
            ctx.globalAlpha = alpha;
        }

        // Procedural pixel sprite (astronaut tinted by class)
        const frame = this.isMoving ? Math.floor(this.animTimer * 8) % 2 : 0;
        const sprite = sprites.getPlayerSprite(this.className, frame);
        const height = this.radius * 2.6;
        const width = height * (sprite.width / sprite.height);
        const bob = this.isMoving ? Math.sin(this.animTimer * 16) * 1.2 : 0;

        // Contact damage has no i-frame flash to read, so a red ring pulses
        // under the player while enemies are on them — otherwise HP just
        // drains with no visible cause.
        if (this.contactTimer > 0) {
            const pulse = 0.55 + 0.45 * Math.sin(this.pulseClock * 26);
            ctx.beginPath();
            ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 48, 68, ${0.35 + 0.4 * pulse})`;
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        ctx.imageSmoothingEnabled = false;
        if (this.facingLeft) ctx.scale(-1, 1);
        ctx.drawImage(sprite, -width / 2, -height / 2 + bob, width, height);
        if (this.facingLeft) ctx.scale(-1, 1);

        ctx.globalAlpha = 1.0; // Reset alpha

        // Draw Line to cursor if mouse down
        if (input.isMouseDown) {
            const mouseWorld = {
                x: input.mousePos.x + camera.x,
                y: input.mousePos.y + camera.y
            };

            ctx.beginPath();
            ctx.moveTo(0, 0); // Relative to player
            ctx.lineTo(mouseWorld.x - this.pos.x, mouseWorld.y - this.pos.y);
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.3)';
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    /**
     * A discrete hit: meteors, rift collapses, boss slams. Grants i-frames so a
     * single event cannot chain-hit, and floors at 1 so a hazard always stings.
     *
     * Enemy contact does NOT go through here — see takeContactDamage.
     */
    takeDamage(amount: number) {
        // Check if player is currently invulnerable
        if (this.invulnerabilityTimer > 0) {
            return; // No damage taken
        }

        const damage = Math.max(1, amount - this.stats.armor);
        this.hp -= damage;

        // Activate invulnerability
        this.invulnerabilityTimer = this.invulnerabilityDuration;

        if (this.hp <= 0) {
            this.isDead = true;
        }
    }

    /**
     * Continuous damage from enemies pressed against the player, in HP/second.
     * No i-frames: they would cap crowd damage at 1/invulnerabilityDuration
     * regardless of how many enemies are biting, which is what used to make
     * standing in a swarm free. Armor is already applied by the caller
     * (core/ContactDamage) per enemy, not here.
     */
    takeContactDamage(dps: number, dt: number) {
        if (dps <= 0) return;

        this.hp -= dps * dt;
        this.contactTimer = 0.12; // drives the "being chewed" tint in draw()

        if (this.hp <= 0) {
            this.hp = 0;
            this.isDead = true;
        }
    }

    gainXp(amount: number) {
        this.xp += amount * this.stats.growth;
        if (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.xp -= this.nextLevelXp;

        // XP curve: gentle-exponential with a flat term.
        // Old curve (1/2/3/5/8 then ×1.15) spammed level-ups in the first
        // minute and then compounded past XP income. This one starts at 4 and
        // grows ~×1.1 + 6 per level: 4, 10, 17, 25, 33, 42, 52, 63, 75, 88 …
        // — a steady cadence instead of a burst followed by a drought.
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.1 + 6);

        this.onLevelUp();
    }
}

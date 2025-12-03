import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import { input } from '../core/Input';
import { Weapon } from '../Weapon';

export class Player extends Entity {
    speed: number = 200;
    hp: number = 100;
    maxHp: number = 100;
    xp: number = 0;
    level: number = 1;
    nextLevelXp: number = 1; // First level requires 1 crystal

    weapons: Weapon[] = [];

    // Invulnerability system
    invulnerabilityTimer: number = 0;
    invulnerabilityDuration: number = 0.5;

    // Weapon speed boost system
    weaponSpeedBoost: number = 1;
    weaponSpeedBoostTimer: number = 0;

    // Stats modifiers
    stats = {
        might: 1,
        area: 1,
        cooldown: 1,
        speed: 1, // Projectile speed
        duration: 1,
        amount: 0,
        moveSpeed: 1,
        magnet: 100,
        luck: 1,
        growth: 1,
        greed: 1,
        armor: 0,
        regen: 0,
        critChance: 0.05,
        critDamage: 1.5,
        tick: 0, // Reduces zone weapon damage interval
        timeSpeed: 1 // Global time multiplier for weapon cooldowns
    };

    className: string = "Survivor";
    classEmoji: string = "🧑‍🚀";

    onLevelUp: () => void = () => { };

    constructor(x: number, y: number) {
        super(x, y, 15);
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

        this.pos.x += moveDir.x * this.speed * this.stats.moveSpeed * dt;
        this.pos.y += moveDir.y * this.speed * this.stats.moveSpeed * dt;

        // Regen
        if (this.stats.regen > 0 && this.hp < this.maxHp) {
            this.hp += this.stats.regen * dt;
            if (this.hp > this.maxHp) this.hp = this.maxHp;
        }

        // Update invulnerability timer
        if (this.invulnerabilityTimer > 0) {
            this.invulnerabilityTimer -= dt;
        }

        // Update weapon speed boost timer
        if (this.weaponSpeedBoostTimer > 0) {
            this.weaponSpeedBoostTimer -= dt;
            if (this.weaponSpeedBoostTimer <= 0) {
                this.weaponSpeedBoost = 1;
            }
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

        // Body (Emoji)
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.classEmoji, 0, 0);

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

    gainXp(amount: number) {
        this.xp += amount * this.stats.growth;
        if (this.xp >= this.nextLevelXp) {
            this.levelUp();
        }
    }

    levelUp() {
        this.level++;
        this.xp -= this.nextLevelXp;

        // XP curve: Slower progression
        // level 1→2 = 1, level 2→3 = 2, level 3→4 = 3, level 4→5 = 5, level 5→6 = 8, then 1.15x multiplier
        if (this.level === 2) {
            this.nextLevelXp = 2;
        } else if (this.level === 3) {
            this.nextLevelXp = 3;
        } else if (this.level === 4) {
            this.nextLevelXp = 5;
        } else if (this.level === 5) {
            this.nextLevelXp = 8;
        } else {
            // Slower scaling after level 5
            this.nextLevelXp = Math.floor(this.nextLevelXp * 1.15);
        }

        this.onLevelUp();
    }

    activateWeaponSpeedBoost(duration: number = 10, multiplier: number = 10) {
        this.weaponSpeedBoost = multiplier;
        this.weaponSpeedBoostTimer = duration;
    }

    getDamage(baseDamage: number): { damage: number, isCrit: boolean } {
        const isCrit = Math.random() < this.stats.critChance;
        const multiplier = this.stats.might * (isCrit ? this.stats.critDamage : 1);
        return {
            damage: baseDamage * multiplier,
            isCrit: isCrit
        };
    }
}

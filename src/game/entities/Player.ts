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
    nextLevelXp: number = 10;

    weapons: Weapon[] = [];

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
        critDamage: 1.5
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
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Shadow
        ctx.beginPath();
        ctx.ellipse(0, 10, 10, 5, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Body (Emoji)
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.classEmoji, 0, 0);

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
        const damage = Math.max(1, amount - this.stats.armor);
        this.hp -= damage;
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
        this.nextLevelXp = Math.floor(this.nextLevelXp * 1.2);
        this.onLevelUp();
    }
}

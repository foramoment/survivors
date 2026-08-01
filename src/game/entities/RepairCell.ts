import { Entity } from '../Entity';
import { type Vector2, normalize, distance } from '../core/Utils';
import { REPAIR_HEAL, REPAIR_LIFETIME } from '../core/Tactics';

/**
 * A repair cell dropped by Vital Siphon.
 *
 * Healing is the one thing that can undo the whole game — a regen stack big
 * enough and standing in a crowd becomes free again. This is healing you have
 * to *go and get*: it sits where the enemy died, it expires, and the magnet
 * does not pull it, so topping up always means moving through the fight.
 * Flat HP on purpose, so it fades in relevance as max HP grows.
 */
export class RepairCell extends Entity {
    heal: number = REPAIR_HEAL;
    lifetime: number = REPAIR_LIFETIME;
    private pulse: number = Math.random() * Math.PI * 2;

    constructor(x: number, y: number) {
        super(x, y, 9);
    }

    update(dt: number, playerPos?: Vector2) {
        this.lifetime -= dt;
        if (this.lifetime <= 0) this.isDead = true;
        this.pulse += dt * 5;

        // A short final drift so a cell that expires next to you is not simply
        // lost — but nothing like the XP magnet's reach
        if (playerPos) {
            const dist = distance(this.pos, playerPos);
            if (dist < 60) {
                const dir = normalize({ x: playerPos.x - this.pos.x, y: playerPos.y - this.pos.y });
                const pull = 120 * (1 - dist / 60);
                this.pos.x += dir.x * pull * dt;
                this.pos.y += dir.y * pull * dt;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Blink out over the last two seconds so an expiring cell is readable
        const expiring = this.lifetime < 2 && Math.sin(this.lifetime * 18) < 0;
        ctx.globalAlpha = expiring ? 0.3 : 1;

        const bob = Math.sin(this.pulse) * 2;
        const glow = ctx.createRadialGradient(0, bob, 0, 0, bob, 16);
        glow.addColorStop(0, 'rgba(255, 90, 130, 0.55)');
        glow.addColorStop(1, 'rgba(255, 90, 130, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, bob, 16, 0, Math.PI * 2);
        ctx.fill();

        // Chunky pixel med-cell: dark casing, bright cross
        ctx.fillStyle = '#2a0713';
        ctx.fillRect(-7, bob - 7, 14, 14);
        ctx.fillStyle = '#ff3a68';
        ctx.fillRect(-6, bob - 6, 12, 12);
        ctx.fillStyle = '#ffe3ea';
        ctx.fillRect(-1.5, bob - 4, 3, 8);
        ctx.fillRect(-4, bob - 1.5, 8, 3);

        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

/**
 * VOID BOLT — the Void Walker's gun.
 *
 * This weapon has been rebuilt twice, and both previous versions failed the
 * same test for opposite reasons. A straight beam that hit everything on a line
 * was mechanically fine and completely inert to watch. The swept lance that
 * replaced it was the most intricate thing in the pool — lock on, drag the
 * burning end through the crowd, three zigzags when evolved — and the user's
 * verdict was that it dealt good damage and never once felt good.
 *
 * The thing both missed: this is the **first class in the list**. It is what a
 * new player picks, and its job is to teach the game — point at things, watch
 * them die, understand why. A gun is the correct answer to that, and "boring on
 * paper" is not the same as "boring in the hand".
 *
 * So: a fast bolt that punches through a couple of bodies and tears a small rip
 * in space where it finally stops. The rip is the only exotic part, and it is
 * there because the Void Walker should leave holes behind — it pulls weakly and
 * grinds, which is what makes lining up a shot down a column worth doing.
 *
 * Evolved — Void Volley: three bolts in a tight fan, deeper punch-through, and
 * a rip big enough to matter.
 */
import { ProjectileWeapon, Projectile, Zone, type ProjectileParams } from '../base';
import type { Entity } from '../../../engine/Entity';
import type { HitResult } from '../../core/CollisionSystem';
import type { Player } from '../../entities/Player';
import { type Vector2, distance, normalize } from '../../../engine/Utils';
import { levelSpatialHash } from '../../../engine/SpatialHash';
import { particles } from '../../../engine/ParticleSystem';
import { juice } from '../../../engine/JuiceSystem';

/** How far the weapon looks for something to shoot */
const RANGE = 520;

// ============================================
// VOID RIP - the hole a spent bolt leaves
// ============================================

/**
 * A small tear that drags what is near it and grinds for a little. It exists so
 * that where the bolt *stops* matters, which is the only thing turning "aim at
 * the nearest enemy" into a position you can read.
 */
export class VoidRip extends Zone {
    pullStrength: number = 140;
    private spin: number = Math.random() * Math.PI * 2;
    private readonly maxDuration: number;

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.35, '');
        this.maxDuration = duration;
        this.growOver(0.45, 1);
    }

    update(dt: number) {
        super.update(dt);
        this.spin += dt * 3;

        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, this.radius)) {
            const dist = distance(this.pos, enemy.pos);
            if (dist > this.radius || dist < 1 || enemy.isBoss) continue;
            const pull = (this.pullStrength / dist) * dt;
            enemy.pos.x += ((this.pos.x - enemy.pos.x) / dist) * pull;
            enemy.pos.y += ((this.pos.y - enemy.pos.y) / dist) * pull;
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        const fade = Math.max(0, Math.min(1, this.duration / (this.maxDuration * 0.5)));
        if (fade <= 0) return;

        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.scale(this.growScale, this.growScale);

        // No outline — a haze around a genuinely black centre, same rule as
        // every other zone in the game
        const haze = ctx.createRadialGradient(0, 0, 0, 0, 0, this.baseRadius);
        haze.addColorStop(0, `rgba(0, 0, 0, ${0.85 * fade})`);
        haze.addColorStop(0.45, `rgba(90, 30, 170, ${0.5 * fade})`);
        haze.addColorStop(1, 'rgba(120, 60, 220, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = haze;
        ctx.fill();

        // Matter falling in, as points rather than a stroked spiral
        ctx.fillStyle = `rgba(210, 140, 255, ${0.8 * fade})`;
        for (let i = 0; i < 6; i++) {
            const a = this.spin + (i / 6) * Math.PI * 2;
            const r = this.baseRadius * (0.55 + 0.3 * Math.sin(this.spin * 1.7 + i));
            ctx.fillRect(Math.cos(a) * r - 1.5, Math.sin(a) * r - 1.5, 3, 3);
        }

        ctx.restore();
    }
}

// ============================================
// VOID BOLT - the projectile
// ============================================

export class VoidBolt extends Projectile {
    /** Called where the bolt finally stops, if it hit anything at all */
    onSpent?: (x: number, y: number) => void;

    /**
     * Where the bolt last bit into something.
     *
     * The rip used to be torn wherever the bolt *died*, which includes running
     * out of flight time over empty floor — and that inverted the whole weapon.
     * On an easy stage the bolt punches clean through everything, keeps flying,
     * and drops its rip in a random patch of nothing; on a hard stage it runs
     * out of pierce inside the pack and drops the rip right on the crowd.
     *
     * So the weapon was **at its best when it failed to do the thing it is
     * named after**, which a play report caught before any test did: "the only
     * weapon that one-shots things on the Station, and it works because the
     * bolt cannot get through".
     *
     * Anchoring to the last body hit fixes the incentive: punching through more
     * enemies now moves the rip further INTO the pack instead of past it, and a
     * shot that connects with nothing leaves nothing behind.
     */
    private lastBite: Vector2 | null = null;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 7;
    }

    handleHit(enemy: Entity): HitResult {
        this.lastBite = { x: enemy.pos.x, y: enemy.pos.y };
        return super.handleHit(enemy);
    }

    protected onDeath(): void {
        if (!this.lastBite) return;
        this.onSpent?.(this.lastBite.x, this.lastBite.y);
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));

        // A stretched slug: the streak is what reads as speed at a glance
        ctx.fillStyle = '#3d1a6e';
        ctx.fillRect(-18, -3.5, 24, 7);
        ctx.fillStyle = '#a95cff';
        ctx.fillRect(-12, -2.5, 18, 5);
        ctx.fillStyle = '#f2e0ff';
        ctx.fillRect(-1, -2, 8, 4);

        ctx.restore();
    }
}

export class VoidRayWeapon extends ProjectileWeapon {
    name = "Void Bolt";
    emoji = "🔫";
    description = "Punches through a column and tears a rip where it stops.";
    projectileEmoji = "";
    pierce = 2;

    readonly stats = {
        damage: 34,
        cooldown: 1.1,
        area: 46,      // rip radius
        speed: 620,
        duration: 0.9, // flight time
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
        this.area = this.stats.area;
        this.speed = this.stats.speed;
        this.duration = this.stats.duration;
    }

    /** Bolts per shot: one, three when evolved */
    private boltCount(): number {
        return this.evolved ? 3 : 1;
    }

    /** Bodies a bolt punches through: +1 every second level */
    private punchThrough(): number {
        return this.pierce + Math.floor((this.level - 1) / 2) + (this.evolved ? 2 : 0);
    }

    update(dt: number) {
        this.cooldown -= dt;
        if (this.cooldown > 0) return;

        const target = this.findClosestEnemy(RANGE);
        if (!target) return;

        const dir = normalize({
            x: target.pos.x - this.owner.pos.x,
            y: target.pos.y - this.owner.pos.y,
        });
        const aim = Math.atan2(dir.y, dir.x);
        const count = this.boltCount();
        const speed = this.speed * this.owner.stats.speed;

        for (let i = 0; i < count; i++) {
            // A tight fan, not a shotgun: the volley should still read as one
            // shot going one way
            const angle = aim + (i - (count - 1) / 2) * 0.13;
            const bolt = new VoidBolt(
                this.owner.pos.x, this.owner.pos.y,
                { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
                this.duration * this.owner.stats.duration,
                this.damage,
                this.punchThrough(),
            );
            bolt.source = this;
            bolt.onSpent = (x, y) => this.tearRip(x, y);
            this.onSpawn(bolt);
        }

        particles.emitHit(this.owner.pos.x, this.owner.pos.y, '#a95cff');
        this.cooldown = this.baseCooldown * this.owner.stats.cooldown;
    }

    /** ProjectileWeapon's factory is unused — update() fires the fan itself */
    protected createProjectile(params: ProjectileParams): Projectile {
        return new VoidBolt(
            params.x, params.y, params.velocity,
            params.duration, params.damage, params.pierce,
        );
    }

    private tearRip(x: number, y: number) {
        const radius = this.area * this.owner.stats.area * (this.evolved ? 1.5 : 1);
        const rip = new VoidRip(
            x, y,
            radius,
            (this.evolved ? 1.6 : 1.1) * this.owner.stats.duration,
            this.damage * 0.22,
        );
        rip.source = this;
        this.onSpawn(rip);
        juice.shockwave(x, y, radius * 1.3, '#a95cff', 0.22, 3);
    }
}

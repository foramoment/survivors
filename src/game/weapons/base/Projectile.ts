/**
 * BASE PROJECTILE CLASSES
 * Extracted from WeaponTypes.ts for better AI context management.
 */
import { Entity } from '../../../engine/Entity';
import type { Weapon } from '../../Weapon';
import { type Vector2, normalize, distance } from '../../../engine/Utils';
import { particles } from '../../../engine/ParticleSystem';
import { levelSpatialHash } from '../../../engine/SpatialHash';
import { damageSystem } from '../../core/DamageSystem';
import { sprites, type ThrownKind } from '../../core/SpriteFactory';

// ============================================
// PROJECTILE - Base class for all flying entities
// ============================================

import { type HitResult } from '../../core/CollisionSystem';

export class Projectile extends Entity {
    velocity: Vector2;
    duration: number;
    damage: number;
    pierce: number;
    emoji: string;
    canCollide: boolean = true;
    source?: Weapon;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number, emoji: string) {
        super(x, y, 5);
        this.velocity = velocity;
        this.duration = duration;
        this.damage = damage;
        this.pierce = pierce;
        this.emoji = emoji;
    }

    update(dt: number) {
        this.pos.x += this.velocity.x * dt;
        this.pos.y += this.velocity.y * dt;
        this.duration -= dt;
        if (this.duration <= 0) {
            this.kill();
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        // Procedural pixel orb tinted by weapon, rotated to flight direction
        ctx.rotate(Math.atan2(this.velocity.y, this.velocity.x));
        const sprite = sprites.getProjectileSprite(this.emoji);
        const size = Math.max(14, this.radius * 3);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();
    }

    /**
     * Handle a collision with an enemy.
     * Override in subclasses for custom behavior (bouncing, piercing, etc.)
     * @returns HitResult with damage and whether to continue checking
     */
    handleHit(_enemy: Entity): HitResult {
        this.pierce--;
        if (this.pierce < 0) {
            this.kill();
        }
        return {
            damage: this.damage,
            continueChecking: !this.isDead
        };
    }

    /**
     * Kill the projectile, triggering onDeath hook.
     * Safe to call multiple times.
     */
    kill(): void {
        if (!this.isDead) {
            this.isDead = true;
            this.onDeath();
        }
    }

    /**
     * Hook called when projectile dies.
     * Override in subclasses for explosion effects, spawning zones, etc.
     */
    protected onDeath(): void {
        // Base implementation does nothing
    }
}

// ============================================
// BOUNCING PROJECTILE - For ricochet weapons
// ============================================
export class BouncingProjectile extends Projectile {
    bouncesLeft: number;
    maxBounceRange: number;
    hitEnemies: Set<any> = new Set();
    onBounce: (projectile: BouncingProjectile, enemies: any[]) => void = () => { };

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, bounces: number, emoji: string, bounceRange: number = 300) {
        super(x, y, velocity, duration, damage, 0, emoji);
        this.bouncesLeft = bounces;
        this.maxBounceRange = bounceRange;
    }

    canHit(enemy: any): boolean {
        return !this.hitEnemies.has(enemy);
    }

    markHit(enemy: any) {
        this.hitEnemies.add(enemy);
    }

    bounce(newTarget: Vector2) {
        const dir = normalize({
            x: newTarget.x - this.pos.x,
            y: newTarget.y - this.pos.y
        });
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        this.velocity = { x: dir.x * speed, y: dir.y * speed };
        this.bouncesLeft--;
    }

    /**
     * Override handleHit for bouncing behavior.
     * Returns 0 damage if enemy was already hit.
     */
    handleHit(enemy: Entity): HitResult {
        // Skip if already hit this enemy
        if (!this.canHit(enemy)) {
            return { damage: 0, continueChecking: true };
        }

        this.markHit(enemy);

        // Try to bounce to next target
        if (this.bouncesLeft > 0) {
            const nearbyEnemies = levelSpatialHash.getWithinRadius(this.pos, this.maxBounceRange);
            let nearestEnemy: Entity | null = null;
            let minDist = this.maxBounceRange;

            for (const target of nearbyEnemies) {
                if (this.canHit(target)) {
                    const d = distance(this.pos, target.pos);
                    if (d < minDist) {
                        minDist = d;
                        nearestEnemy = target;
                    }
                }
            }

            if (nearestEnemy) {
                this.bounce(nearestEnemy.pos);
            } else {
                this.kill(); // No more targets
            }
        } else {
            this.kill(); // No bounces left
        }

        return {
            damage: this.damage,
            continueChecking: false // Don't check more enemies this frame
        };
    }
}

// ============================================
// SINGULARITY PROJECTILE - Pulls enemies in
// ============================================

/**
 * Reel a body toward `center` and hold it on the shell of radius `hold`.
 *
 * The shell is a wall from *both* sides: something outside is dragged in,
 * something inside is pushed back out to it. That second half is what makes the
 * middle of a black hole a place the player can stand — the eye is not an
 * immunity rule, it is simply empty, because nothing is allowed to cross the
 * horizon. A rule would have to argue with core/ContactDamage; geometry does
 * not.
 *
 * Movement is capped at `speed` in both directions rather than snapped, so the
 * pocket visibly opens instead of teleporting the crowd off the player.
 */
export function holdOnShell(enemy: any, center: Vector2, hold: number, speed: number, dt: number) {
    const dx = center.x - enemy.pos.x;
    const dy = center.y - enemy.pos.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;

    if (dist < 0.001) {
        // Dead centre: no direction to work with, so pick one and shove
        enemy.pos.x += Math.min(step, hold);
        return;
    }

    const nx = dx / dist;
    const ny = dy / dist;
    const move = Math.min(step, Math.abs(dist - hold)) * (dist > hold ? 1 : -1);
    enemy.pos.x += nx * move;
    enemy.pos.y += ny * move;
}

/**
 * The travelling singularity: a hard core inside a wide field of gravity.
 *
 * It is drawn as two things — a black disc and a halo around it — so it should
 * *behave* as two things, and it did not: the whole 200px pull radius was inert
 * and only the tiny collision circle mattered, so the orb read as a slow bullet
 * with a decorative glow. Now:
 *
 *   - the **core** is the event horizon. Passing it through a body is the big
 *     hit, and it lands once per enemy — the orb crawls, so a per-frame check
 *     would tick the same enemy a dozen times on the way through.
 *   - the **halo** captures everything it touches: a caught body stops walking
 *     and is reeled onto the core, so steering the orb through a pack is how
 *     you gather one, not just how you damage it.
 */
export class SingularityProjectile extends Projectile {
    private particleTimer: number = 0;
    private rotation: number = 0;
    /**
     * How fast a caught body is reeled in, in px/s.
     *
     * This used to be `pullStrength / dist` — a force, not a speed — and the
     * numbers made the whole field inert: 200 across a 150px gap is 1.3 px/s
     * against an enemy walking at 100. The gravity was drawn, documented and
     * doing nothing, which is exactly the "the black hole doesn't really suck
     * them in" complaint. Anything that moves a crowd has to be quoted in the
     * same unit the crowd moves in.
     */
    captureSpeed: number = 240;
    /** Reach of the gravity field, as a multiple of the core radius */
    pullRadiusScale: number = 4;
    /** Share of `damage` the field deals on each grind tick */
    fieldDamageShare: number = 0.18;
    /** Seconds between grind ticks */
    fieldInterval: number = 0.4;

    private fieldTimer: number = 0;
    /** Bodies the core has already torn through */
    private cored: Set<any> = new Set();
    /**
     * Everything the field has ever touched, for as long as the field lives.
     *
     * Capture is one-way on purpose: a body that brushed the rim is cargo from
     * that moment, even if a knockback throws it back out. Re-checking the
     * radius every frame would let the crowd leak out of the far side of a hole
     * that is still open, and "it grabbed them and then let half of them go" is
     * the version that reads as a weapon that does not work.
     */
    private captured: Set<any> = new Set();

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 20;
        // All of this weapon's damage is resolved in update(), by region. The
        // collision system would otherwise land a third hit of its own on
        // whatever touched the core.
        this.canCollide = false;
    }

    /** How far the gravity field reaches */
    get pullRadius(): number {
        return this.radius * this.pullRadiusScale;
    }

    /** Where the caught are held. For the travelling orb that is the core itself. */
    protected get holdRadius(): number {
        return this.radius;
    }

    /** Loose crystals inside the field are gathered too — see CrystalField */
    get crystalPull(): number {
        return this.pullRadius;
    }

    update(dt: number) {
        super.update(dt);
        this.rotation += dt * 3;

        this.particleTimer += dt;
        if (this.particleTimer > 0.08) {
            this.particleTimer = 0;
            particles.emitSingularityDistortion(this.pos.x, this.pos.y, this.radius);
        }

        this.fieldTimer -= dt;
        const grinds = this.fieldTimer <= 0;
        if (grinds) this.fieldTimer = this.fieldInterval;

        const reach = this.pullRadius;
        for (const enemy of levelSpatialHash.getWithinRadius(this.pos, reach)) {
            if (enemy.isDead) continue;
            const dist = distance(this.pos, enemy.pos);
            if (dist > reach) continue;

            // Bosses are not cargo. They still take everything the field deals,
            // they just cannot be parked — a weapon on a cooldown is not
            // allowed to hold the fight's one big body still.
            if (!enemy.isBoss) this.captured.add(enemy);

            // Core: the payoff hit, once per body
            if (dist <= this.radius + enemy.radius && !this.cored.has(enemy)) {
                this.cored.add(enemy);
                damageSystem.dealDamage({
                    baseDamage: this.damage,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos,
                });
                particles.emitHit(enemy.pos.x, enemy.pos.y, '#c07bff');
                continue;
            }

            // Halo: a slow grind on everything the gravity has hold of
            if (grinds) {
                damageSystem.dealDamage({
                    baseDamage: this.damage * this.fieldDamageShare,
                    source: this.source,
                    target: enemy,
                    position: enemy.pos,
                });
            }
        }

        this.reelIn(dt);
    }

    /**
     * Drag the caught onto the shell, wherever they have been pushed to.
     *
     * Walked over the capture set rather than over a radius query, so a body
     * knocked out of the field is still on its way back in.
     */
    protected reelIn(dt: number) {
        for (const enemy of this.captured) {
            if (enemy.isDead) {
                this.captured.delete(enemy);
                continue;
            }
            // Not a stun: no recovery window, no immunity, no diminishing
            // returns (see core/StatusEffects for why those exist). Gravity has
            // them; it lets go when the field dies. GameManager resets
            // speedMultiplier every frame before entities update, so this needs
            // no cleanup of its own.
            enemy.speedMultiplier = 0;
            holdOnShell(enemy, this.pos, this.holdRadius, this.captureSpeed, dt);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // The gravity field, drawn as a haze that reaches exactly as far as it
        // pulls — the ring it replaced stopped at half the real reach, so half
        // the field was invisible
        const halo = ctx.createRadialGradient(0, 0, this.radius * 0.8, 0, 0, this.pullRadius);
        halo.addColorStop(0, 'rgba(120, 40, 220, 0.28)');
        halo.addColorStop(0.55, 'rgba(90, 20, 180, 0.14)');
        halo.addColorStop(1, 'rgba(60, 0, 140, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.pullRadius, 0, Math.PI * 2);
        ctx.fillStyle = halo;
        ctx.fill();

        ctx.rotate(this.rotation);
        for (let i = 0; i < 4; i++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.arc(this.radius * 0.5, 0, 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(150, 50, 255, 0.6)`;
            ctx.fill();
        }
        ctx.rotate(-this.rotation);

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(20, 0, 40, 1)');
        gradient.addColorStop(0.5, 'rgba(60, 0, 120, 0.8)');
        gradient.addColorStop(1, 'rgba(100, 50, 200, 0.3)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#8800ff';
        ctx.shadowBlur = 20;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 200, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 0.7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// PLASMA PROJECTILE - Explodes on death
// ============================================
export class PlasmaProjectile extends Projectile {
    private particleTimer: number = 0;
    onExplosion?: (x: number, y: number) => void;

    constructor(x: number, y: number, velocity: Vector2, duration: number, damage: number, pierce: number) {
        super(x, y, velocity, duration, damage, pierce, '');
        this.radius = 15;
    }

    update(dt: number) {
        super.update(dt);

        this.particleTimer += dt;
        if (this.particleTimer > 0.05) {
            this.particleTimer = 0;
            particles.emitPlasmaEnergy(this.pos.x, this.pos.y);
        }
    }

    protected onDeath(): void {
        if (this.onExplosion) {
            this.onExplosion(this.pos.x, this.pos.y);
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 255, 100, 0.2)';
        ctx.shadowColor = '#00ff00';
        ctx.shadowBlur = 20;
        ctx.fill();

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, 'rgba(200, 255, 200, 1)');
        gradient.addColorStop(0.4, 'rgba(100, 255, 100, 0.9)');
        gradient.addColorStop(1, 'rgba(0, 200, 50, 0.5)');

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        const time = Date.now() / 100;
        for (let i = 0; i < 4; i++) {
            const angle = time + i * Math.PI / 2;
            const sparkX = Math.cos(angle) * this.radius * 0.6;
            const sparkY = Math.sin(angle) * this.radius * 0.6;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
        }

        ctx.shadowBlur = 0;
        ctx.restore();
    }
}

// ============================================
// ORBITING PROJECTILE - Orbits around owner
// ============================================
export class OrbitingProjectile extends Projectile {
    angle: number = 0;
    distance: number;
    speed: number;
    owner: any;

    constructor(owner: any, distance: number, speed: number, duration: number, damage: number, emoji: string) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, duration, damage, 999, emoji);
        this.owner = owner;
        this.distance = distance;
        this.speed = speed;
        this.canCollide = true;
    }

    update(dt: number) {
        this.angle += this.speed * dt;
        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * this.distance;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * this.distance;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

// ============================================
// LOBBED PROJECTILE - For grenades/flasks
// ============================================
export class LobbedProjectile extends Projectile {
    targetPos: Vector2;
    startPos: Vector2;
    totalDuration: number;
    height: number = 50;
    onLand: (x: number, y: number) => void = () => { };

    /** Body colour of the canister and its landing marker */
    color: string = '#3ddc6e';
    /**
     * What is being thrown. Drives the sprite and how it tumbles — a fused
     * grenade spins end over end, a flask of acid wobbles because you do not
     * want to drop it. They shared one sprite until now, so a lob of acid and a
     * lob of plasma were indistinguishable in the air.
     */
    kind: ThrownKind = 'grenade';
    /** Seconds before the throw actually starts (staggered volleys) */
    delay: number = 0;
    private spin: number = 0;
    private progress: number = 0;

    constructor(x: number, y: number, target: Vector2, duration: number, emoji: string) {
        super(x, y, { x: 0, y: 0 }, duration, 0, 0, emoji);
        this.startPos = { x, y };
        this.targetPos = { ...target };
        this.totalDuration = duration;
        this.canCollide = false;
    }

    update(dt: number) {
        if (this.delay > 0) {
            this.delay -= dt;
            return;
        }

        this.duration -= dt;
        this.spin += dt * (this.kind === 'grenade' ? 7 : 2.4);
        const t = 1 - (this.duration / this.totalDuration);
        this.progress = t;

        if (t >= 1) {
            this.isDead = true;
            this.onLand(this.targetPos.x, this.targetPos.y);
            return;
        }

        this.pos.x = this.startPos.x + (this.targetPos.x - this.startPos.x) * t;
        this.pos.y = this.startPos.y + (this.targetPos.y - this.startPos.y) * t;

        const yOffset = 4 * this.height * t * (1 - t);
        this.pos.y -= yOffset;
    }

    /**
     * A thrown object needs three readable parts: where it is, where it will
     * land, and how long you have. Shadow + marker ring do the last two.
     */
    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        if (this.delay > 0) return;

        const t = this.progress;
        const groundX = this.startPos.x + (this.targetPos.x - this.startPos.x) * t - camera.x;
        const groundY = this.startPos.y + (this.targetPos.y - this.startPos.y) * t - camera.y;
        const lift = 4 * this.height * t * (1 - t);

        ctx.save();

        // Landing marker closing in on the impact point
        ctx.globalAlpha = 0.35 + 0.35 * t;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
            this.targetPos.x - camera.x,
            this.targetPos.y - camera.y,
            14 + (1 - t) * 16,
            0, Math.PI * 2
        );
        ctx.stroke();

        // Shadow shrinks as the grenade rises
        const shadowScale = 1 - lift / (this.height * 2.4);
        ctx.globalAlpha = 0.35 * shadowScale;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.ellipse(groundX, groundY, 8 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // The thrown object itself. A flask tumbles gently rather than
        // spinning, so it stays readable as a flask all the way down.
        ctx.globalAlpha = 1;
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);
        ctx.rotate(this.kind === 'grenade' ? this.spin : Math.sin(this.spin) * 0.5);
        ctx.imageSmoothingEnabled = false;
        const sprite = sprites.getThrownSprite(this.kind, this.color);
        const size = 22;
        ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
        ctx.restore();

        // Only a grenade has a fuse to blink; on a flask the same dot read as
        // an unexplained status pip
        if (this.kind === 'grenade' && Math.sin(t * t * 60) > 0) {
            ctx.save();
            ctx.fillStyle = '#ffe14d';
            ctx.fillRect(this.pos.x - camera.x - 2, this.pos.y - camera.y - 10, 4, 4);
            ctx.restore();
        }
    }
}

// ============================================
// NANOBOT - Swirling orbit projectile
// ============================================
export class Nanobot extends Projectile {
    owner: any;
    angle: number;
    distance: number;
    rotationSpeed: number;

    constructor(owner: any, distance: number, angle: number, duration: number, damage: number) {
        super(owner.pos.x, owner.pos.y, { x: 0, y: 0 }, duration, damage, 999, '🦠');
        this.owner = owner;
        this.distance = distance;
        this.angle = angle;
        this.rotationSpeed = 2;
        this.canCollide = true;
    }

    update(dt: number) {
        this.angle += this.rotationSpeed * dt;
        const currentDist = this.distance + Math.sin(Date.now() / 200) * 20;

        this.pos.x = this.owner.pos.x + Math.cos(this.angle) * currentDist;
        this.pos.y = this.owner.pos.y + Math.sin(this.angle) * currentDist;

        this.duration -= dt;
        if (this.duration <= 0) this.isDead = true;
    }
}

// Re-export utilities used by projectiles
export { normalize, distance };

/**
 * SPINNING EMBER WEAPON
 * Fireballs that orbit around the player.
 * 
 * Evolved: Inferno Lash - Leaves burning trails
 */
import { Weapon } from '../../Weapon';
import type { Player } from '../../entities/Player';
import { OrbitingProjectile } from '../base';
import { Zone } from '../base';
import { type Vector2, distance } from '../../core/Utils';
import { particles } from '../../core/ParticleSystem';
import { damageSystem } from '../../core/DamageSystem';
import { levelSpatialHash } from '../../core/SpatialHash';

// ============================================
// BURNING TRAIL ZONE - Fire damage zone left by Inferno Lash
// ============================================
export class BurningTrailZone extends Zone {
    private flameTimer: number = 0;
    private flames: { x: number; y: number; scale: number; speed: number }[] = [];

    constructor(x: number, y: number, radius: number, duration: number, damage: number) {
        super(x, y, radius, duration, damage, 0.3, '');

        // Create flame particles
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * radius * 0.6;
            this.flames.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                scale: 0.5 + Math.random() * 0.5,
                speed: 1 + Math.random() * 2
            });
        }
    }

    update(dt: number) {
        super.update(dt);
        this.flameTimer += dt;

        // Deal damage on tick
        if (this.timer >= this.interval) {
            this.timer = 0;
            const enemies = levelSpatialHash.getWithinRadius(this.pos, this.radius);
            for (const enemy of enemies) {
                if (distance(this.pos, enemy.pos) <= this.radius) {
                    damageSystem.dealDamage({
                        baseDamage: this.damage,
                        source: this.source,
                        target: enemy,
                        position: enemy.pos
                    });
                }
            }
        }

        // Animate flames
        for (const flame of this.flames) {
            flame.y -= flame.speed * dt * 10;
            if (flame.y < -this.radius * 0.5) {
                flame.y = this.radius * 0.3;
                flame.x = (Math.random() - 0.5) * this.radius;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        const fade = Math.min(1, this.duration * 2);

        // Ground fire gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
        gradient.addColorStop(0, `rgba(255, 150, 50, ${0.5 * fade})`);
        gradient.addColorStop(0.5, `rgba(255, 80, 20, ${0.3 * fade})`);
        gradient.addColorStop(1, `rgba(200, 50, 0, 0)`);

        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Animated flames
        for (const flame of this.flames) {
            const flameHeight = 12 * flame.scale;
            const flameWidth = 6 * flame.scale;

            ctx.save();
            ctx.translate(flame.x, flame.y);

            // Flame shape
            const flameGradient = ctx.createLinearGradient(0, flameHeight, 0, -flameHeight);
            flameGradient.addColorStop(0, `rgba(255, 200, 50, ${fade})`);
            flameGradient.addColorStop(0.5, `rgba(255, 100, 20, ${0.8 * fade})`);
            flameGradient.addColorStop(1, `rgba(255, 50, 0, 0)`);

            ctx.beginPath();
            ctx.moveTo(0, flameHeight);
            ctx.quadraticCurveTo(-flameWidth, 0, 0, -flameHeight);
            ctx.quadraticCurveTo(flameWidth, 0, 0, flameHeight);
            ctx.fillStyle = flameGradient;
            ctx.shadowColor = '#ff6600';
            ctx.shadowBlur = 8;
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    }
}

// ============================================
// INFERNO LASH PROJECTILE - Orbiting fireball that leaves trails
// ============================================
export class InfernoLashProjectile extends OrbitingProjectile {
    private trailTimer: number = 0;
    private trailInterval: number = 0.3;
    private pulseTimer: number = 0;
    private baseDistance: number = 0;

    // Configurable pulsing parameters
    pulseAmplitude: number = 25;  // How far the orb moves in/out
    pulseSpeed: number = 2.5;     // How fast the pulsing happens

    onSpawnTrail?: (zone: BurningTrailZone) => void;
    trailDamage: number = 0;
    trailDurationMultiplier: number = 1.0; // Scales with player duration stat

    update(dt: number) {
        // Store base distance on first update
        if (this.baseDistance === 0) {
            this.baseDistance = this.distance;
        }

        // Pulsing orbit effect
        this.pulseTimer += dt;
        const pulseOffset = Math.sin(this.pulseTimer * this.pulseSpeed) * this.pulseAmplitude;
        this.distance = this.baseDistance + pulseOffset;

        super.update(dt);

        // Leave burning trail
        this.trailTimer += dt;
        if (this.trailTimer >= this.trailInterval) {
            this.trailTimer = 0;
            this.spawnTrail();
        }
    }

    private spawnTrail() {
        if (!this.onSpawnTrail) return;

        const trail = new BurningTrailZone(
            this.pos.x,
            this.pos.y,
            25, // Small fire zone
            1.5 * this.trailDurationMultiplier, // Duration scales with player stat
            this.trailDamage
        );
        trail.source = this.source;
        this.onSpawnTrail(trail);

        // Fire particle effect
        particles.emitHit(this.pos.x, this.pos.y, '#ff6600');
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        ctx.save();
        ctx.translate(this.pos.x - camera.x, this.pos.y - camera.y);

        // Enhanced fireball with glow
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
        gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
        gradient.addColorStop(0.3, 'rgba(255, 200, 50, 0.9)');
        gradient.addColorStop(0.6, 'rgba(255, 100, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(200, 50, 0, 0)');

        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.shadowColor = '#ff6600';
        ctx.shadowBlur = 20;
        ctx.fill();

        // Fire emoji on top
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🔥', 0, 0);

        ctx.restore();
    }
}

export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: (OrbitingProjectile | InfernoLashProjectile)[] = [];

    readonly stats = {
        damage: 15,
        cooldown: 3.0,
        area: 100,
        speed: 3,
        duration: 4,
        count: 2,
        countScaling: 1,
    };

    constructor(owner: Player) {
        super(owner);
        this.baseCooldown = this.stats.cooldown;
        this.damage = this.stats.damage;
    }

    update(dt: number) {
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        this.cooldown -= dt;
        if (this.cooldown <= 0) {
            const count = (this.stats.count || 2) + Math.floor((this.level - 1) * (this.stats.countScaling || 1));
            const duration = this.stats.duration * this.owner.stats.duration;
            const isEvolved = this.evolved;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;

                if (isEvolved) {
                    // Inferno Lash: fireballs that leave burning trails
                    const proj = new InfernoLashProjectile(
                        this.owner,
                        this.stats.area,
                        this.stats.speed,
                        duration,
                        this.damage,
                        '🔥'
                    );
                    proj.angle = angle;
                    proj.source = this;
                    proj.trailDamage = this.damage * 0.3; // 30% damage for trails
                    proj.trailDurationMultiplier = this.owner.stats.duration; // Duration scaling
                    proj.onSpawnTrail = (trail) => {
                        this.onSpawn(trail);
                    };
                    this.onSpawn(proj);
                    this.projectiles.push(proj);
                } else {
                    const proj = new OrbitingProjectile(
                        this.owner,
                        this.stats.area,
                        this.stats.speed,
                        duration,
                        this.damage,
                        '🔥'
                    );
                    proj.angle = angle;
                    proj.source = this;
                    this.onSpawn(proj);
                    this.projectiles.push(proj);
                }
            }

            this.cooldown = this.baseCooldown * this.owner.stats.cooldown + duration;
        }
    }
}

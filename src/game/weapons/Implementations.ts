import { ProjectileWeapon, ZoneWeapon, Zone, BouncingProjectile, ChainLightning, Beam, OrbitingProjectile, LobbedProjectile, DelayedExplosionZone, Projectile, Nanobot, MindBlastZone } from './WeaponTypes';
import { distance, type Vector2 } from '../core/Utils';
import { Weapon } from '../Weapon';
import { Entity } from '../Entity';

// 1. Void Ray
export class VoidRayWeapon extends ProjectileWeapon {
    name = "Void Ray";
    emoji = "🔫";
    description = "Fires a beam at nearest enemy.";
    projectileEmoji = "🟣";
    pierce = 1;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.5;
        this.damage = 15;
        this.speed = 0; // Instant
    }

    fire(target: any) {
        // Instant damage
        const { damage } = (this.owner as any).getDamage(this.damage);
        target.takeDamage(damage);
        this.onDamage(target.pos, damage);

        // Visual beam
        // Glowing purple beam
        const beam = new Beam(this.owner.pos, target.pos, 0.2, '#bd00ff', 4);
        this.onSpawn(beam);
    }
}

// 2. Phantom Slash (replaces Plasma Katana)
export class PhantomSlashWeapon extends Weapon {
    name = "Phantom Slash";
    emoji = "⚔️";
    description = "Instantly cuts random enemies.";

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.5;
        this.damage = 30;
        this.area = 250;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            // Find random targets in range
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < this.area * (this.owner as any).stats.area);

            if (targets.length > 0) {
                // Hit up to 3 + level targets
                const count = 3 + this.level;
                for (let i = 0; i < count; i++) {
                    if (targets.length === 0) break;
                    const idx = Math.floor(Math.random() * targets.length);
                    const target = targets[idx];
                    targets.splice(idx, 1); // Remove to avoid hitting same twice

                    const { damage } = (this.owner as any).getDamage(this.damage);
                    (target as any).takeDamage(damage);
                    this.onDamage(target.pos, damage);

                    // Visual slash
                    const slash = new Zone(target.pos.x, target.pos.y, 40, 0.2, 0, 1, '⚔️');
                    this.onSpawn(slash);
                }
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 3. Drone Support (replaces Autocannon)
import { Drone } from '../entities/Drone';

export class DroneSupportWeapon extends Weapon {
    name = "Drone Support";
    emoji = "🛸";
    description = "Automated defense drone system.";

    drones: Drone[] = [];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 0; // Managed by drones
    }

    update(dt: number, enemies: Entity[]) {
        // Manage drones
        const targetCount = this.level >= 6 ? 3 : 1; // Evolution: 3 drones
        const isEvolved = this.level >= 6;

        if (this.drones.length < targetCount) {
            const drone = new Drone(this.owner, isEvolved, this.drones.length, targetCount);
            drone.onSpawnProjectile = (p) => this.onSpawn(p);
            this.drones.push(drone);
        }

        // Update drones
        this.drones.forEach(d => {
            d.totalDrones = targetCount; // Update total count for formation
            d.isEvolved = isEvolved;
            d.update(dt, enemies);
        });
    }

    upgrade() {
        this.level++;
        // Drones update themselves based on level/evolution status in update()
    }

    draw(ctx: CanvasRenderingContext2D, camera: Vector2) {
        this.drones.forEach(d => d.draw(ctx, camera));
    }
}

// 4. Nanobot Swarm (Reworked)
export class NanobotSwarmWeapon extends Weapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Swarm of nanobots that devour enemies.";
    projectiles: Nanobot[] = [];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 0.2; // Spawn rate
        this.damage = 5;
        this.duration = 4;
    }

    update(dt: number, _enemies: Entity[]) {
        // Clean up dead projectiles
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            // Spawn a nanobot
            const count = 1 + Math.floor(this.level / 3);

            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 50 + Math.random() * 100 * (this.owner as any).stats.area;

                const bot = new Nanobot(
                    this.owner,
                    dist,
                    angle,
                    this.duration * (this.owner as any).stats.duration,
                    (this.owner as any).getDamage(this.damage).damage
                );
                this.onSpawn(bot);
                this.projectiles.push(bot);
            }

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 5. Spore Cloud (Zone)
export class SporeCloudWeapon extends ZoneWeapon {
    name = "Spore Cloud";
    emoji = "🍄";
    description = "Leaves damaging zones.";
    zoneEmoji = "🤢";
    interval = 1; // tick-based damage

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2;
        this.duration = 5;
        this.damage = 10;
        this.area = 50;
    }
}

// 6. Singularity Orb
export class SingularityOrbWeapon extends ProjectileWeapon {
    name = "Singularity Orb";
    emoji = "⚫";
    description = "Slow moving orb of destruction.";
    projectileEmoji = "⚫";
    pierce = 999;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 4;
        this.damage = 50;
        this.speed = 50; // Changed from 100 to 50 (2x slower)
        this.area = 600; // Max range
        this.duration = 12; // 600 / 50 = 12 seconds max travel time
    }
}

// 7. Orbital Strike (replaces Rocket Salvo)
export class OrbitalStrikeWeapon extends Weapon {
    name = "Orbital Strike";
    emoji = "🛰️";
    description = "Calls down random explosions.";

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.0;
        this.damage = 40;
        this.area = 100; // Explosion radius
    }

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            // Check for evolution
            const isEvolved = this.level >= 6; // Assuming level 6 is evolved state based on GameManager logic (it sets level to 6)

            if (isEvolved) {
                // Atomic Bomb Logic
                // Huge area, huge damage, slow fall
                const zone = new DelayedExplosionZone(
                    this.owner.pos.x,
                    this.owner.pos.y, // Target player position (or random?) - let's do random near player but huge
                    400, // Huge radius
                    3.0, // Slow fall
                    (this.owner as any).getDamage(this.damage * 5).damage, // Massive damage
                    '☢️',
                    (pos, amount) => {
                        // Shockwave effect - spawn mini explosions
                        for (let i = 0; i < 5; i++) {
                            const angle = Math.random() * Math.PI * 2;
                            const dist = 100 + Math.random() * 200;
                            const miniZone = new DelayedExplosionZone(
                                pos.x + Math.cos(angle) * dist,
                                pos.y + Math.sin(angle) * dist,
                                60,
                                0.5,
                                amount * 0.2,
                                '💥',
                                (p, a) => this.onDamage(p, a)
                            );
                            this.onSpawn(miniZone);
                        }
                        this.onDamage(pos, amount);
                    }
                );
                this.onSpawn(zone);

                // Very long cooldown for nuke
                this.cooldown = this.baseCooldown * 4 * (this.owner as any).stats.cooldown;
            } else {
                // Standard Logic
                const count = 1 + Math.floor(this.level / 2);

                for (let i = 0; i < count; i++) {
                    const offsetX = (Math.random() - 0.5) * 1000;
                    const offsetY = (Math.random() - 0.5) * 800;

                    const zone = new DelayedExplosionZone(
                        this.owner.pos.x + offsetX,
                        this.owner.pos.y + offsetY,
                        this.area * (this.owner as any).stats.area,
                        1.0,
                        (this.owner as any).getDamage(this.damage).damage,
                        '💥',
                        (pos, amount) => this.onDamage(pos, amount)
                    );
                    this.onSpawn(zone);
                }
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}



// 8. Mind Blast (Reworked)
export class MindBlastWeapon extends Weapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic storm at enemy location.";

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.damage = 20;
        this.area = 120;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;

        if (this.cooldown <= 0) {
            // Find random target
            const targets = enemies.filter(e => distance(this.owner.pos, e.pos) < 600);

            if (targets.length > 0) {
                const target = targets[Math.floor(Math.random() * targets.length)];

                const zone = new MindBlastZone(
                    target.pos.x,
                    target.pos.y,
                    this.area * (this.owner as any).stats.area,
                    (this.owner as any).getDamage(this.damage).damage
                );
                this.onSpawn(zone);

                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 9. Chrono Disc - Bouncing disc that ricochets between enemies
export class ChronoDiscWeapon extends ProjectileWeapon {
    name = "Chrono Disc";
    emoji = "💿";
    description = "Ricochet disc that bounces between enemies.";
    projectileEmoji = "💿";
    pierce = 0; // Doesn't pierce, bounces instead

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.5;
        this.damage = 2.67; // Reduced by 3x from 8
        this.speed = 500;
        this.duration = 5;
    }

    // Override fire to create bouncing projectiles
    fire(target: any) {
        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        dir.x /= len;
        dir.y /= len;

        const speed = this.speed * (this.owner as any).stats.speed;
        const velocity = { x: dir.x * speed, y: dir.y * speed };

        // Bounces = 5 + level (starts at 6 bounces, +1 per level)
        const bounces = 5 + this.level;

        const projectile = new BouncingProjectile(
            this.owner.pos.x,
            this.owner.pos.y,
            velocity,
            this.duration * (this.owner as any).stats.duration,
            (this.owner as any).getDamage(this.damage).damage,
            bounces,
            this.projectileEmoji,
            400 // Bounce range
        );

        this.onSpawn(projectile);
    }

    upgrade() {
        this.level++;
        this.damage *= 1.15; // Smaller damage increase
    }
}


// 10. Acid Pool (replaces Acid Spit)
export class AcidPoolWeapon extends Weapon {
    name = "Acid Pool";
    emoji = "🧪";
    description = "Throws acid flasks that create puddles.";

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.0;
        this.damage = 10;
        this.area = 80;
    }

    update(dt: number, enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            // Find target
            let target: any = null;
            let minDst = Infinity;

            for (const enemy of enemies) {
                const dst = distance(this.owner.pos, enemy.pos);
                if (dst < 500 && dst < minDst) {
                    minDst = dst;
                    target = enemy;
                }
            }

            if (target) {
                const lob = new LobbedProjectile(
                    this.owner.pos.x,
                    this.owner.pos.y,
                    target.pos,
                    0.8, // flight time
                    '🧪'
                );

                lob.onLand = (x, y) => {
                    const zone = new Zone(
                        x, y,
                        this.area * (this.owner as any).stats.area,
                        3.0 * (this.owner as any).stats.duration,
                        (this.owner as any).getDamage(this.damage).damage,
                        0.5, // tick interval
                        '🤢'
                    );
                    this.onSpawn(zone);
                };

                this.onSpawn(lob);
                this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
            }
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
        this.area *= 1.1;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 11. Lightning Chain - Chains between enemies
export class LightningChainWeapon extends ProjectileWeapon {
    name = "Lightning Chain";
    emoji = "⚡";
    description = "Lightning that chains between enemies.";
    projectileEmoji = "⚡";
    pierce = 3; // Number of chains per attack

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.0;
        this.damage = 8; // Increased from 5
        this.speed = 0; // Instant
        this.duration = 0.3;
    }

    fire(target: any) {
        const { damage } = (this.owner as any).getDamage(this.damage);

        // 1. Hit first target immediately
        target.takeDamage(damage);
        this.onDamage(target.pos, damage);

        // 2. Visual beam from player to first target
        const beam = new Beam(this.owner.pos, target.pos, 0.1, '#ffff00', 2);
        this.onSpawn(beam);

        // 3. Start chain logic
        // Bounces = 5 + weapon level
        // If evolved (level >= 6), infinite bounces
        const isEvolved = this.level >= 6;
        const bounces = isEvolved ? 999 : 5 + this.level;
        const maxChainLength = isEvolved ? 10000 : 800; // Practically infinite for evolved

        const chain = new ChainLightning(target.pos.x, target.pos.y, damage, bounces, maxChainLength);
        chain.hitEnemies.add(target); // Don't hit first target again

        chain.onHit = (t: any, d: number) => {
            t.takeDamage(d);
            this.onDamage(t.pos, d);
        };

        this.onSpawn(chain);
    }


    upgrade() {
        this.level++;
        this.damage *= 1.2;
        // Bounces increase automatically via level usage in fire()
    }
}

// 12. Spinning Ember (replaces Flame Whip)
export class SpinningEmberWeapon extends Weapon {
    name = "Spinning Ember";
    emoji = "🔥";
    description = "Fireballs that orbit you.";
    projectiles: OrbitingProjectile[] = [];

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3.0;
        this.damage = 15;
    }

    update(dt: number, _enemies: Entity[]) {
        // Check if projectiles are dead
        this.projectiles = this.projectiles.filter(p => !p.isDead);

        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            // Spawn set of projectiles
            const count = 2 + this.level;
            const duration = 4 * (this.owner as any).stats.duration;

            for (let i = 0; i < count; i++) {
                const angle = (Math.PI * 2 / count) * i;
                const proj = new OrbitingProjectile(
                    this.owner,
                    100, // distance
                    3, // rotation speed
                    duration,
                    (this.owner as any).getDamage(this.damage).damage,
                    '🔥'
                );
                proj.angle = angle; // Set initial angle
                this.onSpawn(proj);
                this.projectiles.push(proj);
            }

            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown + duration; // Cooldown starts after duration? Or overlap? Let's make it wait.
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 13. Frost Nova - Freezing zone weapon
export class FrostNovaWeapon extends Weapon {
    name = "Frost Nova";
    emoji = "❄️";
    description = "Throws freezing grenades.";

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 2.5;
        this.damage = 8;
        this.area = 120;
    }

    update(dt: number, _enemies: Entity[]) {
        const speedBoost = (this.owner as any).weaponSpeedBoost || 1;
        const timeSpeed = (this.owner as any).stats.timeSpeed || 1;
        this.cooldown -= dt * speedBoost * timeSpeed;
        if (this.cooldown <= 0) {
            // Throw at random position near player
            const range = 400;
            const offsetX = (Math.random() - 0.5) * 2 * range;
            const offsetY = (Math.random() - 0.5) * 2 * range;
            const target = { x: this.owner.pos.x + offsetX, y: this.owner.pos.y + offsetY };

            const lob = new LobbedProjectile(
                this.owner.pos.x,
                this.owner.pos.y,
                target,
                0.6,
                '❄️'
            );

            lob.onLand = (x, y) => {
                const zone = new Zone(
                    x, y,
                    this.area * (this.owner as any).stats.area,
                    3.0 * (this.owner as any).stats.duration,
                    (this.owner as any).getDamage(this.damage).damage,
                    0.5,
                    '❄️',
                    0.5 // 50% slow
                );
                this.onSpawn(zone);
            };

            this.onSpawn(lob);
            this.cooldown = this.baseCooldown * (this.owner as any).stats.cooldown;
        }
    }

    upgrade() {
        this.level++;
        this.damage *= 1.2;
        this.area *= 1.1;
    }

    draw(_ctx: CanvasRenderingContext2D, _camera: Vector2) { }
}

// 14. Fan of Knives (replaces Shadow Daggers)
export class FanOfKnivesWeapon extends ProjectileWeapon {
    name = "Fan of Knives";
    emoji = "🗡️";
    description = "Fires a spread of knives.";
    projectileEmoji = "🗡️";
    pierce = 2;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 1.5;
        this.damage = 12;
        this.speed = 700;
        this.duration = 1.5;
    }

    fire(target: any) {
        // Fire multiple projectiles in a cone
        const count = 3 + Math.floor(this.level / 2);
        const spread = Math.PI / 4; // 45 degrees spread

        const dir = { x: target.pos.x - this.owner.pos.x, y: target.pos.y - this.owner.pos.y };
        const baseAngle = Math.atan2(dir.y, dir.x);

        for (let i = 0; i < count; i++) {
            // Map i to -spread/2 to +spread/2
            const offset = count > 1 ? -spread / 2 + (spread / (count - 1)) * i : 0;
            const angle = baseAngle + offset;

            const velocity = {
                x: Math.cos(angle) * this.speed * (this.owner as any).stats.speed,
                y: Math.sin(angle) * this.speed * (this.owner as any).stats.speed
            };

            const proj = new Projectile(
                this.owner.pos.x,
                this.owner.pos.y,
                velocity,
                this.duration * (this.owner as any).stats.duration,
                (this.owner as any).getDamage(this.damage).damage,
                this.pierce,
                this.projectileEmoji
            );
            this.onSpawn(proj);
        }
    }
}


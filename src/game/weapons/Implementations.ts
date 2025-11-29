import { ProjectileWeapon, ZoneWeapon, Zone, BouncingProjectile, ChainLightning, Beam, OrbitingProjectile, LobbedProjectile, DelayedExplosionZone, Projectile } from './WeaponTypes';
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
        const dmg = this.damage * (this.owner as any).stats.might;
        target.takeDamage(dmg);
        this.onDamage(target.pos, dmg);

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
        this.cooldown -= dt * ((this.owner as any).weaponSpeedBoost || 1);
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

                    const dmg = this.damage * (this.owner as any).stats.might;
                    (target as any).takeDamage(dmg);
                    this.onDamage(target.pos, dmg);

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
export class DroneSupportWeapon extends ProjectileWeapon {
    name = "Drone Support";
    emoji = "🛸";
    description = "Automated defense drone system.";
    projectileEmoji = "🔹";
    pierce = 1;

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 0.5;
        this.damage = 10;
        this.speed = 600;
        this.duration = 2;
    }

    // Override fire to shoot from an offset
    fire(target: any) {
        // Simulate drone position (orbiting or fixed offset)
        const time = Date.now() / 1000;
        const offset = {
            x: Math.cos(time) * 50,
            y: Math.sin(time) * 50 - 50
        };
        const dronePos = {
            x: this.owner.pos.x + offset.x,
            y: this.owner.pos.y + offset.y
        };

        const dir = { x: target.pos.x - dronePos.x, y: target.pos.y - dronePos.y };
        const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
        const velocity = { x: (dir.x / len) * this.speed, y: (dir.y / len) * this.speed };

        const proj = new Projectile(
            dronePos.x,
            dronePos.y,
            velocity,
            this.duration,
            this.damage * (this.owner as any).stats.might,
            this.pierce,
            this.projectileEmoji
        );
        this.onSpawn(proj);
    }
}

// 4. Nanobot Swarm (Zone)
export class NanobotSwarmWeapon extends ZoneWeapon {
    name = "Nanobot Swarm";
    emoji = "🦠";
    description = "Damaging aura around player.";
    zoneEmoji = "🌫️";
    interval = 1; // tick-based damage

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.duration = 2;
        this.damage = 5;
        this.area = 80;
    }
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
        this.cooldown -= dt * ((this.owner as any).weaponSpeedBoost || 1);
        if (this.cooldown <= 0) {
            // Spawn 1 + level/2 strikes
            const count = 1 + Math.floor(this.level / 2);

            for (let i = 0; i < count; i++) {
                // Random position on screen (approx +/- 500 from player)
                const offsetX = (Math.random() - 0.5) * 1000;
                const offsetY = (Math.random() - 0.5) * 800;

                const zone = new DelayedExplosionZone(
                    this.owner.pos.x + offsetX,
                    this.owner.pos.y + offsetY,
                    this.area * (this.owner as any).stats.area,
                    1.0, // 1 second delay
                    this.damage * (this.owner as any).stats.might,
                    '💥'
                );
                this.onSpawn(zone);
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



// 8. Mind Blast (Zone)
export class MindBlastWeapon extends ZoneWeapon {
    name = "Mind Blast";
    emoji = "🧠";
    description = "Psionic storm at enemy location.";
    zoneEmoji = "🌀";
    interval = 0.2; // Fast ticks

    constructor(owner: any) {
        super(owner);
        this.baseCooldown = 3;
        this.duration = 1.5; // Lasts longer
        this.damage = 5; // Lower damage per tick, but many ticks
        this.area = 120;
    }
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
            this.damage * (this.owner as any).stats.might,
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
        this.cooldown -= dt * ((this.owner as any).weaponSpeedBoost || 1);
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
                        this.damage * (this.owner as any).stats.might,
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
        const dmg = this.damage * (this.owner as any).stats.might;

        // 1. Hit first target immediately
        target.takeDamage(dmg);
        this.onDamage(target.pos, dmg);

        // 2. Visual beam from player to first target
        const beam = new Beam(this.owner.pos, target.pos, 0.1, '#ffff00', 2);
        this.onSpawn(beam);

        // 3. Start chain logic
        // Bounces = 5 + weapon level
        const bounces = 5 + this.level;
        const maxChainLength = 800; // Maximum total chain length

        const chain = new ChainLightning(target.pos.x, target.pos.y, dmg, bounces, maxChainLength);
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

        this.cooldown -= dt * ((this.owner as any).weaponSpeedBoost || 1);
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
                    this.damage * (this.owner as any).stats.might,
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
        this.cooldown -= dt * ((this.owner as any).weaponSpeedBoost || 1);
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
                    this.damage * (this.owner as any).stats.might,
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
                this.damage * (this.owner as any).stats.might,
                this.pierce,
                this.projectileEmoji
            );
            this.onSpawn(proj);
        }
    }
}

